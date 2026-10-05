"""Shared setup for the adversarial test files. Import this before importing `main`."""
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta, UTC
from pathlib import Path

os.environ.setdefault("DATABASE_PATH", str(Path(tempfile.mkdtemp()) / "test.db"))
_UPLOAD_STORAGE = tempfile.TemporaryDirectory()
os.environ.setdefault("EVENT_IMAGE_UPLOAD_DIR", str(Path(_UPLOAD_STORAGE.name) / "event-images"))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-that-is-long-enough-for-hs256")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("JWT_EXPIRATION_MINUTES", "30")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402
from Authentification import DB_PATH  # noqa: E402

# raise_server_exceptions=False so a crash shows up as an honest HTTP 500
client = TestClient(app, raise_server_exceptions=False)


def birthdate_for_age(years, extra_days=0):
    """ISO birthdate of someone who turned `years` today (minus `extra_days` = older by that many days)."""
    today = datetime.now(UTC).date()
    try:
        born = today.replace(year=today.year - years)
    except ValueError:  # today is Feb 29
        born = today.replace(year=today.year - years, day=28)
    return (born - timedelta(days=extra_days)).isoformat()


def registration(name, password="pw-12345", **overrides):
    body = {
        "name": name, "password": password, "birthdate": birthdate_for_age(16),
        "city": "Berlin", "country": "Germany", "aptitudes": [],
    }
    body.update(overrides)
    return body


def make_user(name, role="user", password="pw-12345"):
    r = client.post("/register/", json=registration(name, password))
    assert r.status_code == 200, f"setup failed registering {name!r}: {r.status_code} {r.text}"
    if role != "user":
        set_role(name, role)
    return login(name, password)


def login(name, password="pw-12345"):
    r = client.post("/login/", json={"name": name, "password": password})
    assert r.status_code == 200, f"setup failed logging in {name!r}: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def set_role(name, role):
    with sqlite3.connect(DB_PATH) as c:
        c.execute("UPDATE userdata SET role=? WHERE name=?", (role, name))


def delete_user(name):
    with sqlite3.connect(DB_PATH) as c:
        c.execute("DELETE FROM userdata WHERE name=?", (name,))


def event_payload(**overrides):
    start = datetime.now(UTC) + timedelta(days=7)
    body = {
        "title": "Community garden day",
        "description": "Help plant vegetables in the shared community garden.",
        "category": "community",
        "start_datetime": start.isoformat(),
        "end_datetime": (start + timedelta(hours=3)).isoformat(),
        "location": "Town Park",
        "volunteers_needed": 5,
        "volunteer_tasks": "Dig beds, plant seedlings and water them.",
        "organizer_name": "Garden Club",
        "contact_email": "garden@example.com",
    }
    body.update(overrides)
    return body
