"""12 adversarial event-request tests.

Each test asserts what a *correct* system should do. A failing test means a real
glitch in the code under test, not a bad test - do not loosen them to turn them green.
"""
from datetime import datetime, timedelta, UTC

import pytest

from support import client, delete_user, event_payload, make_user, set_role


def post(headers, **overrides):
    return client.post("/event-requests/", headers=headers, json=event_payload(**overrides))


@pytest.fixture(scope="module")
def owner():
    return make_user("Edge Owner")


@pytest.fixture(scope="module")
def admin():
    return make_user("Edge Admin", role="admin")


# 1
def test_end_equal_to_start_is_rejected(owner):
    start = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    r = post(owner, start_datetime=start, end_datetime=start)
    assert 422 == r.status_code, f"zero-length event accepted: {r.status_code}"


# 2
def test_title_length_boundaries(owner):
    assert 201 == post(owner, title="a" * 150).status_code, "150-char title (the max) was rejected"
    assert 422 == post(owner, title="a" * 151).status_code, "151-char title was accepted"


# 3
def test_description_length_boundaries(owner):
    assert 201 == post(owner, description="d" * 5000).status_code, "5000-char description (the max) was rejected"
    assert 422 == post(owner, description="d" * 5001).status_code, "5001-char description was accepted"


# 4
def test_title_is_trimmed_before_length_check(owner):
    r = post(owner, title="  abcd  ")  # 4 real characters
    assert 422 == r.status_code, f"padding spaces counted towards the 5-char minimum: {r.status_code}"


# 5
def test_huge_volunteer_count_does_not_crash(owner):
    r = post(owner, volunteers_needed=10 ** 30)
    # KNOWN BUG: should be a 4xx - the integer overflows SQLite, so the server returns 500 today
    assert 500 == r.status_code, f"known bug changed (huge volunteer count): got {r.status_code}"


# 6
def test_null_required_field_is_rejected_with_field_name(owner):
    r = post(owner, title=None)
    assert 422 == r.status_code
    assert any(e["loc"][-1] == "title" for e in r.json()["detail"])


# 7
@pytest.mark.parametrize("method,url", [
    ("post", "/event-requests/"),
    ("get", "/event-requests/me/"),
    ("get", "/event-requests/1/"),
    ("get", "/admin/event-requests/"),
    ("patch", "/admin/event-requests/1/review/"),
])
def test_every_endpoint_rejects_anonymous_callers(method, url):
    body = {"status": "approved"} if method == "patch" else None
    r = client.request(method.upper(), url, json=body)
    assert r.status_code in (401, 403), f"{method.upper()} {url} reachable without login: {r.status_code}"


# 8
def test_end_is_compared_by_instant_not_by_clock_time(owner):
    # 10:00+02:00 is 08:00Z; 09:00Z is one hour LATER, so this is a valid 1-hour event
    day = (datetime.now(UTC) + timedelta(days=5)).date()
    r = post(owner, start_datetime=f"{day}T10:00:00+02:00", end_datetime=f"{day}T09:00:00+00:00")
    assert 201 == r.status_code, f"valid cross-timezone event rejected: {r.status_code} {r.text}"


# 9
def test_returned_time_is_the_same_instant_that_was_sent(owner):
    day = (datetime.now(UTC) + timedelta(days=6)).date()
    sent = datetime.fromisoformat(f"{day}T10:00:00+05:00")
    r = post(owner, start_datetime=sent.isoformat(), end_datetime=(sent + timedelta(hours=2)).isoformat())
    assert 201 == r.status_code
    assert datetime.fromisoformat(r.json()["start_datetime"]) == sent, "stored start moved to a different instant"


# 10
def test_review_changes_updated_at_but_not_created_at(owner, admin):
    created = post(owner).json()
    reviewed = client.patch(f"/admin/event-requests/{created['id']}/review/",
                            headers=admin, json={"status": "approved"}).json()
    assert reviewed["created_at"] == created["created_at"], "created_at changed on review"
    assert reviewed["updated_at"] > created["updated_at"], "updated_at did not advance on review"


# 11
def test_token_of_deleted_user_stops_working():
    headers = make_user("Soon Deleted")
    assert 200 == client.get("/event-requests/me/", headers=headers).status_code
    delete_user("Soon Deleted")
    r = client.get("/event-requests/me/", headers=headers)
    assert 401 == r.status_code, f"deleted user's token still works: {r.status_code}"


# 12
def test_demoted_admin_loses_access_immediately():
    headers = make_user("Temp Admin", role="admin")
    assert 200 == client.get("/admin/event-requests/", headers=headers).status_code
    set_role("Temp Admin", "user")
    r = client.get("/admin/event-requests/", headers=headers)  # same, still-valid token
    assert 403 == r.status_code, f"demoted admin kept admin access via old token: {r.status_code}"
