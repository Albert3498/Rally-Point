"""Organization (adult NGO) accounts next to the 14-18 student accounts.

Each test asserts what a correct system should do; the expected status is on the left.
"""
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

from support import DB_PATH, birthdate_for_age, client, event_payload, login, make_user, registration
import Authentification

ROOT = Path(__file__).resolve().parent.parent


def organization(name="Asociatia Verde 2030", **overrides):
    body = {
        "account_type": "organization", "name": name, "password": "ong-pass-123",
        "email": "contact@verde.example.org", "city": "Cluj Napoca", "country": "Romania",
    }
    body.update(overrides)
    return body


def org_headers(name="Asociatia Verde 2030"):
    return login(name, "ong-pass-123")


# 1
def test_adult_organization_can_register_and_log_in():
    r = client.post("/register/", json=organization())
    assert 200 == r.status_code, r.text
    assert "organization" == r.json()["role"]
    me = client.get("/whoami/", headers=org_headers())
    assert 200 == me.status_code
    assert "organization" == me.json()["role"]


# 2
def test_organization_names_keep_capitalisation_digits_and_punctuation():
    r = client.post("/register/", json=organization("ONG Verde & Co. (2030)"))
    assert 200 == r.status_code, r.text
    with sqlite3.connect(DB_PATH) as c:
        stored = c.execute("SELECT name FROM userdata WHERE id=?", (r.json()["id"],)).fetchone()[0]
    assert "ONG Verde & Co. (2030)" == stored


# 3
def test_organization_login_ignores_case():
    client.post("/register/", json=organization("Casa Sperantei"))
    r = client.post("/login/", json={"name": "CASA SPERANTEI", "password": "ong-pass-123"})
    assert 200 == r.status_code, r.text


# 4
def test_token_from_a_differently_cased_login_still_works_everywhere():
    client.post("/register/", json=organization("Mixed Case Org"))
    headers = login("mixed case org", "ong-pass-123")
    # the event code looks the account up by exact name, so the token must carry the stored name
    assert 200 == client.get("/event-requests/me/", headers=headers).status_code


# 5
def test_organization_without_email_is_rejected():
    body = organization("No Mail Org")
    del body["email"]
    r = client.post("/register/", json=body)
    assert 422 == r.status_code
    assert "email" in r.text


# 6
def test_organization_with_invalid_email_is_rejected():
    r = client.post("/register/", json=organization("Bad Mail Org", email="not-an-email"))
    assert 422 == r.status_code


# 7
def test_organization_must_not_send_birthdate_or_aptitudes():
    r = client.post("/register/", json=organization("Dated Org", birthdate=birthdate_for_age(40)))
    assert 422 == r.status_code, "organization with a birthdate accepted"
    r = client.post("/register/", json=organization("Skilled Org", aptitudes=["python"]))
    assert 422 == r.status_code, "organization with aptitudes accepted"


# 8
def test_organization_name_with_markup_or_too_long_is_rejected():
    assert 422 == client.post("/register/", json=organization("<script>alert(1)</script>")).status_code
    assert 422 == client.post("/register/", json=organization("A" * 101)).status_code
    assert 422 == client.post("/register/", json=organization("123 456")).status_code, "name with no letter accepted"


# 9
def test_duplicate_organization_name_differing_only_by_case_is_rejected():
    assert 200 == client.post("/register/", json=organization("Twin Org")).status_code
    r = client.post("/register/", json=organization("TWIN ORG"))
    assert 400 == r.status_code, f"case variant created a second account: {r.status_code}"


# 10
def test_organization_cannot_take_a_students_name():
    assert 200 == client.post("/register/", json=registration("Ana Maria")).status_code
    r = client.post("/register/", json=organization("ana maria"))
    assert 400 == r.status_code, f"organization shadowed a student name: {r.status_code}"


# 11
def test_unknown_account_type_is_rejected():
    r = client.post("/register/", json=organization("Odd Org", account_type="admin"))
    assert 422 == r.status_code, "account_type 'admin' accepted - privilege escalation"


# 12
def test_students_still_need_age_14_to_18_and_a_birthdate():
    assert 422 == client.post("/register/", json=registration("Old Student", birthdate=birthdate_for_age(40))).status_code
    body = registration("No Birthday")
    del body["birthdate"]
    assert 422 == client.post("/register/", json=body).status_code
    assert 200 == client.post("/register/", json=registration("Fine Student")).status_code


# 13
def test_adult_student_error_points_organizations_to_the_right_account_type():
    r = client.post("/register/", json=registration("Adult Person", birthdate=birthdate_for_age(30)))
    assert 422 == r.status_code
    assert "organization" in r.text and "14-18" in r.text


# 14
def test_organizations_are_not_listed_as_volunteers():
    client.post("/register/", json=organization("Hidden Org", city="Brasov"))
    headers = make_user("Seeker Student")
    r = client.get("/users/search/", params={"city": "Brasov"}, headers=headers)
    assert 200 == r.status_code
    assert "Hidden Org" not in [u["name"] for u in r.json()], "organization listed in volunteer search"


# 15
def test_organization_can_submit_and_view_its_own_event_request():
    client.post("/register/", json=organization("Events Org"))
    headers = org_headers("Events Org")
    created = client.post("/event-requests/", headers=headers, json=event_payload())
    assert 201 == created.status_code, created.text
    mine = client.get("/event-requests/me/", headers=headers)
    assert [created.json()["id"]] == [r["id"] for r in mine.json()]


# 16
def test_organization_is_not_an_admin():
    client.post("/register/", json=organization("Plain Org"))
    headers = org_headers("Plain Org")
    assert 403 == client.get("/admin/event-requests/", headers=headers).status_code


# 17
def test_case_variants_cannot_bypass_the_login_rate_limit():
    client.post("/register/", json=organization("Limited Org"))
    Authentification.login_attempts.clear()
    for variant in ["limited org", "LIMITED ORG", "Limited Org", "lImItEd oRg", "LIMITED org"]:
        assert 400 == client.post("/login/", json={"name": variant, "password": "wrong"}).status_code
    r = client.post("/login/", json={"name": "limited ORG", "password": "ong-pass-123"})
    Authentification.login_attempts.clear()
    assert 429 == r.status_code, f"5 failures with different casing did not trigger the limit: {r.status_code}"


# 18 - migration of a database created before organizations existed (birthdate NOT NULL)
def test_old_database_is_migrated_and_keeps_its_users():
    old_db = Path(tempfile.mkdtemp()) / "old.db"
    with sqlite3.connect(old_db) as c:
        c.execute("CREATE TABLE userdata(id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, "
                  "password VARCHAR(255) NOT NULL, birthdate TEXT NOT NULL)")
        c.execute("INSERT INTO userdata(name,password,birthdate) VALUES('Old Timer','x','2009-01-01')")
    script = (
        "import sys; sys.path.insert(0, %r)\n"
        "from fastapi.testclient import TestClient\n"
        "from main import app\n"
        "c = TestClient(app, raise_server_exceptions=False)\n"
        "r = c.post('/register/', json={'account_type':'organization','name':'Late Org','password':'p-123456',"
        "'email':'a@b.org','city':'Iasi','country':'Romania'})\n"
        "print(r.status_code, r.text)\n"
    ) % str(ROOT)
    env = dict(os.environ, DATABASE_PATH=str(old_db))
    out = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, env=env, cwd=ROOT)
    assert out.stdout.startswith("200"), f"organization could not register on a migrated DB: {out.stdout} {out.stderr[-400:]}"
    with sqlite3.connect(old_db) as c:
        names = [r[0] for r in c.execute("SELECT name FROM userdata ORDER BY id")]
        notnull = [col[3] for col in c.execute("PRAGMA table_info(userdata)") if col[1] == "birthdate"]
    assert ["Old Timer", "Late Org"] == names
    assert [0] == notnull, "birthdate is still NOT NULL after migration"
    with sqlite3.connect(old_db) as c:
        keys = [r[0] for r in c.execute("SELECT name_key FROM userdata ORDER BY id")]
    assert ["old timer", "late org"] == keys, "name_key not filled in for existing users"


# 19 - Romanian capitals/diacritics: SQLite NOCASE only folds ASCII, so this needs real Unicode folding
def test_login_and_uniqueness_ignore_case_for_romanian_diacritics():
    assert 200 == client.post("/register/", json=organization("Școala Noastră")).status_code
    r = client.post("/login/", json={"name": "ȘCOALA NOASTRĂ", "password": "ong-pass-123"})
    assert 200 == r.status_code, f"diacritic capitals not matched: {r.status_code} {r.text}"
    twin = client.post("/register/", json=organization("ȘCOALA  noastră"))
    assert 400 == twin.status_code, f"diacritic case/space variant created a second account: {twin.status_code}"


# 20
def test_extra_spaces_in_the_typed_login_name_are_ignored():
    client.post("/register/", json=organization("Spacious Org"))
    r = client.post("/login/", json={"name": "  spacious    org ", "password": "ong-pass-123"})
    assert 200 == r.status_code, r.text
