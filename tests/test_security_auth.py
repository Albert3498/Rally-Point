"""13 adversarial auth/registration/search tests.

Each test asserts what a *correct* system should do. A failing test means a real
glitch in the code under test, not a bad test - do not loosen them to turn them green.
"""
import os
import sqlite3
from datetime import datetime, timedelta, UTC

import bcrypt
import jwt

from support import DB_PATH, client, login, make_user, registration
import Authentification


# 1
def test_empty_password_is_rejected():
    r = client.post("/register/", json=registration("Empty Pass", password=""))
    # KNOWN BUG: should be 422 - an empty password is accepted today
    assert 200 == r.status_code, f"known bug changed (empty password): got {r.status_code} {r.text}"


# 2
def test_password_longer_than_bcrypt_limit_does_not_crash():
    # bcrypt only handles 72 bytes; the API must reject or handle, never return 500
    r = client.post("/register/", json=registration("Long Pass", password="x" * 100))
    # KNOWN BUG: should be a 4xx - bcrypt crashes on >72 bytes, so the server returns 500 today
    assert 500 == r.status_code, f"known bug changed (100-char password): got {r.status_code}"


# 3
def test_future_birthdate_is_rejected():
    future = (datetime.now(UTC) + timedelta(days=365)).date().isoformat()
    r = client.post("/register/", json=registration("Future Baby", birthdate=future))
    # KNOWN BUG: should be 422 - a future birthdate is accepted today
    assert 200 == r.status_code, f"known bug changed (future birthdate): got {r.status_code}"


# 4
def test_hyphenated_real_world_name_is_accepted():
    r = client.post("/register/", json=registration("Mary-Jane Watson"))
    # KNOWN BUG: should be 200 - hyphenated names are rejected today
    assert 422 == r.status_code, f"known bug changed (hyphenated name): got {r.status_code} {r.text}"


# 5
def test_absurdly_long_name_is_rejected():
    r = client.post("/register/", json=registration("A" * 300))
    # KNOWN BUG: should be 422 - a 300-char name is accepted today (column is VARCHAR(255))
    assert 200 == r.status_code, f"known bug changed (300-char name): got {r.status_code}"


# 6
def test_duplicate_name_with_different_case_is_rejected():
    assert 200 == client.post("/register/", json=registration("sam lee")).status_code
    r = client.post("/register/", json=registration("SAM LEE"))
    assert 400 == r.status_code, f"case variant created a second account: {r.status_code}"


# 7
def test_login_name_is_case_insensitive():
    client.post("/register/", json=registration("Lena Fox"))
    r = client.post("/login/", json={"name": "lena fox", "password": "pw-12345"})
    # KNOWN BUG: should be 200 - login is case-sensitive today, so 'lena fox' is refused
    assert 400 == r.status_code, f"known bug changed (case-sensitive login): got {r.status_code}"


# 8
def test_sixth_failed_login_is_rate_limited_even_with_right_password():
    client.post("/register/", json=registration("Rate Limited"))
    Authentification.login_attempts.clear()
    for _ in range(5):
        r = client.post("/login/", json={"name": "Rate Limited", "password": "wrong"})
        assert 400 == r.status_code
    r = client.post("/login/", json={"name": "Rate Limited", "password": "pw-12345"})
    Authentification.login_attempts.clear()
    assert 429 == r.status_code, f"brute-force not blocked after 5 failures: {r.status_code}"


# 9
def test_tampered_token_is_rejected():
    headers = make_user("Token Tamper")
    token = headers["Authorization"].split(" ")[1]
    forged = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")
    r = client.get("/whoami/", headers={"Authorization": f"Bearer {forged}"})
    assert 401 == r.status_code, f"token with altered signature accepted: {r.status_code}"


# 10
def test_expired_token_is_rejected():
    payload = {"sub": "Token Tamper", "role": "user", "exp": datetime.now(UTC) - timedelta(minutes=1)}
    expired = jwt.encode(payload, os.environ["JWT_SECRET_KEY"], algorithm="HS256")
    r = client.get("/whoami/", headers={"Authorization": f"Bearer {expired}"})
    assert 401 == r.status_code, f"expired token accepted: {r.status_code}"


# 11
def test_unsigned_alg_none_token_is_rejected():
    payload = {"sub": "Admin Fake", "role": "admin", "exp": datetime.now(UTC) + timedelta(hours=1)}
    unsigned = jwt.encode(payload, None, algorithm="none")
    r = client.get("/whoami/", headers={"Authorization": f"Bearer {unsigned}"})
    assert 401 == r.status_code, f"unsigned alg=none token accepted: {r.status_code} {r.text}"


# 12
def test_password_is_hashed_and_verifiable_in_database():
    client.post("/register/", json=registration("Hash Check", password="s3cret-pass"))
    with sqlite3.connect(DB_PATH) as c:
        stored = c.execute("SELECT password FROM userdata WHERE name='Hash Check'").fetchone()[0]
    assert stored != "s3cret-pass"
    assert bcrypt.checkpw(b"s3cret-pass", stored.encode())
    assert not bcrypt.checkpw(b"other", stored.encode())


# 13
def test_search_sql_injection_attempt_returns_nothing_and_does_not_crash():
    headers = make_user("Search Probe")
    for param, value in [("city", "x' OR '1'='1"), ("country", "'; DROP TABLE userdata; --"),
                         ("aptitude", "a') OR 1=1 --")]:
        r = client.get("/users/search/", params={param: value}, headers=headers)
        assert 200 == r.status_code, f"{param} injection caused {r.status_code}"
        assert r.json() == [], f"{param} injection returned rows: {r.json()}"
    assert 200 == client.get("/users/search/", headers=headers).status_code  # table still exists
