import os
import sys
import tempfile
from datetime import datetime, timedelta, UTC
from pathlib import Path

os.environ["DATABASE_PATH"] = str(Path(tempfile.mkdtemp()) / "test.db")
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
        "name": name, "password": "pw", "birthdate": "2000-01-01",
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
    return make_user("Alice Tester")


@pytest.fixture(scope="module")
def bob():
    return make_user("Bob Tester")


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


def test_requires_authentication():
    assert client.post("/event-requests/", json=payload()).status_code in (401, 403)


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
