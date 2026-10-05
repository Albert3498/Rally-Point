import os
import sys
import tempfile
import json
from datetime import datetime, timedelta, UTC
from pathlib import Path

_UPLOAD_STORAGE = tempfile.TemporaryDirectory()
os.environ["DATABASE_PATH"] = str(Path(tempfile.mkdtemp()) / "test.db")
os.environ.setdefault("EVENT_IMAGE_UPLOAD_DIR", str(Path(_UPLOAD_STORAGE.name) / "event-images"))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-that-is-long-enough-for-hs256")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("JWT_EXPIRATION_MINUTES", "30")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import sqlite3
import pytest
from fastapi.testclient import TestClient
from main import app
from Authentification import DB_PATH

client = TestClient(app)


def make_user(name, role="user"):
    r = client.post("/register/", json={
        "name": name, "password": "pw",
        "birthdate": (datetime.now(UTC) - timedelta(days=16 * 365 + 10)).date().isoformat(),  # age 16
        "city": "Berlin", "country": "Germany", "aptitudes": [],
    })
    assert 200 == r.status_code, r.text
    if role != "user":
        with sqlite3.connect(DB_PATH) as c:
            c.execute("UPDATE userdata SET role=? WHERE name=?", (role, name))
    token = client.post("/login/", json={"name": name, "password": "pw"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def alice():
    return make_user("Alice Tester", role="organization")


@pytest.fixture(scope="module")
def bob():
    return make_user("Bob Tester", role="organization")

@pytest.fixture(scope="module")
def student():
    return make_user("Student Tester")

@pytest.fixture(scope="module")
def admin():
    return make_user("Admin Tester", role="admin")


def payload(**overrides):
    start = datetime.now(UTC) + timedelta(days=7)
    body = {
        "title": "  Beach cleanup  ",
        "description": "Help us clean the local beach together.",
        "category": "environment",
        "start_datetime": start.isoformat(),
        "end_datetime": (start + timedelta(hours=3)).isoformat(),
        "location": "North Beach",
        "volunteers_needed": 10,
        "volunteer_tasks": "Collect litter and sort recycling.",
        "organizer_name": "Green Team",
        "contact_email": "team@example.com",
    }
    body.update(overrides)
    return body


def error_fields(response):
    return {e["loc"][-1] for e in response.json()["detail"]}


def submit(headers, **overrides):
    r = client.post("/event-requests/", json=payload(**overrides), headers=headers)
    assert 201 == r.status_code, r.text
    return r.json()


# --- validation ---
def test_submit_success_sets_server_fields_and_trims(alice):
    data = submit(alice, contact_phone="   ")
    assert data["status"] == "pending"
    assert data["title"] == "Beach cleanup"
    assert data["contact_phone"] is None
    assert data["requester_id"] > 0 and data["created_at"] and data["updated_at"]


def test_uploaded_event_image_is_stored_and_served(alice, admin):
    png = b"\x89PNG\r\n\x1a\n" + b"valid-test-image"
    response = client.post(
        "/event-requests/",
        headers=alice,
        data={"data": json.dumps(payload())},
        files={"image": ("event.png", png, "image/png")},
    )
    assert response.status_code == 201, response.text
    request = response.json()
    assert request["image_url"].startswith("/uploads/")
    image = client.get(request["image_url"])
    assert image.status_code == 200 and image.content == png

    approved = client.patch(
        f"/admin/event-requests/{request['id']}/review/",
        headers=admin,
        json={"status": "approved"},
    )
    assert approved.status_code == 200, approved.text
    published = client.get("/published-events/")
    assert published.status_code == 200
    event = next(event for event in published.json() if event["id"] == request["id"])
    assert event["image_url"] == request["image_url"]


def test_uploaded_event_image_rejects_mismatched_content(alice):
    response = client.post(
        "/event-requests/",
        headers=alice,
        data={"data": json.dumps(payload())},
        files={"image": ("event.png", b"not a png", "image/png")},
    )
    assert response.status_code == 415


def test_uploaded_event_image_rejects_oversized_file(alice):
    response = client.post(
        "/event-requests/",
        headers=alice,
        data={"data": json.dumps(payload())},
        files={"image": ("event.png", b"\x89PNG\r\n\x1a\n" + b"x" * (5 * 1024 * 1024), "image/png")},
    )
    assert response.status_code == 413


def test_public_feed_excludes_pending_requests(alice):
    created = submit(alice)
    published = client.get("/published-events/")
    assert published.status_code == 200
    assert created["id"] not in {event["id"] for event in published.json()}


def test_requires_authentication():
    assert client.post("/event-requests/", json=payload()).status_code in (401, 403)


def test_students_cannot_submit_event_requests(student):
    r = client.post("/event-requests/", headers=student, json=payload())
    assert 403 == r.status_code


def test_admins_cannot_submit_event_requests(admin):
    r = client.post("/event-requests/", headers=admin, json=payload())
    assert 403 == r.status_code


def test_students_cannot_view_my_event_requests(student):
    r = client.get("/event-requests/me/", headers=student)
    assert 403 == r.status_code


def test_start_in_past_is_rejected(alice):
    past = datetime.now(UTC) - timedelta(days=1)
    r = client.post("/event-requests/", headers=alice, json=payload(
        start_datetime=past.isoformat(), end_datetime=(past + timedelta(hours=1)).isoformat()))
    assert 422 == r.status_code and "start_datetime" in error_fields(r)


def test_end_before_start_is_rejected(alice):
    start = datetime.now(UTC) + timedelta(days=2)
    r = client.post("/event-requests/", headers=alice, json=payload(
        start_datetime=start.isoformat(), end_datetime=(start - timedelta(hours=1)).isoformat()))
    assert 422 == r.status_code and "end_datetime" in error_fields(r)


def test_naive_datetime_is_rejected(alice):
    naive = (datetime.now() + timedelta(days=3)).replace(tzinfo=None).isoformat()
    r = client.post("/event-requests/", headers=alice, json=payload(start_datetime=naive))
    assert 422 == r.status_code and "start_datetime" in error_fields(r)


@pytest.mark.parametrize("field,value", [
    ("title", "    "), ("title", "abcd"), ("description", "too short"),
    ("location", " ab "), ("volunteer_tasks", "short"), ("organizer_name", " x "),
    ("volunteers_needed", 0), ("category", "party"), ("contact_email", "not-an-email"),
])
def test_invalid_field_reports_that_field(alice, field, value):
    r = client.post("/event-requests/", headers=alice, json=payload(**{field: value}))
    assert 422 == r.status_code and field in error_fields(r)


@pytest.mark.parametrize("field,value", [
    ("requester_id", 999), ("status", "approved"), ("review_note", "x"), ("id", 1),
])
def test_server_fields_cannot_be_set_by_client(alice, field, value):
    r = client.post("/event-requests/", headers=alice, json=payload(**{field: value}))
    assert 422 == r.status_code and field in error_fields(r)


# --- ownership ---
def test_user_lists_only_own_requests(alice, bob):
    mine = submit(bob, title="Bob's own event")
    alice_ids = {r["id"] for r in client.get("/event-requests/me/", headers=alice).json()}
    bob_ids = {r["id"] for r in client.get("/event-requests/me/", headers=bob).json()}
    assert mine["id"] in bob_ids and mine["id"] not in alice_ids


def test_user_cannot_view_someone_elses_request(alice, bob):
    bobs = submit(bob, title="Bob's private event")
    assert 200 == client.get(f"/event-requests/{bobs['id']}/", headers=bob).status_code
    assert 404 == client.get(f"/event-requests/{bobs['id']}/", headers=alice).status_code


# --- admin permissions ---
def test_non_admin_cannot_use_admin_endpoints(alice):
    created = submit(alice)
    assert 403 == client.get("/admin/event-requests/", headers=alice).status_code
    r = client.patch(f"/admin/event-requests/{created['id']}/review/",
                     headers=alice, json={"status": "approved"})
    assert 403 == r.status_code
    assert client.get(f"/event-requests/{created['id']}/", headers=alice).json()["status"] == "pending"


def test_admin_lists_all_and_filters_by_status(alice, bob, admin):
    mine, theirs = submit(alice), submit(bob)
    everything = client.get("/admin/event-requests/", headers=admin).json()
    assert {mine["id"], theirs["id"]} <= {r["id"] for r in everything}
    pending = client.get("/admin/event-requests/?status=pending", headers=admin).json()
    assert all(r["status"] == "pending" for r in pending)


def test_admin_approves_and_rejects_with_note(alice, admin):
    a, b = submit(alice), submit(alice)
    ok = client.patch(f"/admin/event-requests/{a['id']}/review/", headers=admin,
                      json={"status": "approved", "review_note": " Looks good "})
    assert 200 == ok.status_code
    assert ok.json()["status"] == "approved" and ok.json()["review_note"] == "Looks good"
    no = client.patch(f"/admin/event-requests/{b['id']}/review/", headers=admin,
                      json={"status": "rejected", "review_note": "Duplicate"})
    assert no.json()["status"] == "rejected"


def test_cannot_review_twice_or_set_pending(alice, admin):
    created = submit(alice)
    url = f"/admin/event-requests/{created['id']}/review/"
    assert 422 == client.patch(url, headers=admin, json={"status": "pending"}).status_code
    assert 200 == client.patch(url, headers=admin, json={"status": "approved"}).status_code
    assert 409 == client.patch(url, headers=admin, json={"status": "rejected"}).status_code


def test_review_unknown_request_is_404(admin):
    r = client.patch("/admin/event-requests/99999/review/", headers=admin, json={"status": "approved"})
    assert 404 == r.status_code
