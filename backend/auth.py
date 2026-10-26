"""Persistent pilot accounts: SQLite locally, PostgreSQL on serverless hosts.

Public Elexon analysis remains accessible to reviewers. Sessions are opaque,
revocable, hashed in the database and sent only in an HttpOnly cookie.
"""

from contextlib import contextmanager
from functools import lru_cache
import hashlib
import hmac
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

ROOT = Path(__file__).resolve().parents[1]
COOKIE = "winddesk_session"
SESSION_SECONDS = 7 * 24 * 3600
ITERATIONS = 600_000
router = APIRouter(prefix="/api/auth", tags=["Accounts"])


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()
    return f"pbkdf2_sha256${ITERATIONS}${salt}${digest}"


def password_matches(password: str, encoded: str) -> bool:
    algorithm, iterations, salt, expected = encoded.split("$")
    if algorithm != "pbkdf2_sha256" or int(iterations) != ITERATIONS:
        return False
    actual = password_hash(password, salt).split("$")[-1]
    return hmac.compare_digest(actual, expected)


DUMMY_HASH = password_hash("not-a-user-password", "00" * 16)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Credentials(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not value.isascii() or not re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+", value):
            raise ValueError("Enter a valid email address")
        return value


class Signup(Credentials):
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=12, max_length=128)
    theme: Literal["light", "dark"] = "light"

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(character) < 32 for character in value):
            raise ValueError("Enter your name")
        return value


class Preferences(Input):
    theme: Literal["light", "dark"]
    default_cutoff: Literal["09:00", "09:20", "15:00", "15:30"]


class Profile(Input):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        return Signup.valid_name(value)


class PasswordChange(Input):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class Store:
    def __init__(self, location: str, postgres: bool = False):
        self.location, self.postgres = location, postgres

    @contextmanager
    def connection(self):
        if self.postgres:
            import psycopg
            from psycopg.rows import dict_row
            connection = psycopg.connect(self.location, row_factory=dict_row, connect_timeout=10)
        else:
            path = Path(self.location)
            path.parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(path, timeout=10)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def execute(self, connection, sql: str, parameters: tuple = ()):
        return connection.execute(sql.replace("?", "%s") if self.postgres else sql, parameters)

    def initialize(self):
        with self.connection() as connection:
            for sql in (
                "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL, theme TEXT NOT NULL, default_cutoff TEXT NOT NULL)",
                "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at DOUBLE PRECISION NOT NULL)",
                "CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, window_start DOUBLE PRECISION NOT NULL, count INTEGER NOT NULL)",
                "CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)",
            ):
                self.execute(connection, sql)

    def limit(self, key: str, maximum: int, window: int):
        now = time.time()
        bucket = int(now // window) * window
        # Hash identifying values; no email/IP addresses are stored in this table.
        key = hashlib.sha256(f"{key}:{bucket}".encode()).hexdigest()
        with self.connection() as connection:
            self.execute(connection, "DELETE FROM attempts WHERE window_start < ?", (now - 3600,))
            result = self.execute(connection, "INSERT INTO attempts (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT (key) DO UPDATE SET count = attempts.count + 1 RETURNING count", (key, bucket)).fetchone()
        if result["count"] > maximum:
            raise HTTPException(429, "Too many attempts. Please try again later.", headers={"Retry-After": str(max(1, int(bucket + window - now)))})

    def user_by_email(self, email: str):
        with self.connection() as connection:
            row = self.execute(connection, "SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            return dict(row) if row else None

    def create_user(self, data: Signup):
        user_id, created = secrets.token_hex(16), time.time()
        encoded = password_hash(data.password)
        with self.connection() as connection:
            created_row = self.execute(connection, "INSERT INTO users (id, email, name, password_hash, created_at, theme, default_cutoff) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (email) DO NOTHING RETURNING id", (user_id, data.email, data.name, encoded, created, data.theme, "09:00")).fetchone()
        if not created_row:
            raise HTTPException(409, "Unable to create an account with these details. Try logging in.")
        return self.user_by_email(data.email)

    def create_session(self, user_id: str, previous: str | None = None, expected_hash: str | None = None) -> str:
        token = secrets.token_urlsafe(32)
        with self.connection() as connection:
            if not self.postgres:
                self.execute(connection, "BEGIN IMMEDIATE")
            current = self.execute(connection, "SELECT password_hash FROM users WHERE id = ?" + (" FOR SHARE" if self.postgres else ""), (user_id,)).fetchone()
            if not current or (expected_hash is not None and not hmac.compare_digest(current["password_hash"], expected_hash)):
                raise HTTPException(401, "Credentials changed. Please log in again.")
            self.execute(connection, "DELETE FROM sessions WHERE expires_at <= ?", (time.time(),))
            if previous:
                self.execute(connection, "DELETE FROM sessions WHERE token_hash = ?", (token_digest(previous),))
            self.execute(connection, "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", (token_digest(token), user_id, time.time() + SESSION_SECONDS))
        return token

    def session_user(self, token: str | None):
        if not token or len(token) > 128:
            return None
        with self.connection() as connection:
            row = self.execute(connection, "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?", (token_digest(token), time.time())).fetchone()
            return dict(row) if row else None

    def logout(self, token: str | None):
        if token:
            with self.connection() as connection:
                self.execute(connection, "DELETE FROM sessions WHERE token_hash = ?", (token_digest(token),))

    def preferences(self, user_id: str, data: Preferences):
        with self.connection() as connection:
            self.execute(connection, "UPDATE users SET theme = ?, default_cutoff = ? WHERE id = ?", (data.theme, data.default_cutoff, user_id))

    def profile(self, user_id: str, data: Profile):
        with self.connection() as connection:
            self.execute(connection, "UPDATE users SET name = ? WHERE id = ?", (data.name, user_id))

    def change_password(self, user_id: str, data: PasswordChange):
        with self.connection() as connection:
            if not self.postgres:
                self.execute(connection, "BEGIN IMMEDIATE")
            user = self.execute(connection, "SELECT password_hash FROM users WHERE id = ?" + (" FOR UPDATE" if self.postgres else ""), (user_id,)).fetchone()
            if not user or not password_matches(data.current_password, user["password_hash"]):
                raise HTTPException(401, "Current password is incorrect.")
            if data.current_password == data.new_password:
                raise HTTPException(422, "Choose a different new password.")
            self.execute(connection, "UPDATE users SET password_hash = ? WHERE id = ?", (password_hash(data.new_password), user_id))
            self.execute(connection, "DELETE FROM sessions WHERE user_id = ?", (user_id,))


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@lru_cache(maxsize=1)
def get_store() -> Store:
    url = os.getenv("DATABASE_URL", "")
    if os.getenv("VERCEL") and not url:
        raise HTTPException(503, "Accounts require a persistent PostgreSQL DATABASE_URL on Vercel. The public pilot is still available.")
    if url and not url.startswith(("postgres://", "postgresql://")):
        raise HTTPException(503, "The account database configuration is invalid.")
    store = Store(url, postgres=True) if url else Store(os.getenv("AUTH_DB_PATH", str(ROOT / ".local/winddesk-auth.sqlite3")))
    try:
        store.initialize()
    except Exception as exc:
        raise HTTPException(503, "The account database is unavailable. Please try again later.") from exc
    return store


def safe_origin(request: Request):
    if not request.headers.get("content-type", "").split(";")[0].strip().lower() == "application/json":
        raise HTTPException(415, "Use an application/json request")
    origin = request.headers.get("origin")
    allowed = {str(request.base_url).rstrip("/"), *filter(None, os.getenv("AUTH_ALLOWED_ORIGINS", "").split(","))}
    if (origin and origin not in allowed) or (not origin and request.headers.get("sec-fetch-site") == "cross-site"):
        raise HTTPException(403, "This account request must come from the WindDesk application.")


def public_user(user: dict) -> dict:
    return {key: user[key] for key in ("id", "email", "name", "created_at", "theme", "default_cutoff")}


def secure_cookies() -> bool:
    return os.getenv("AUTH_COOKIE_SECURE", "true" if os.getenv("VERCEL") else "false").lower() == "true"


def establish_session(store: Store, user: dict, request: Request, response: Response):
    token = store.create_session(user["id"], request.cookies.get(COOKIE), user["password_hash"])
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=secure_cookies(), samesite="lax", path="/")
    return {"user": public_user(user)}


@router.get("/session")
def session(request: Request):
    # A guest request has no database dependency; the public pilot always opens.
    token = request.cookies.get(COOKIE)
    user = get_store().session_user(token) if token else None
    return {"user": public_user(user) if user else None}


@router.post("/signup", status_code=201, dependencies=[Depends(safe_origin)])
def signup(data: Signup, request: Request, response: Response):
    store = get_store()
    store.limit(f"signup:{request.client.host if request.client else 'unknown'}", 30, 3600)
    user = store.create_user(data)
    return establish_session(store, user, request, response)


@router.post("/login", dependencies=[Depends(safe_origin)])
def login(data: Credentials, request: Request, response: Response):
    store = get_store()
    store.limit(f"login-ip:{request.client.host if request.client else 'unknown'}", 60, 900)
    store.limit(f"login-email:{data.email}", 10, 900)
    user = store.user_by_email(data.email)
    valid = password_matches(data.password, user["password_hash"] if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "Email or password is incorrect.")
    return establish_session(store, user, request, response)


@router.post("/logout", dependencies=[Depends(safe_origin)])
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        get_store().logout(token)
    response.delete_cookie(COOKIE, httponly=True, secure=secure_cookies(), samesite="lax", path="/")
    return {"user": None}


@router.put("/preferences", dependencies=[Depends(safe_origin)])
def preferences(data: Preferences, request: Request):
    store = get_store()
    user = store.session_user(request.cookies.get(COOKIE))
    if not user:
        raise HTTPException(401, "Please log in to save your workspace preferences.")
    store.preferences(user["id"], data)
    return {"user": {**public_user(user), **data.model_dump()}}


@router.put("/profile", dependencies=[Depends(safe_origin)])
def profile(data: Profile, request: Request):
    store = get_store()
    user = store.session_user(request.cookies.get(COOKIE))
    if not user:
        raise HTTPException(401, "Please log in to update your profile.")
    store.profile(user["id"], data)
    return {"user": {**public_user(user), "name": data.name}}


@router.post("/password", dependencies=[Depends(safe_origin)])
def change_password(data: PasswordChange, request: Request, response: Response):
    store = get_store()
    user = store.session_user(request.cookies.get(COOKIE))
    if not user:
        raise HTTPException(401, "Please log in to change your password.")
    store.limit(f"password:{user['id']}", 10, 900)
    store.change_password(user["id"], data)
    updated = store.user_by_email(user["email"])
    return establish_session(store, updated, request, response)
