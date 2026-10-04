import logging
import sqlite3

import requests
from fastapi import APIRouter, Depends, HTTPException
from event_requests import require_admin
from events_store import (
    PUBLIC_EVENT_COLUMNS,
    connect_events_db,
    initialize_events_db,
)

router = APIRouter(prefix="/events", tags=["Automatic Events"])
logger = logging.getLogger(__name__)

IMPACT_VOLUNTEER_API = "https://impactvolunteer.com/api/public/volunteer-projects?limit=100"
SOURCE = "impact_volunteer"


def map_project(project: dict) -> dict:
    external_id = project.get("id")
    title = project.get("title") or project.get("name")
    if external_id is None or not isinstance(title, str) or not title.strip():
        raise HTTPException(status_code=502, detail="Provider returned a project without an id or title")
    return {
        "external_id": str(external_id),
        "title": title.strip(),
        "city": project.get("city"),
        "country": project.get("country"),
        "date": project.get("start_date") or project.get("date"),
        "pay_type": project.get("pay_type"),
        "pay": project.get("pay", 0),
        "action": project.get("category") or project.get("action"),
        "accessibility": project.get("accessibility"),
        "language": project.get("language"),
    }


@router.post("/automatic-sync", dependencies=[Depends(require_admin)])
def sync_automatic_events():
    """
    Fetch provider projects and upsert them into the database used by /events/.
    """
    try:
        response = requests.get(IMPACT_VOLUNTEER_API, timeout=10)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as e:
        logger.error("Failed to fetch external volunteer projects: %s", e)
        raise HTTPException(status_code=502, detail=f"External API error: {e}")
    except ValueError as e:
        raise HTTPException(status_code=502, detail="Provider returned invalid JSON") from e

    if isinstance(payload, dict):
        if payload.get("success") is False:
            raise HTTPException(status_code=502, detail="Provider reported an unsuccessful response")
        projects = payload.get("data", payload.get("projects"))
    else:
        projects = payload
    if not isinstance(projects, list):
        raise HTTPException(status_code=502, detail="Provider response does not contain a project list")

    events = []
    for project in projects:
        if not isinstance(project, dict):
            raise HTTPException(status_code=502, detail="Provider returned an invalid project record")
        events.append(map_project(project))

    initialize_events_db()
    conn = connect_events_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        for event in events:
            existing = conn.execute(
                "SELECT id FROM events WHERE source=? AND external_id=?",
                (SOURCE, event["external_id"]),
            ).fetchone()
            values = (
                event["title"], event["city"], event["country"], event["date"],
                event["pay_type"], event["pay"], event["action"],
                event["accessibility"], event["language"],
            )
            if existing:
                conn.execute(
                    "UPDATE events SET title=?,city=?,country=?,date=?,pay_type=?,pay=?,"
                    "action=?,accessibility=?,language=? WHERE id=?",
                    (*values, existing[0]),
                )
            else:
                conn.execute(
                    "INSERT INTO events "
                    "(title,city,country,date,pay_type,pay,action,accessibility,language,source,external_id) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (*values, SOURCE, event["external_id"]),
                )
        conn.commit()
        cursor = conn.execute(
            f"SELECT {PUBLIC_EVENT_COLUMNS} FROM events WHERE source=? ORDER BY id",
            (SOURCE,),
        )
        stored_events = [dict(zip(PUBLIC_EVENT_COLUMNS.split(", "), row)) for row in cursor.fetchall()]
    except sqlite3.Error as e:
        conn.rollback()
        logger.exception("Failed to persist automatic events")
        raise HTTPException(status_code=500, detail="Could not save automatic events") from e
    finally:
        conn.close()

    return {"status": "success", "count": len(events), "events": stored_events}