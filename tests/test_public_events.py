"""GET /events/ must list approved event requests, and only those."""
from support import client, make_user, event_payload

TITLE_PREFIX = "Public feed check"


def submit(owner, suffix, **overrides):
    body = event_payload(title=f"{TITLE_PREFIX} {suffix}", **overrides)
    r = client.post("/event-requests/", json=body, headers=owner)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def review(admin, request_id, status):
    r = client.patch(f"/admin/event-requests/{request_id}/review/", json={"status": status}, headers=admin)
    assert r.status_code == 200, r.text


def public_titles(**params):
    r = client.get("/events/", params=params)
    assert r.status_code == 200, r.text
    return {e["title"] for e in r.json()["events"]}


def test_approved_request_is_listed_with_its_details():
    owner, admin = make_user("Feed Owner A"), make_user("Feed Admin A", role="admin")
    request_id = submit(owner, "approved")
    review(admin, request_id, "approved")

    events = client.get("/events/").json()["events"]
    listed = next(e for e in events if e["id"] == f"req-{request_id}")

    assert listed["title"] == f"{TITLE_PREFIX} approved"
    assert listed["organization"] == "Garden Club"
    assert listed["city"] == "Town Park"
    assert listed["action"] == "community"
    assert listed["contact"] == "garden@example.com"
    assert listed["volunteers_needed"] == 5


def test_pending_request_is_not_listed():
    owner = make_user("Feed Owner B")
    submit(owner, "pending")

    assert f"{TITLE_PREFIX} pending" not in public_titles()


def test_rejected_request_is_not_listed():
    owner, admin = make_user("Feed Owner C"), make_user("Feed Admin C", role="admin")
    request_id = submit(owner, "rejected")
    review(admin, request_id, "rejected")

    assert f"{TITLE_PREFIX} rejected" not in public_titles()


def test_name_filter_applies_to_approved_requests():
    owner, admin = make_user("Feed Owner D"), make_user("Feed Admin D", role="admin")
    review(admin, submit(owner, "alpha"), "approved")
    review(admin, submit(owner, "beta"), "approved")

    titles = public_titles(name="alpha")

    assert f"{TITLE_PREFIX} alpha" in titles
    assert f"{TITLE_PREFIX} beta" not in titles


def test_category_filter_accepts_request_categories():
    owner, admin = make_user("Feed Owner E"), make_user("Feed Admin E", role="admin")
    review(admin, submit(owner, "garden", category="community"), "approved")
    review(admin, submit(owner, "animals", category="animal_welfare"), "approved")

    titles = public_titles(action="animal_welfare")

    assert f"{TITLE_PREFIX} animals" in titles
    assert f"{TITLE_PREFIX} garden" not in titles


def test_pay_filter_hides_requests_that_have_no_pay_data():
    owner, admin = make_user("Feed Owner F"), make_user("Feed Admin F", role="admin")
    review(admin, submit(owner, "paycheck"), "approved")

    assert f"{TITLE_PREFIX} paycheck" not in public_titles(pay="free")
