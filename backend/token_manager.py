"""
token_manager.py — self-fetch an Emergent (Supabase) access token for the tool.

Credentials live in the tool's OWN MongoDB (collection `tool_secrets`, doc
_id="agent_service_creds"), NOT in .env — so they survive pod rebuilds and the
password never sits in an env file. Env is only a fallback for local testing.

Flow: grant_type=password against a dedicated SERVICE account → cache the access
token in memory → auto re-login ~30s before expiry. No refresh-token rotation, no
browser handoff. A single asyncio lock serialises concurrent logins.

Set the credential once (direct Mongo write, over VPN — never expose a password endpoint):
  db.tool_secrets.update_one(
    {"_id": "agent_service_creds"},
    {"$set": {"supabase_url": "...", "anon_key": "...",
              "service_email": "...", "service_password": "..."}},
    upsert=True)

AGENT_SERVICE_BASE (env) defaults to https://api.emergent.sh
"""
from __future__ import annotations

import os
import time
import asyncio

import httpx

_lock = asyncio.Lock()
_cache = {"token": None, "exp": 0.0}
_mclient = None


async def _load_creds() -> dict:
    """Read the service credential from the tool's Mongo (tool_secrets); fall back to env."""
    global _mclient
    murl = os.environ.get("MONGO_URL", "")
    dbn = os.environ.get("DB_NAME", "")
    if murl and dbn:
        try:
            if _mclient is None:
                from motor.motor_asyncio import AsyncIOMotorClient
                _mclient = AsyncIOMotorClient(murl)
            doc = await _mclient[dbn]["tool_secrets"].find_one({"_id": "agent_service_creds"})
            if doc:
                pw = doc.get("service_password") or ""
                enc = doc.get("service_password_enc")
                if enc and not pw:
                    key = os.environ.get("TOOL_ENC_KEY", "")
                    if key:
                        try:
                            from cryptography.fernet import Fernet
                            pw = Fernet(key.encode()).decrypt(enc.encode()).decode()
                        except Exception:
                            pw = ""
                return {
                    "url": (doc.get("supabase_url") or "").rstrip("/"),
                    "anon": doc.get("anon_key") or "",
                    "email": doc.get("service_email") or "",
                    "password": pw,
                    "src": "db",
                }
        except Exception:
            pass  # fall through to env
    return {
        "url": os.environ.get("SUPABASE_URL", "").rstrip("/"),
        "anon": os.environ.get("SUPABASE_ANON_KEY", ""),
        "email": os.environ.get("SERVICE_EMAIL", ""),
        "password": os.environ.get("SERVICE_PASSWORD", ""),
        "src": "env",
    }


async def get_token(force: bool = False) -> dict:
    """Return {ok, access_token, expires_at, cached, src} or {ok:False, error}."""
    now = time.time()
    if not force and _cache["token"] and now < _cache["exp"] - 30:
        return {"ok": True, "cached": True, "access_token": _cache["token"], "expires_at": _cache["exp"]}

    cfg = await _load_creds()
    missing = [k for k in ("url", "anon", "email", "password") if not cfg.get(k)]
    if missing:
        return {"ok": False, "error": "not configured (missing: " + ", ".join(missing) + ")",
                "src": cfg.get("src")}

    async with _lock:
        now = time.time()
        if not force and _cache["token"] and now < _cache["exp"] - 30:
            return {"ok": True, "cached": True, "access_token": _cache["token"], "expires_at": _cache["exp"]}
        headers = {
            "apikey": cfg["anon"],
            "authorization": "Bearer " + cfg["anon"],
            "content-type": "application/json",
        }
        body = {"email": cfg["email"], "password": cfg["password"]}
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.post(cfg["url"] + "/auth/v1/token?grant_type=password",
                                 headers=headers, json=body)
        except Exception as e:
            return {"ok": False, "error": "login request failed: %s" % e}
        if r.status_code != 200:
            return {"ok": False, "error": "login HTTP %s: %s" % (r.status_code, r.text[:200])}
        data = r.json()
        tok = data.get("access_token")
        if not tok:
            return {"ok": False, "error": "no access_token in login response"}
        _cache["token"] = tok
        _cache["exp"] = time.time() + int(data.get("expires_in", 3600))
        return {"ok": True, "cached": False, "access_token": tok,
                "expires_at": _cache["exp"], "src": cfg.get("src")}


async def agent_call(method: str, path: str, body=None, timeout: float = 120) -> dict:
    """Authenticated call to agent-service (api.emergent.sh) using the fetched token."""
    t = await get_token()
    if not t.get("ok"):
        return {"ok": False, "error": t.get("error"), "status_code": 0}
    base = os.environ.get("AGENT_SERVICE_BASE", "https://api.emergent.sh").rstrip("/")
    headers = {"authorization": "Bearer " + t["access_token"], "content-type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.request(method, base + path, headers=headers,
                                json=(body if body is not None else {}))
    except Exception as e:
        return {"ok": False, "error": "agent-service request failed: %s" % e, "status_code": 0}
    try:
        parsed = r.json()
    except Exception:
        parsed = r.text[:500]
    return {"ok": r.status_code < 400, "status_code": r.status_code, "body": parsed}
