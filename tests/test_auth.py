import os
import time
from urllib.parse import urlsplit

from fastapi.testclient import TestClient
from fastapi import HTTPException
import pytest

from backend.app import app
from backend.auth import COOKIE, Store, get_store, token_digest

SIGNUP = {"name": "Alex Morgan", "email": "alex@example.test", "password": "A-long-test-passphrase-2026", "theme": "dark"}


@pytest.fixture
def accounts(tmp_path, monkeypatch):
    database = os.getenv("POSTGRES_TEST_URL")
    if database:
        target = urlsplit(database)
        if target.hostname not in {"localhost", "127.0.0.1", "postgres"} or not target.path.endswith("_test"):
            pytest.fail("POSTGRES_TEST_URL must target a local disposable database ending in _test")
    store = Store(database, postgres=True) if database else Store(str(tmp_path / "accounts.sqlite3"))
    store.initialize()
    if database:
        # Only use an explicitly named disposable test database, never DATABASE_URL.
        with store.connection() as connection:
            store.execute(connection, "DELETE FROM sessions")
            store.execute(connection, "DELETE FROM users")
            store.execute(connection, "DELETE FROM attempts")
    monkeypatch.setattr("backend.auth.get_store", lambda: store)
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "false")
    with TestClient(app) as client:
        yield client, store
    get_store.cache_clear()


def test_signup_persists_user_and_hashed_session_with_private_cookie(accounts):
    client, store = accounts
    response = client.post("/api/auth/signup", json=SIGNUP)
    assert response.status_code == 201
    user = response.json()["user"]
    assert user["name"] == "Alex Morgan" and user["theme"] == "dark"
    assert "password" not in response.text
    assert response.headers["cache-control"] == "no-store, private"
    assert response.headers["vary"] == "Cookie"
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "max-age=604800" in cookie
    token = client.cookies.get(COOKIE)
    with store.connection() as connection:
        stored = store.execute(connection, "SELECT password_hash FROM users").fetchone()["password_hash"]
        session = store.execute(connection, "SELECT token_hash FROM sessions").fetchone()["token_hash"]
    assert stored.startswith("pbkdf2_sha256$600000$") and SIGNUP["password"] not in stored
    assert session == token_digest(token) and session != token
    # A second app instance/connection reads the same persisted account and session.
    another = Store(store.location, store.postgres)
    assert another.session_user(token)["id"] == user["id"]


def test_duplicate_email_is_normalized_and_does_not_replace_password(accounts):
    client, store = accounts
    assert client.post("/api/auth/signup", json=SIGNUP).status_code == 201
    duplicate = client.post("/api/auth/signup", json={**SIGNUP, "email": " Alex@EXAMPLE.test ", "password": "another-long-passphrase"})
    assert duplicate.status_code == 409
    client.post("/api/auth/logout", json={})
    assert client.post("/api/auth/login", json={"email": "ALEX@example.test", "password": SIGNUP["password"]}).status_code == 200


def test_wrong_password_and_unknown_user_have_identical_errors(accounts):
    client, _ = accounts
    client.post("/api/auth/signup", json=SIGNUP)
    client.post("/api/auth/logout", json={})
    wrong = client.post("/api/auth/login", json={"email": SIGNUP["email"], "password": "incorrect"})
    unknown = client.post("/api/auth/login", json={"email": "unknown@example.test", "password": "incorrect"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert client.get("/api/auth/session").json() == {"user": None}


def test_logout_revokes_session_and_login_rotates_it(accounts):
    client, store = accounts
    client.post("/api/auth/signup", json=SIGNUP)
    initial = client.cookies.get(COOKIE)
    client.post("/api/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"]})
    replacement = client.cookies.get(COOKIE)
    assert replacement != initial and store.session_user(initial) is None
    client.post("/api/auth/logout", json={})
    assert store.session_user(replacement) is None
    client.cookies.set(COOKIE, replacement)
    assert client.get("/api/auth/session").json()["user"] is None


def test_expired_session_cannot_read_or_update_preferences(accounts):
    client, store = accounts
    client.post("/api/auth/signup", json=SIGNUP)
    with store.connection() as connection:
        store.execute(connection, "UPDATE sessions SET expires_at = ?", (time.time() - 1,))
    assert client.get("/api/auth/session").json()["user"] is None
    assert client.put("/api/auth/preferences", json={"theme": "light", "default_cutoff": "15:00"}).status_code == 401


def test_preferences_survive_logout_and_login(accounts):
    client, _ = accounts
    client.post("/api/auth/signup", json=SIGNUP)
    saved = client.put("/api/auth/preferences", json={"theme": "light", "default_cutoff": "15:00"})
    assert saved.status_code == 200
    client.post("/api/auth/logout", json={})
    user = client.post("/api/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"]}).json()["user"]
    assert user["theme"] == "light" and user["default_cutoff"] == "15:00"


@pytest.mark.parametrize("changes", [{"password": "short"}, {"name": "  "}, {"email": "invalid"}, {"theme": "invisible"}])
def test_invalid_signup_is_rejected_without_echoing_credentials(accounts, changes):
    client, _ = accounts
    response = client.post("/api/auth/signup", json={**SIGNUP, **changes})
    assert response.status_code == 422
    assert SIGNUP["password"] not in response.text
    assert '"input"' not in response.text


def test_cross_origin_and_form_requests_are_rejected(accounts):
    client, _ = accounts
    assert client.post("/api/auth/signup", json=SIGNUP, headers={"Origin": "https://attacker.example"}).status_code == 403
    assert client.post("/api/auth/signup", data=SIGNUP).status_code == 415
    assert client.post("/api/auth/signup", json=SIGNUP, headers={"Origin": "http://testserver"}).status_code == 201
    assert client.post("/api/auth/logout", json={}, headers={"Origin": "https://attacker.example"}).status_code == 403
    assert client.get("/api/auth/session").json()["user"]


def test_login_attempts_are_rate_limited(accounts):
    client, _ = accounts
    for _ in range(10):
        assert client.post("/api/auth/login", json={"email": "unknown@example.test", "password": "incorrect"}).status_code == 401
    limited = client.post("/api/auth/login", json={"email": "unknown@example.test", "password": "incorrect"})
    assert limited.status_code == 429 and int(limited.headers["retry-after"]) > 0


def test_secure_cookie_option(accounts, monkeypatch):
    client, _ = accounts
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "true")
    assert "Secure" in client.post("/api/auth/signup", json=SIGNUP).headers["set-cookie"]


def test_serverless_accounts_fail_clearly_without_persistent_database(accounts, monkeypatch):
    client, _ = accounts
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr("backend.auth.get_store", get_store)
    get_store.cache_clear()
    assert client.post("/api/auth/signup", json=SIGNUP).status_code == 503
    assert client.get("/api/auth/session").json()["user"] is None
    assert client.get("/api/health").status_code == 200


def test_profile_updates_are_authenticated_and_persist(accounts):
    client, _ = accounts
    assert client.put("/api/auth/profile", json={"name":"New Name"}).status_code == 401
    client.post("/api/auth/signup", json=SIGNUP)
    updated=client.put("/api/auth/profile", json={"name":"  Alex Taylor  "})
    assert updated.status_code == 200 and updated.json()["user"]["name"] == "Alex Taylor"
    assert client.get("/api/auth/session").json()["user"]["name"] == "Alex Taylor"
    assert client.put("/api/auth/profile", json={"name":"  "}).status_code == 422


def test_password_change_requires_current_password_and_keeps_session_on_failure(accounts):
    client, _ = accounts
    body={"current_password":"wrong", "new_password":"A-new-test-passphrase-2026"}
    assert client.post("/api/auth/password", json=body).status_code == 401
    client.post("/api/auth/signup", json=SIGNUP)
    assert client.post("/api/auth/password", json=body).status_code == 401
    assert client.get("/api/auth/session").json()["user"]
    assert client.post("/api/auth/password", json={"current_password":SIGNUP["password"],"new_password":SIGNUP["password"]}).status_code == 422


def test_password_change_revokes_other_sessions_and_old_credentials(accounts):
    client, store = accounts
    client.post("/api/auth/signup", json=SIGNUP)
    old_token=client.cookies.get(COOKIE)
    original=store.user_by_email(SIGNUP["email"])
    other=store.create_session(original["id"])
    new_password="A-new-test-passphrase-2026"
    changed=client.post("/api/auth/password", json={"current_password":SIGNUP["password"],"new_password":new_password})
    assert changed.status_code == 200
    assert client.cookies.get(COOKIE) != old_token
    assert store.session_user(old_token) is None and store.session_user(other) is None
    assert client.get("/api/auth/session").json()["user"]
    client.post("/api/auth/logout", json={})
    assert client.post("/api/auth/login", json={"email":SIGNUP["email"],"password":SIGNUP["password"]}).status_code == 401
    assert client.post("/api/auth/login", json={"email":SIGNUP["email"],"password":new_password}).status_code == 200


def test_stale_login_cannot_create_session_after_password_change(accounts):
    client, store = accounts
    client.post("/api/auth/signup", json=SIGNUP)
    original=store.user_by_email(SIGNUP["email"])
    client.post("/api/auth/password", json={"current_password":SIGNUP["password"],"new_password":"A-new-test-passphrase-2026"})
    with pytest.raises(HTTPException) as error:
        store.create_session(original["id"], expected_hash=original["password_hash"])
    assert error.value.status_code == 401


def test_password_change_validation_does_not_echo_credentials(accounts):
    client, _ = accounts
    response=client.post("/api/auth/password", json={"current_password":SIGNUP["password"],"new_password":"short"})
    assert response.status_code == 422 and SIGNUP["password"] not in response.text
    assert '"input"' not in response.text
