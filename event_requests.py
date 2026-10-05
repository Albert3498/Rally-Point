import json
import os
import secrets
import sqlite3
from datetime import datetime, UTC
from enum import Enum
from pathlib import Path
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import (
    AwareDatetime, BaseModel, ConfigDict, EmailStr, PositiveInt,
    StringConstraints, ValidationError, field_validator,
)
from fastapi.exceptions import RequestValidationError
from starlette.datastructures import UploadFile as StarletteUploadFile
from Authentification import DB_PATH, get_current_user, get_db

event_router = APIRouter()
UPLOAD_DIR = Path(os.environ.get(
    "EVENT_IMAGE_UPLOAD_DIR",
    str(Path(__file__).resolve().parent / "uploads" / "event-images"),
))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (".webp", lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP"),
}

with sqlite3.connect(DB_PATH) as setup_conn:
    setup_conn.execute("""
        CREATE TABLE IF NOT EXISTS event_requests(
            id INTEGER PRIMARY KEY,
            requester_id INTEGER NOT NULL REFERENCES userdata(id),
            title VARCHAR(150) NOT NULL,
            description TEXT NOT NULL,
            category VARCHAR(50) NOT NULL,
            start_datetime TEXT NOT NULL,
            end_datetime TEXT NOT NULL,
            location VARCHAR(300) NOT NULL,
            volunteers_needed INTEGER NOT NULL,
            volunteer_tasks TEXT NOT NULL,
            organizer_name VARCHAR(150) NOT NULL,
            contact_email VARCHAR(255) NOT NULL,
            contact_phone TEXT,
            requirements TEXT,
            additional_notes TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','approved','rejected')),
            review_note TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            image_filename TEXT
        )
    """)
    columns = {row[1] for row in setup_conn.execute("PRAGMA table_info(event_requests)")}
    if "image_filename" not in columns:
        setup_conn.execute("ALTER TABLE event_requests ADD COLUMN image_filename TEXT")
    setup_conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_event_requests_requester ON event_requests(requester_id)"
    )

COLUMNS = (
    "id,requester_id,title,description,category,start_datetime,end_datetime,location,"
    "volunteers_needed,volunteer_tasks,organizer_name,contact_email,contact_phone,"
    "requirements,additional_notes,status,review_note,created_at,updated_at,image_filename"
)


class Category(str, Enum):
    environment = "environment"
    education = "education"
    community = "community"
    animal_welfare = "animal_welfare"
    charity = "charity"
    other = "other"


Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=150)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=5000)]
Location = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)]
VolunteerTasks = Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=3000)]
OrganizerName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=150)]
ReviewNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class EventRequestCreate(BaseModel):
    # extra="forbid" rejects client-supplied requester_id, status, etc.
    model_config = ConfigDict(extra="forbid")

    title: Title
    description: Description
    category: Category
    start_datetime: AwareDatetime
    end_datetime: AwareDatetime
    location: Location
    volunteers_needed: PositiveInt
    volunteer_tasks: VolunteerTasks
    organizer_name: OrganizerName
    contact_email: EmailStr
    contact_phone: str | None = None
    requirements: str | None = None
    additional_notes: str | None = None

    @field_validator("contact_phone", "requirements", "additional_notes")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("start_datetime")
    @classmethod
    def start_in_future(cls, value: datetime) -> datetime:
        if value <= datetime.now(UTC):
            raise ValueError("start_datetime must be in the future")
        return value

    @field_validator("end_datetime")
    @classmethod
    def end_after_start(cls, value: datetime, info) -> datetime:
        start = info.data.get("start_datetime")
        if start is not None and value <= start:
            raise ValueError("end_datetime must be after start_datetime")
        return value


class EventRequestOut(BaseModel):
    id: int
    requester_id: int
    title: str
    description: str
    category: Category
    start_datetime: datetime
    end_datetime: datetime
    location: str
    volunteers_needed: int
    volunteer_tasks: str
    organizer_name: str
    contact_email: str
    contact_phone: str | None
    requirements: str | None
    additional_notes: str | None
    status: Literal["pending", "approved", "rejected"]
    review_note: str | None
    created_at: datetime
    updated_at: datetime
    image_url: str | None


class ReviewDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["approved", "rejected"]
    review_note: ReviewNote | None = None


def row_to_out(row: tuple) -> EventRequestOut:
    data = dict(zip(COLUMNS.split(","), row))
    image_filename = data.pop("image_filename")
    data["image_url"] = f"/uploads/{image_filename}" if image_filename else None
    return EventRequestOut(**data)


def store_image(image: StarletteUploadFile) -> str:
    image_type = IMAGE_TYPES.get(image.content_type or "")
    if image_type is None:
        raise HTTPException(status_code=415, detail="Image must be JPEG, PNG, or WebP.")

    data = image.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 5 MB or smaller.")
    extension, matches_signature = image_type
    if not matches_signature(data):
        raise HTTPException(status_code=415, detail="Image content does not match its file type.")

    filename = secrets.token_hex(16) + extension
    (UPLOAD_DIR / filename).write_bytes(data)
    return filename


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def get_current_account(
    payload: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Resolve the token's user to a DB row so id and role are always current."""
    row = db.execute("SELECT id,role FROM userdata WHERE name=?", (payload["sub"],)).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="user no longer exists")
    return {"id": row[0], "role": row[1]}


def require_admin(account: dict = Depends(get_current_account)) -> dict:
    if account["role"] != "admin":
        raise HTTPException(status_code=403, detail="admin access required")
    return account


def require_organization(account: dict = Depends(get_current_account)) -> dict:
    if account["role"] != "organization":
        raise HTTPException(status_code=403, detail="organization access required")
    return account


@event_router.post("/event-requests/", status_code=201, response_model=EventRequestOut)
async def submit_event_request(
    request: Request,
    account: dict = Depends(require_organization),
    db: sqlite3.Connection = Depends(get_db),
):
    image = None
    if request.headers.get("content-type", "").startswith("multipart/form-data"):
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > MAX_IMAGE_BYTES + 1024 * 1024:
            raise HTTPException(status_code=413, detail="Request must be 6 MB or smaller.")
        form = await request.form()
        data = form.get("data")
        uploaded = form.get("image")
        if not isinstance(data, str):
            raise HTTPException(status_code=422, detail="Event data is required.")
        if uploaded is not None and not isinstance(uploaded, StarletteUploadFile):
            raise HTTPException(status_code=422, detail="Image upload is invalid.")
        image = uploaded
        try:
            data = json.loads(data)
        except json.JSONDecodeError as err:
            raise HTTPException(status_code=400, detail="Invalid event data.") from err
    else:
        try:
            data = await request.json()
        except ValueError as err:
            raise HTTPException(status_code=400, detail="Invalid JSON request body.") from err
    try:
        event = EventRequestCreate.model_validate(data)
    except ValidationError as err:
        raise RequestValidationError(err.errors(include_context=False)) from err

    image_filename = store_image(image) if image else None
    now = now_iso()
    try:
        cur = db.execute(
            "INSERT INTO event_requests(requester_id,title,description,category,start_datetime,"
            "end_datetime,location,volunteers_needed,volunteer_tasks,organizer_name,contact_email,"
            "contact_phone,requirements,additional_notes,status,created_at,updated_at,image_filename) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?)",
            (
                account["id"], event.title, event.description, event.category.value,
                event.start_datetime.astimezone(UTC).isoformat(),
                event.end_datetime.astimezone(UTC).isoformat(),
                event.location, event.volunteers_needed, event.volunteer_tasks,
                event.organizer_name, event.contact_email, event.contact_phone,
                event.requirements, event.additional_notes, now, now, image_filename,
            ),
        )
        db.commit()
    except Exception:
        if image_filename:
            (UPLOAD_DIR / image_filename).unlink(missing_ok=True)
        raise
    row = db.execute(f"SELECT {COLUMNS} FROM event_requests WHERE id=?", (cur.lastrowid,)).fetchone()
    return row_to_out(row)


@event_router.get("/event-requests/me/", response_model=list[EventRequestOut])
def list_my_event_requests(
    account: dict = Depends(require_organization),
    db: sqlite3.Connection = Depends(get_db),
):
    rows = db.execute(
        f"SELECT {COLUMNS} FROM event_requests WHERE requester_id=? ORDER BY created_at DESC,id DESC",
        (account["id"],),
    ).fetchall()
    return [row_to_out(r) for r in rows]


@event_router.get("/event-requests/{request_id}/", response_model=EventRequestOut)
def get_my_event_request(
    request_id: int,
    account: dict = Depends(require_organization),
    db: sqlite3.Connection = Depends(get_db),
):
    row = db.execute(
        f"SELECT {COLUMNS} FROM event_requests WHERE id=? AND requester_id=?",
        (request_id, account["id"]),
    ).fetchone()
    # 404 (not 403) so other users' request ids are not revealed
    if row is None:
        raise HTTPException(status_code=404, detail="event request not found")
    return row_to_out(row)


@event_router.get("/published-events/", response_model=list[EventRequestOut])
def list_published_events(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        f"SELECT {COLUMNS} FROM event_requests WHERE status='approved' "
        "ORDER BY start_datetime,id"
    ).fetchall()
    return [row_to_out(row) for row in rows]


@event_router.get(
    "/admin/event-requests/",
    response_model=list[EventRequestOut],
    dependencies=[Depends(require_admin)],
)
def admin_list_event_requests(
    status: Literal["pending", "approved", "rejected"] | None = None,
    db: sqlite3.Connection = Depends(get_db),
):
    query = f"SELECT {COLUMNS} FROM event_requests"
    params: list = []
    if status:
        query += " WHERE status=?"
        params.append(status)
    rows = db.execute(query + " ORDER BY created_at DESC,id DESC", params).fetchall()
    return [row_to_out(r) for r in rows]


@event_router.patch(
    "/admin/event-requests/{request_id}/review/",
    response_model=EventRequestOut,
    dependencies=[Depends(require_admin)],
)
def review_event_request(
    request_id: int,
    decision: ReviewDecision,
    db: sqlite3.Connection = Depends(get_db),
):
    # status='pending' in the WHERE makes the review atomic: only one reviewer can win
    cur = db.execute(
        "UPDATE event_requests SET status=?,review_note=?,updated_at=? WHERE id=? AND status='pending'",
        (decision.status, decision.review_note or None, now_iso(), request_id),
    )
    db.commit()
    if cur.rowcount == 0:
        exists = db.execute("SELECT 1 FROM event_requests WHERE id=?", (request_id,)).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="event request not found")
        raise HTTPException(status_code=409, detail="only pending requests can be reviewed")
    row = db.execute(f"SELECT {COLUMNS} FROM event_requests WHERE id=?", (request_id,)).fetchone()
    return row_to_out(row)
