"""Backend auth-layer tests for Mobile Build Resolver (iteration 3).

Covers:
  - Public /api/health remains open.
  - /api/auth/me unauth/invalid/expired/valid cases.
  - Router-level auth on protected endpoints (401 without token, 200 with token).
  - Cookie AND Bearer auth channels.
  - /api/auth/session negative cases (missing sid, fake sid).
  - Domain allowlist enforcement (unit + resolve-time re-check).
  - /api/auth/logout deletes session doc + subsequent /me returns 401.
  - Data isolation regression on /api/diagnose.
  - MongoDB _id leak check.
  - Cookie shape (only /auth/session sets a cookie).
"""
from __future__ import annotations

import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

# Ensure /app/backend importable so we can unit-test auth.enforce_domain
sys.path.insert(0, "/app/backend")
import auth  # noqa: E402

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://build-fixer-17.internal.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

JOB = "41b30fe6-9d40-4818-b76f-df7bac4858e7"
OWNER_UID = "8a5f8361-7922-4e36-ae0e-083310753430"
TIMEOUT = 90

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


def _mk_session(email: str = "qa.bot@emergent.sh", expired: bool = False) -> tuple[str, str]:
    """Insert a fresh user + session doc directly into mongo and return (token, user_id)."""
    user_id = f"TEST_user_{uuid.uuid4().hex[:10]}"
    token = f"TEST_session_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    exp = now - timedelta(hours=1) if expired else now + timedelta(days=1)
    db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": "QA Bot",
        "picture": None,
        "created_at": now.isoformat(),
    })
    db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": exp.isoformat(),
        "created_at": now.isoformat(),
    })
    return token, user_id


@pytest.fixture(scope="module")
def valid_session():
    token, uid = _mk_session()
    yield token, uid
    db.user_sessions.delete_many({"session_token": token})
    db.users.delete_many({"user_id": uid})


@pytest.fixture(scope="module")
def bearer_headers(valid_session):
    return {"Authorization": f"Bearer {valid_session[0]}"}


@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    yield
    db.users.delete_many({"user_id": {"$regex": "^TEST_"}})
    db.user_sessions.delete_many({"session_token": {"$regex": "^TEST_"}})
    db.users.delete_many({"email": "squatter@gmail.com"})


# --- /api/health public ----------------------------------------------------

def test_health_public():
    r = requests.get(f"{API}/health", timeout=TIMEOUT)
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert d["auth_allowed_domain"] == "emergent.sh"


# --- /api/auth/me ----------------------------------------------------------

def test_me_no_auth_401():
    r = requests.get(f"{API}/auth/me", timeout=TIMEOUT)
    assert r.status_code == 401
    assert r.json()["detail"] == "Not authenticated"


def test_me_invalid_bearer_401():
    r = requests.get(f"{API}/auth/me",
                     headers={"Authorization": "Bearer definitely-not-real"},
                     timeout=TIMEOUT)
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid session"


def test_me_expired_session_401():
    token, uid = _mk_session(expired=True)
    try:
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {token}"},
                         timeout=TIMEOUT)
        assert r.status_code == 401
        assert r.json()["detail"] == "Session expired"
    finally:
        db.user_sessions.delete_many({"session_token": token})
        db.users.delete_many({"user_id": uid})


def test_me_valid_session_returns_user(valid_session, bearer_headers):
    _, uid = valid_session
    r = requests.get(f"{API}/auth/me", headers=bearer_headers, timeout=TIMEOUT)
    assert r.status_code == 200
    d = r.json()
    assert d["user_id"] == uid
    assert d["email"].endswith("@emergent.sh")
    assert "name" in d and "picture" in d
    assert "_id" not in d


def test_me_does_not_set_cookie(valid_session, bearer_headers):
    r = requests.get(f"{API}/auth/me", headers=bearer_headers, timeout=TIMEOUT)
    assert r.status_code == 200
    assert "set-cookie" not in {k.lower() for k in r.headers.keys()}


# --- Protected routes: 401 without, 200 with -------------------------------

PROTECTED_SPOT_CHECKS = [
    ("POST", "/diagnose", {"job_id": JOB}),
    ("POST", "/expo/lookup", {"job_id": JOB}),
    ("POST", "/identity/ios", {"job_id": JOB, "bundle_id": "com.probe.test"}),
    ("GET", f"/keystore/{JOB}?user_id={OWNER_UID}", None),
    ("POST", "/creds/testflight-retry", {"job_id": JOB}),
    ("POST", "/fingerprint/lookup", {"job_id": JOB}),
    ("POST", "/pem/force-regen", {"job_id": JOB, "platform": "android"}),
    ("POST", "/mcp/deployer", {"tool": "fetch_app_details", "args": {"identifier": "x"}}),
    ("GET", "/audit", None),
]


@pytest.mark.parametrize("method,path,body", PROTECTED_SPOT_CHECKS)
def test_protected_route_401_without_token(method, path, body):
    url = f"{API}{path}"
    r = requests.request(method, url, json=body, timeout=TIMEOUT)
    assert r.status_code == 401, f"{method} {path} expected 401, got {r.status_code}: {r.text[:200]}"


@pytest.mark.parametrize("method,path,body", PROTECTED_SPOT_CHECKS)
def test_protected_route_with_bearer(method, path, body, bearer_headers):
    url = f"{API}{path}"
    r = requests.request(method, url, json=body, headers=bearer_headers, timeout=TIMEOUT)
    assert r.status_code != 401, f"{method} {path}: got 401 with valid bearer"
    assert r.status_code < 500, f"{method} {path}: {r.status_code} {r.text[:200]}"


def test_protected_route_with_cookie(valid_session):
    token, _ = valid_session
    s = requests.Session()
    s.cookies.set("session_token", token)
    r = s.post(f"{API}/diagnose", json={"job_id": JOB}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    assert r.json()["banner"]["found"] is True


# --- /api/auth/session negative cases --------------------------------------

def test_auth_session_missing_sid():
    r = requests.post(f"{API}/auth/session", timeout=TIMEOUT)
    assert r.status_code == 400
    assert "Missing X-Session-ID" in r.json()["detail"]


def test_auth_session_fake_sid_returns_401():
    r = requests.post(f"{API}/auth/session",
                      headers={"X-Session-ID": "definitely-not-real"},
                      timeout=TIMEOUT)
    assert r.status_code == 401, r.text
    assert "Emergent session exchange failed" in r.json()["detail"]
    # And must NOT set a cookie on the error response.
    assert "set-cookie" not in {k.lower() for k in r.headers.keys()}


# --- Domain allowlist ------------------------------------------------------

def test_enforce_domain_rejects_non_emergent():
    with pytest.raises(Exception) as ei:
        auth.enforce_domain("foo@gmail.com")
    exc = ei.value
    assert getattr(exc, "status_code", None) == 403
    assert "@emergent.sh" in getattr(exc, "detail", "")


def test_enforce_domain_accepts_emergent_case_insensitive():
    auth.enforce_domain("me@emergent.sh")
    auth.enforce_domain("ME@EMERGENT.SH")


def test_domain_recheck_at_me_time_rejects_non_emergent():
    # Insert a squatter directly into mongo (bypassing /auth/session).
    token, uid = _mk_session(email="squatter@gmail.com")
    try:
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {token}"},
                         timeout=TIMEOUT)
        assert r.status_code == 403, r.text
        assert "@emergent.sh" in r.json()["detail"]
    finally:
        db.user_sessions.delete_many({"session_token": token})
        db.users.delete_many({"user_id": uid})


# --- Logout ----------------------------------------------------------------

def test_logout_deletes_session_and_denies_next_call():
    token, uid = _mk_session()
    try:
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{API}/auth/me", headers=headers, timeout=TIMEOUT)
        assert r.status_code == 200

        r = requests.post(f"{API}/auth/logout", headers=headers, timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["ok"] is True

        # Session doc must be gone from mongo.
        assert db.user_sessions.find_one({"session_token": token}) is None

        # /me now 401.
        r = requests.get(f"{API}/auth/me", headers=headers, timeout=TIMEOUT)
        assert r.status_code == 401
    finally:
        db.user_sessions.delete_many({"session_token": token})
        db.users.delete_many({"user_id": uid})


# --- Regression: /api/diagnose data isolation ------------------------------

def test_diagnose_regression_with_auth(bearer_headers):
    r = requests.post(f"{API}/diagnose", json={"job_id": JOB},
                      headers=bearer_headers, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["banner"]["found"] is True
    assert d["banner"]["platform"] == "iOS + Android"
    assert d["ios"]["ok"] is True
    assert d["android"]["ok"] is True
    assert d["resolved_user_id"] == OWNER_UID

    # Sensitive fields still masked.
    for side in ("ios", "android"):
        row = d[side]["row"]
        if not row:
            continue
        for key in ("keystore_password", "fastlane_session", "api_key_issuer_id"):
            if key in row:
                v = row[key]
                assert isinstance(v, dict) and "present" in v and "masked" in v

    # No mongo _id anywhere.
    import json as _json
    assert '"_id"' not in _json.dumps(d)


# --- Regression: fingerprint (iteration_2 focus) ---------------------------

def test_fingerprint_from_url_regression(bearer_headers):
    r = requests.post(f"{API}/fingerprint/from-url",
                      json={"url": "https://f-droid.org/F-Droid.apk"},
                      headers=bearer_headers,
                      timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    # Expect sha1 + sha256 fingerprints somewhere in the response.
    blob = str(d).lower()
    assert "sha1" in blob and "sha256" in blob


# --- Regression: prior spot checks with bearer -----------------------------

def test_regression_fingerprint_lookup_bearer(bearer_headers):
    r = requests.post(f"{API}/fingerprint/lookup", json={"job_id": JOB},
                      headers=bearer_headers, timeout=TIMEOUT)
    assert r.status_code == 200
    assert "rows" in r.json()


def test_regression_audit_bearer(bearer_headers):
    time.sleep(1)
    r = requests.get(f"{API}/audit", headers=bearer_headers, timeout=TIMEOUT)
    assert r.status_code == 200
    assert "entries" in r.json()
