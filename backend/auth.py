"""
Emergent-managed Google Auth integration.

- Login flow: frontend sends user to `https://auth.emergentagent.com/?redirect=<origin>/diagnose`.
- After Google sign-in, user lands back at `<redirect>#session_id=<sid>`.
- Frontend POSTs the sid to `/api/auth/session`; backend exchanges via Emergent's
  session-data endpoint, ENFORCES the @emergent.sh email allowlist, upserts the user
  and stores the session_token in MongoDB (7-day TTL). Cookie is HttpOnly + Secure +
  SameSite=None; Authorization: Bearer <token> is accepted as fallback.

REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import Cookie, Header, HTTPException, Response
from pydantic import BaseModel

ALLOWED_DOMAIN = os.environ.get("AUTH_ALLOWED_DOMAIN", "emergent.sh")
SESSION_TTL_DAYS = 7
EMERGENT_SESSION_DATA_URL = (
    "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
)


class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str | None = None


def enforce_domain(email: str) -> None:
    if not email or not email.lower().endswith(f"@{ALLOWED_DOMAIN}"):
        raise HTTPException(
            status_code=403,
            detail=(
                f"Access to Mobile Build Resolver is limited to @{ALLOWED_DOMAIN} "
                f"email addresses. Received: {email or '(no email)'}."
            ),
        )


async def exchange_session_id(session_id: str) -> dict[str, Any]:
    """Trade a one-time session_id for {id, email, name, picture, session_token}."""
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                EMERGENT_SESSION_DATA_URL,
                headers={"X-Session-ID": session_id},
            )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Emergent auth service unreachable: {e}") from e

    if r.status_code != 200:
        raise HTTPException(401, f"Emergent session exchange failed: HTTP {r.status_code}")
    return r.json()


async def create_or_update_user(db, email: str, name: str,
                                picture: str | None) -> str:
    now_iso = datetime.now(timezone.utc).isoformat()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture, "last_login_at": now_iso}},
        )
        return existing["user_id"]

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "created_at": now_iso,
        "last_login_at": now_iso,
    })
    return user_id


async def store_session(db, user_id: str, session_token: str) -> None:
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def delete_session(db, session_token: str) -> None:
    await db.user_sessions.delete_many({"session_token": session_token})


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=SESSION_TTL_DAYS * 24 * 60 * 60,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key="session_token", path="/")


def _extract_token(cookie_token: str | None, auth_header: str | None) -> str | None:
    if cookie_token:
        return cookie_token
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


async def resolve_user_from_token(db, token: str) -> User:
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")

    # Second line of defence: re-enforce domain on every request in case the
    # allowlist tightens later.
    enforce_domain(user.get("email", ""))

    return User(
        user_id=user["user_id"],
        email=user["email"],
        name=user.get("name") or user["email"],
        picture=user.get("picture"),
    )


def make_current_user_dep(db):
    """FastAPI dependency factory bound to the db handle."""
    async def _dep(
        session_token: str | None = Cookie(default=None),
        authorization: str | None = Header(default=None),
    ) -> User:
        token = _extract_token(session_token, authorization)
        if not token:
            raise HTTPException(401, "Not authenticated")
        return await resolve_user_from_token(db, token)
    return _dep
