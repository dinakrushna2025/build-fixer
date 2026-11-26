"""
token_manager.py - serve the Supabase access token for the tool.

Source: a PUSHED bearer kept fresh by the emergent.sh token-sync browser extension,
stored encrypted in Mongo tool_secrets _id="runtime_bearer". No service-account
password / anon key is used (Supabase disabled legacy keys on 2026-10-16).
"""
from __future__ import annotations

import os
import time
import json
import base64

import httpx

_cache = {"token": None, "exp": 0.0}
_mclient = None


def _db():
    global _mclient
    murl = os.environ.get("MONGO_URL", "")
    dbn = os.environ.get("DB_NAME", "")
    if not (murl and dbn):
        return None
    if _mclient is None:
        from motor.motor_asyncio import AsyncIOMotorClient
        _mclient = AsyncIOMotorClient(murl)
    return _mclient[dbn]


def _jwt_claim(tok, key):
    try:
        p = tok.split(".")[1]
        p += "=" * (-len(p) % 4)
        return json.loads(base64.urlsafe_b64decode(p)).get(key)
    except Exception:
        return None


def _jwt_exp(tok):
    try:
        return float(_jwt_claim(tok, "exp") or 0)
    except Exception:
        return 0.0


def _fernet():
    key = os.environ.get("TOOL_ENC_KEY", "")
    if not key:
        return None
    from cryptography.fernet import Fernet
    return Fernet(key.encode())


async def set_pushed_bearer(access_token: str) -> dict:
    db = _db()
    if db is None:
        return {"ok": False, "error": "no db"}
    f = _fernet()
    if f is None:
        return {"ok": False, "error": "no TOOL_ENC_KEY"}
    exp = _jwt_exp(access_token)
    email = (_jwt_claim(access_token, "email") or "").lower()
    enc = f.encrypt(access_token.encode()).decode()
    await db["tool_secrets"].update_one(
        {"_id": "runtime_bearer"},
        {"$set": {"access_token_enc": enc, "exp": exp, "updated_at": time.time(), "email": email}},
        upsert=True,
    )
    _cache["token"] = access_token
    _cache["exp"] = exp
    return {"ok": True, "exp": exp, "email": email}


async def _load_pushed_bearer():
    db = _db()
    if db is None:
        return None
    doc = await db["tool_secrets"].find_one({"_id": "runtime_bearer"})
    if not doc or not doc.get("access_token_enc"):
        return None
    f = _fernet()
    if f is None:
        return None
    try:
        tok = f.decrypt(doc["access_token_enc"].encode()).decode()
    except Exception:
        return None
    return {"token": tok, "exp": float(doc.get("exp") or _jwt_exp(tok)),
            "updated_at": doc.get("updated_at"), "email": doc.get("email")}


async def bearer_status() -> dict:
    pb = await _load_pushed_bearer()
    now = time.time()
    if not pb:
        return {"ok": True, "present": False}
    return {"ok": True, "present": True, "exp": pb["exp"],
            "seconds_left": int(pb["exp"] - now), "email": pb.get("email"), "updated_at": pb.get("updated_at")}


async def get_token(force: bool = False) -> dict:
    now = time.time()
    if not force and _cache["token"] and now < _cache["exp"] - 30:
        return {"ok": True, "cached": True, "access_token": _cache["token"], "expires_at": _cache["exp"]}
    pb = await _load_pushed_bearer()
    if pb and pb["exp"] - 60 > now:
        _cache["token"] = pb["token"]
        _cache["exp"] = pb["exp"]
        return {"ok": True, "cached": False, "access_token": pb["token"], "expires_at": pb["exp"], "src": "pushed"}
    _cache["token"] = None
    _cache["exp"] = 0.0
    if pb:
        return {"ok": False, "error": "bearer expired - open emergent.sh so the token-sync extension pushes a fresh token", "expired_at": pb["exp"]}
    return {"ok": False, "error": "no bearer yet - open emergent.sh with the token-sync extension installed"}


async def agent_call(method: str, path: str, body=None, timeout: float = 120) -> dict:
    t = await get_token()
    if not t.get("ok"):
        return {"ok": False, "error": t.get("error"), "status_code": 0}
    base = os.environ.get("AGENT_SERVICE_BASE", "https://api.emergent.sh").rstrip("/")
    headers = {"authorization": "Bearer " + t["access_token"], "content-type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.request(method, base + path, headers=headers, json=(body if body is not None else {}))
    except Exception as e:
        return {"ok": False, "error": "agent-service request failed: %s" % e, "status_code": 0}
    try:
        parsed = r.json()
    except Exception:
        parsed = r.text[:500]
    return {"ok": r.status_code < 400, "status_code": r.status_code, "body": parsed}
