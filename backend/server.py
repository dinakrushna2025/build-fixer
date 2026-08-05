"""
Mobile Build Resolver -- FastAPI backend proxy.

All UI traffic goes: browser -> this backend -> internal endpoint / MCP.
Secrets (REDASH_API_KEY, DEPLOYER_URL, MCP tokens, ...) stay server-side.
"""
from __future__ import annotations

import asyncio
import httpx
import io
import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Cookie, Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import redash_client
import deployer_client
import mcp_client
import signing
import kms_shell
import auth as auth_mod
from audit import AuditLog

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

# --- app + db -------------------------------------------------------------

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
audit = AuditLog(db)

app = FastAPI(title="Mobile Build Resolver")

# Auth dependency — protects every /api route except health, root, and the auth
# endpoints themselves.
current_user = auth_mod.make_current_user_dep(db)
protected = Depends(current_user)

# Public router = auth endpoints + health + root. No auth required.
public_api = APIRouter(prefix="/api")
# Protected router = everything else. Attaches the auth dependency globally.
api = APIRouter(prefix="/api", dependencies=[protected])

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("mbr")


# --- redaction helpers ----------------------------------------------------

_MASKED = "•" * 8

_SENSITIVE_KEYS = {
    "keystore_password", "fastlane_session", "api_key_issuer_id",
    "profile_base64", "keystore_base64", "p8_base64", "kms_blob",
    "private_key", "cert", "certificate_body",
}


def redact_row(row: dict) -> dict:
    """Never render raw creds. Replace sensitive values with a masked placeholder
    but keep a boolean flag so the UI can show 'present / missing'."""
    out: dict[str, Any] = {}
    for k, v in row.items():
        if k in _SENSITIVE_KEYS:
            out[k] = {"present": bool(v), "masked": _MASKED if v else None}
        else:
            out[k] = v
    return out


def redact_rows(rows: list[dict]) -> list[dict]:
    return [redact_row(r) for r in rows]


# --- request models -------------------------------------------------------

class JobBody(BaseModel):
    job_id: str
    operator: str | None = None


class DiagnoseBody(BaseModel):
    job_id: str
    app_id: str | None = None
    package_name: str | None = None


class ExpoLookupBody(BaseModel):
    app_id: str | None = None
    job_id: str | None = None
    expo_id: str | None = None


class IdentityIosBody(BaseModel):
    job_id: str
    app_name: str | None = None
    bundle_id: str | None = None
    operator: str | None = None


class IdentityAndroidBody(BaseModel):
    job_id: str
    app_name: str | None = None
    package_name: str | None = None
    operator: str | None = None


class ClearAscBody(BaseModel):
    job_id: str
    operator: str | None = None
    batch: bool = False  # if true, run for every job sharing the itc_team_id


class TestflightRetryBody(BaseModel):
    job_id: str
    operator: str | None = None


class ExpoBuildActionBody(BaseModel):
    app_id: str | None = None
    job_id: str | None = None
    profile: str | None = None
    platform: str | None = None
    operator: str | None = None


class FingerprintUrlBody(BaseModel):
    url: str


class ExtractUploadKeyBody(BaseModel):
    job_id: str
    operator: str | None = None


class ForceRegenBody(BaseModel):
    job_id: str
    platform: str  # "ios" | "android"
    operator: str | None = None


class McpToolBody(BaseModel):
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)


# --- queries (kept in one place so the UI can display them) ---------------

Q_IOS_CFG = """
SELECT bundle_id, team_id, api_key_id, api_key_issuer_id, testflight_status,
       testflight_error, certificate_expires_at, profile_expires_at,
       fastlane_session, apple_id, itc_team_id, user_id, job_id
FROM ios_app_configs
WHERE job_id = '{{ job }}'
""".strip()

Q_ANDROID_CFG = """
SELECT id, job_id, user_id, package_name, keystore_path, key_alias,
       expo_project_id, apk_url, aab_url, keystore_password, created_at
FROM android_app_configs
WHERE job_id = '{{ job }}'
""".strip()

Q_APP_BY_ID = """
SELECT a.name AS app, a.id AS app_id, a.expo_id, ea.owner AS expo_owner
FROM apps a
LEFT JOIN expo_accounts ea ON ea.id = a.expo_id
WHERE a.id = '{{ app_id }}'
""".strip()

Q_APP_BY_JOB_IOS = "SELECT app_id FROM ios_app_configs WHERE job_id = '{{ job }}'"
Q_APP_BY_JOB_ANDROID = "SELECT app_id FROM android_app_configs WHERE job_id = '{{ job }}'"

Q_APP_VIA_PIPELINE = """
SELECT a.name AS app, a.id AS app_id, a.expo_id, ea.owner AS expo_owner
FROM apps a
LEFT JOIN expo_accounts ea ON ea.id = a.expo_id
WHERE a.name IN (
    SELECT DISTINCT deployment_name FROM pipeline_runs
    WHERE app = (SELECT name FROM apps WHERE id = '{{ job }}')
      AND deployment_name IS NOT NULL
)
ORDER BY (a.expo_id IS NOT NULL) DESC
LIMIT 1
""".strip()

Q_FINGERPRINT_UNION = """
SELECT 'v3' AS src, job_id, app_name, package_name, key_alias, keystore_path, apk_url, aab_url
FROM android_app_configs_v3 WHERE job_id = '{{ job }}'
UNION ALL
SELECT 'v1' AS src, job_id, app_name, package_name, key_alias, keystore_path, apk_url, aab_url
FROM android_app_configs WHERE job_id = '{{ job }}'
""".strip()

Q_ASC_BATCH = """
SELECT job_id
FROM ios_app_configs
WHERE user_id = '{{ u }}'
  AND itc_team_id = '{{ t }}'
  AND api_key_id IS NOT NULL
""".strip()

Q_KEYSTORE_PW = "SELECT keystore_password FROM android_app_configs WHERE job_id = '{{ job }}'"

Q_FORCE_REGEN_IOS = "UPDATE ios_app_configs SET profile_base64 = '' WHERE job_id = '{{ job }}'"
Q_FORCE_REGEN_ANDROID = "UPDATE android_app_configs SET keystore_path = NULL WHERE job_id = '{{ job }}'"


# --- diagnose -------------------------------------------------------------

def _first(rows: list[dict]) -> dict | None:
    return rows[0] if rows else None


def _build_banner(ios: dict | None, android: dict | None) -> dict:
    """Compose the top diagnosis banner from raw config rows."""
    platform = "unknown"
    if ios and android:
        platform = "iOS + Android"
    elif ios:
        platform = "iOS"
    elif android:
        platform = "Android"

    is_eas = bool(android and android.get("expo_project_id"))

    flags: list[dict[str, str]] = []
    if ios:
        if ios.get("testflight_status") == "failed":
            flags.append({"severity": "red",
                          "label": f"TestFlight failed: {ios.get('testflight_error') or 'no error text'}"})
        if not ios.get("fastlane_session"):
            flags.append({"severity": "amber", "label": "fastlane_session is NULL"})
        if not ios.get("api_key_id"):
            flags.append({"severity": "amber", "label": "ASC api_key_id missing"})
    if android:
        if not android.get("keystore_path"):
            flags.append({"severity": "amber", "label": "keystore_path is NULL (will be regenerated)"})
        if not android.get("aab_url") and not android.get("apk_url"):
            flags.append({"severity": "amber", "label": "No AAB/APK URL yet -- build never completed"})

    if not flags and (ios or android):
        flags.append({"severity": "green", "label": "No red flags in the DB row"})

    return {
        "platform": platform,
        "is_eas": is_eas,
        "flags": flags,
        "found": bool(ios or android),
    }


@api.post("/diagnose")
async def diagnose(body: DiagnoseBody):
    ios_res = await redash_client.execute(Q_IOS_CFG, {"job": body.job_id})
    and_res = await redash_client.execute(Q_ANDROID_CFG, {"job": body.job_id})

    ios_row = _first(ios_res.get("rows", []))
    and_row = _first(and_res.get("rows", []))

    # user_id used by keystore endpoints comes from the android row's user_id.
    resolved_user_id = None
    if and_row and and_row.get("user_id"):
        resolved_user_id = str(and_row["user_id"])
    elif ios_row and ios_row.get("user_id"):
        resolved_user_id = str(ios_row["user_id"])

    ios_masked = redact_row(ios_row) if ios_row else None
    and_masked = redact_row(and_row) if and_row else None

    return {
        "banner": _build_banner(ios_row, and_row),
        "ios": {
            "row": ios_masked,
            "query": Q_IOS_CFG,
            "ok": ios_res["ok"],
            "error": ios_res.get("error"),
        },
        "android": {
            "row": and_masked,
            "query": Q_ANDROID_CFG,
            "ok": and_res["ok"],
            "error": and_res.get("error"),
        },
        "resolved_user_id": resolved_user_id,
    }


Q_BUILD_FAILURE = """
SELECT pr.id AS pipeline_run_id, pr.app, pr.type, pr.status AS run_status,
       pr.cloud_build_id, pr.eas_build_id, pr.created_at,
       s.name AS step, s.status AS step_status, s.error AS step_error, s.logs AS step_logs
FROM pipeline_runs pr
JOIN pipeline_run_steps s ON s.pipeline_run_id = pr.id
WHERE pr.app = (SELECT name FROM apps WHERE id = \'{{ job }}\')
  AND s.status = \'failed\'
ORDER BY pr.created_at DESC NULLS LAST
LIMIT 10
""".strip()


Q_BUILD_FAILURE_BY_USER = """
SELECT pr.id AS pipeline_run_id, pr.app, pr.type, pr.status AS run_status,
       pr.cloud_build_id, pr.eas_build_id, pr.created_at,
       s.name AS step, s.status AS step_status, s.error AS step_error, s.logs AS step_logs
FROM pipeline_runs pr
JOIN pipeline_run_steps s ON s.pipeline_run_id = pr.id
WHERE pr.user_id = COALESCE(
        (SELECT user_id FROM android_app_configs WHERE job_id = \'{{ job }}\' LIMIT 1),
        (SELECT user_id FROM ios_app_configs WHERE job_id = \'{{ job }}\' LIMIT 1))
  AND pr.type IN (\'android_build\', \'ios_build\')
  AND s.status = \'failed\'
ORDER BY pr.created_at DESC NULLS LAST
LIMIT 10
""".strip()


Q_LATEST_BUILDS_BY_APP = """
SELECT DISTINCT ON (pr.type) pr.type, pr.status, pr.created_at
FROM pipeline_runs pr
WHERE pr.app = '{{ app }}'
  AND pr.type IN ('android_build', 'ios_build')
ORDER BY pr.type, pr.created_at DESC NULLS LAST
""".strip()


def _extract_error_lines(logs):
    """Pull the human-meaningful error lines out of a raw EAS/Gradle log tail,
    dropping the JSON phase-marker noise. Purely parsed from the real log -- nothing
    hard-coded."""
    out = []
    for ln in (logs or "").split("\n"):
        ln = ln.strip()
        if not ln:
            continue
        low = ln.lower()
        if "error:" not in low and "gradle build failed" not in low and "build failed:" not in low:
            continue
        if ln.startswith("[EAS_LOG] {") or '"level"' in ln:
            continue  # JSON marker line -- skip the noise
        ln = ln.replace("[EAS_LOG] ", "").strip()
        if ": error:" in ln:
            ln = "error:" + ln.split(": error:", 1)[1]
        if ln not in out:
            out.append(ln)
        if len(out) >= 6:
            break
    return out


@api.post("/diagnose/logs")
async def diagnose_logs(body: JobBody):
    """Why did the build fail? Resolve the job's app, then read the real failed-step
    error + EAS/Gradle log tail straight from Redash pipeline_run_steps (reliable),
    instead of the flaky deployer MCP (which needed a cloud_build_id and timed out)."""
    resolved_via = "apps.id"
    q = await redash_client.execute(Q_BUILD_FAILURE, {"job": body.job_id})
    rows = q.get("rows", []) or []
    if not rows:
        # This job_id is a build-config job whose deployment slug differs from
        # apps.id (e.g. app "Fyndit" deploys under slug "community-paws"). Resolve
        # the owner from the config tables and pull their failed mobile builds.
        resolved_via = "user_id"
        q = await redash_client.execute(Q_BUILD_FAILURE_BY_USER, {"job": body.job_id})
        rows = q.get("rows", []) or []
    if not rows:
        return {"found": False, "error": q.get("error"),
                "note": "No failed build steps found for this job "
                        "(the build succeeded, or no mobile build ran).",
                "failures": []}

    # Group identical failures and keep ONLY the real "why it failed" signal:
    # the parsed step error + the meaningful error lines pulled from the live log.
    groups = {}
    for r in rows:
        key = (r.get("type"), r.get("step"), (r.get("step_error") or "").strip())
        g = groups.get(key)
        if g is None:
            g = {
                "platform": r.get("type"),
                "step": r.get("step"),
                "attempts": 0,
                "last_failed_at": r.get("created_at"),
                "why": (r.get("step_error") or "").strip() or None,
                "error_lines": _extract_error_lines(r.get("step_logs") or ""),
            }
            groups[key] = g
        g["attempts"] += 1
        if not g["error_lines"]:
            g["error_lines"] = _extract_error_lines(r.get("step_logs") or "")

    reasons = list(groups.values())

    # Option B: report the LATEST build per platform so stale failures are clearly
    # flagged as resolved history instead of looking like current breakage.
    app_slug = rows[0].get("app")
    lb = await redash_client.execute(Q_LATEST_BUILDS_BY_APP, {"app": app_slug})
    latest = {}
    for r in (lb.get("rows", []) or []):
        latest[r.get("type")] = {"status": r.get("status"), "at": r.get("created_at")}

    for g in reasons:
        info = latest.get(g["platform"]) or {}
        g["latest_build_status"] = info.get("status")
        # ISO-8601 UTC strings compare lexicographically
        g["resolved"] = bool(
            info.get("status") == "success"
            and info.get("at") and g.get("last_failed_at")
            and info["at"] > g["last_failed_at"]
        )

    # Keep ONLY currently-failing platforms. If a platform's LATEST build
    # succeeded, its old failures are resolved history -> drop them entirely.
    current = [g for g in reasons if not g.get("resolved")]

    if not current:
        # Every platform's latest build succeeded -> show nothing but "success".
        return {
            "found": False,
            "app": app_slug,
            "status": "success",
            "note": "Latest build succeeded - no current build failures.",
            "latest_builds": latest,
        }

    # strip the internal resolved/latest fields from the reasons we surface
    for g in current:
        g.pop("resolved", None)
        g.pop("latest_build_status", None)

    failing = ", ".join(g["platform"] for g in current)
    return {
        "found": True,
        "app": app_slug,
        "resolved_via": resolved_via,
        "status_note": "Current build failure on: " + failing,
        "latest_builds": latest,
        "reasons": current,
    }


# --- find expo account ----------------------------------------------------

Q_EXPO_BY_USER = """
SELECT a.id AS app_id, a.name AS app, a.expo_id, ea.owner AS expo_owner
FROM apps a
JOIN expo_accounts ea ON ea.id = a.expo_id
WHERE a.user_id = COALESCE(
        (SELECT user_id FROM apps WHERE id = \'{{ job }}\'),
        (SELECT user_id FROM android_app_configs WHERE job_id = \'{{ job }}\' LIMIT 1),
        (SELECT user_id FROM ios_app_configs WHERE job_id = \'{{ job }}\' LIMIT 1))
ORDER BY a.updated_at DESC NULLS LAST
LIMIT 20
""".strip()

Q_JOB_IDENTIFIERS = """
SELECT app_name, package_name AS pkg FROM android_app_configs WHERE job_id = \'{{ job }}\'
UNION ALL
SELECT app_name, bundle_id AS pkg FROM ios_app_configs WHERE job_id = \'{{ job }}\'
""".strip()


async def _true_owner_by_project(job_id, prefer_expo_id=None):
    """Authoritative account resolution. Find which Expo account actually owns the
    job's EAS project (expo_project_id) using stored robot tokens. Returns a row
    {app, expo_id, expo_owner, expo_project_id} or None (no build / external)."""
    pr = await redash_client.execute(Q_EXPO_PROJECT_ID, {"job": job_id})
    prow = _first(pr.get("rows", []))
    project_id = prow.get("expo_project_id") if prow else None
    if not project_id:
        return None

    def _row(acc, res):
        eapp = res.get("expo_app") or {}
        return {"app": eapp.get("slug") or eapp.get("name"),
                "app_id": None, "expo_id": acc.get("id"),
                "expo_owner": acc.get("owner"), "expo_project_id": project_id}

    # fast path: the DB-preferred account
    if prefer_expo_id:
        tr = await redash_client.execute(Q_EXPO_TOKEN, {"expo_id": prefer_expo_id})
        trow = _first(tr.get("rows", []))
        if trow and trow.get("token"):
            res = await _expo_app_builds(trow["token"], project_id)
            if res.get("found"):
                return _row({"id": prefer_expo_id, "owner": trow.get("owner")}, res)

    # probe every stored account
    allr = await redash_client.execute(
        "SELECT id, owner, token FROM expo_accounts WHERE token IS NOT NULL")
    accts = [a for a in (allr.get("rows", []) or [])
             if a.get("token") and a.get("id") != prefer_expo_id][:80]
    sem = asyncio.Semaphore(12)

    async def probe(a):
        async with sem:
            r = await _expo_app_builds(a["token"], project_id)
        return (a, r) if r.get("found") else None

    hits = [h for h in await asyncio.gather(*[probe(a) for a in accts]) if h]
    if hits:
        a, res = hits[0]
        return _row(a, res)
    return None


@api.post("/expo/lookup")
async def expo_lookup(body: ExpoLookupBody):
    if not body.app_id and not body.job_id:
        raise HTTPException(400, "Provide app_id or job_id")

    # apps.id IS the job id -- resolve directly, no config indirection.
    app_id = body.app_id or body.job_id
    resolved_from = None if body.app_id else "apps.id"

    q = await redash_client.execute(Q_APP_BY_ID, {"app_id": app_id})
    row = _first(q.get("rows", []))

    # Authoritative: if this job actually has a mobile build (an EAS project),
    # resolve the account that really owns it on Expo -- this overrides any DB
    # lineage/owner guess so a job_id always maps to its build's true account.
    if body.job_id:
        _true = await _true_owner_by_project(
            body.job_id, prefer_expo_id=(row.get("expo_id") if row else None))
        if _true:
            return {"found": True,
                    "resolved_from": "expo project owner (live)",
                    "app_id": app_id,
                    "row": _true,
                    "empty_expo": False,
                    "note": "Resolved from the build's actual EAS project on Expo "
                            "(authoritative -- overrides DB lineage guesses)."}

    # Exact resolution via fork lineage: if this job's own app has no Expo
    # account, inherit from the NEAREST ancestor (parent/clone) app that does.
    # This is the account the build actually descends from.
    if (not row or not row.get("expo_id")) and body.job_id:
        up = await redash_client.execute(Q_FORKCHAIN_UP, {"job": body.job_id},
                                         data_source_id=JOBS_DS_ID)
        anc = [r for r in (up.get("rows", []) or []) if r.get("id")]
        ids = [r["id"] for r in anc
               if re.fullmatch(r"[0-9a-fA-F-]{36}", str(r.get("id") or ""))]
        if ids:
            inlist = ", ".join("'" + i + "'" for i in ids)
            aq = await redash_client.execute(
                "SELECT a.name AS app, a.id AS app_id, a.expo_id, "
                "ea.owner AS expo_owner FROM apps a "
                "JOIN expo_accounts ea ON ea.id = a.expo_id "
                "WHERE a.id IN (" + inlist + ")")
            got = {r.get("app_id"): r for r in (aq.get("rows", []) or [])}
            for r in anc:                # nearest ancestor first (depth order)
                if r["id"] in got:
                    row = got[r["id"]]
                    resolved_from = ("apps.id" if r["id"] == app_id
                                     else "fork lineage (ancestor app)")
                    break

    # Fallback: the id matched no apps row -> resolve the slug via pipeline_runs.
    if not row and body.job_id:
        q2 = await redash_client.execute(Q_APP_VIA_PIPELINE, {"job": body.job_id})
        row = _first(q2.get("rows", []))
        if row:
            resolved_from = "pipeline_runs.deployment_name"

    # Fallback 2: a build-config job whose id is not an apps.id. Resolve via the
    # job owner's Expo-linked apps. A user may own several -> rank by name match
    # against the job's app_name / package and also return all candidates.
    if (not row or not row.get("expo_id")) and body.job_id:
        uq = await redash_client.execute(Q_EXPO_BY_USER, {"job": body.job_id})
        cands = uq.get("rows", []) or []
        if cands:
            idq = await redash_client.execute(Q_JOB_IDENTIFIERS, {"job": body.job_id})
            tokens = set()
            for ir in (idq.get("rows", []) or []):
                for v in (ir.get("app_name"), ir.get("pkg")):
                    for t in re.split(r"[^a-z0-9]+", (v or "").lower()):
                        if len(t) >= 3:
                            tokens.add(t)

            def _score(nm):
                nm = (nm or "").lower()
                return sum(1 for t in tokens if t in nm)

            cands.sort(key=lambda c: _score(c.get("app")), reverse=True)
            best = None
            if cands and (len(cands) == 1 or _score(cands[0].get("app")) > 0):
                best = cands[0]
            return {
                "found": True,
                "resolved_from": "user_id (owner account)",
                "app_id": app_id,
                "direct_app": (row.get("app") if row else None),
                "row": best,
                "candidates": cands,
                "note": ("Resolved via the job owner - this user owns multiple "
                        "Expo-linked apps. 'row' is the best name match; "
                        "'candidates' lists all, verify which app is the right one."),
                "empty_expo": bool(best and not best.get("expo_id")),
            }

    if not row:
        return {"found": False,
                "reason": "no apps row for that id and no pipeline_runs match",
                "app_id": app_id, "resolved_from": None}

    return {
        "found": True,
        "app_id": app_id,
        "resolved_from": resolved_from,
        "row": row,
        "query": Q_APP_BY_ID,
        "empty_expo": bool(not row.get("expo_id")),
    }


Q_EXPO_PROJECT_ID = """
SELECT expo_project_id FROM android_app_configs
WHERE job_id = \'{{ job }}\' AND expo_project_id IS NOT NULL
UNION ALL
SELECT expo_project_id FROM ios_app_configs
WHERE job_id = \'{{ job }}\' AND expo_project_id IS NOT NULL
LIMIT 1
""".strip()

Q_EXPO_TOKEN = "SELECT owner, token FROM expo_accounts WHERE id = \'{{ expo_id }}\'"


async def _expo_app_builds(token, project_id):
    """Query live Expo (EAS) for a project's builds using the resolved account's
    own robot token. Returns the app owner + recent builds, or a mismatch note."""
    q = ("query($id:String!){ app{ byId(appId:$id){ id name slug "
         "ownerAccount{name} builds(limit:8,offset:0){ id platform status "
         "createdAt appVersion } } } }")
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                "https://api.expo.dev/graphql",
                headers={"Authorization": "Bearer " + token,
                         "Content-Type": "application/json"},
                json={"query": q, "variables": {"id": project_id}})
    except httpx.HTTPError as e:
        return {"found": False, "error": "Expo unreachable: " + str(e)}
    try:
        data = r.json()
    except Exception:
        return {"found": False, "error": "non-JSON from Expo", "raw": r.text[:400]}
    if data.get("errors"):
        return {"found": False, "errors": data["errors"]}
    app = ((data.get("data") or {}).get("app") or {}).get("byId")
    if not app:
        return {"found": False,
                "note": "The resolved account's token cannot see this EAS project "
                        "-- the build may live under a different Expo account."}
    return {"found": True,
            "expo_app": {"name": app.get("name"), "slug": app.get("slug"),
                         "owner": (app.get("ownerAccount") or {}).get("name")},
            "builds": app.get("builds") or []}


@api.post("/expo/builds")
async def expo_builds(body: ExpoLookupBody):
    """Authoritative cross-check. Take the job's EAS project (expo_project_id) and
    ask Expo who really owns it: first try the DB-resolved account's own token; if
    that account cannot read it, probe every stored account token to find the true
    owner. Expo is the source of truth, so this catches a wrong DB resolution."""
    if not body.job_id:
        return {"ok": False, "error": "job_id required -- run the lookup first."}
    pr = await redash_client.execute(Q_EXPO_PROJECT_ID, {"job": body.job_id})
    prow = _first(pr.get("rows", []))
    project_id = prow.get("expo_project_id") if prow else None
    if not project_id:
        return {"ok": False,
                "error": "This job's config has no expo_project_id (no EAS project yet)."}

    resolved_owner = None
    # 1) fast path: the DB-resolved account
    if body.expo_id:
        tr = await redash_client.execute(Q_EXPO_TOKEN, {"expo_id": body.expo_id})
        trow = _first(tr.get("rows", []))
        if trow and trow.get("token"):
            resolved_owner = trow.get("owner")
            res = await _expo_app_builds(trow["token"], project_id)
            if res.get("found"):
                res.update({"ok": True, "expo_project_id": project_id, "matched": True,
                            "note": "Confirmed on Expo: the resolved account owns this "
                                    "build's EAS project."})
                return res

    # 2) resolved account did not own it -> find the true owner across all accounts
    allr = await redash_client.execute(
        "SELECT id, owner, token FROM expo_accounts WHERE token IS NOT NULL")
    accts = [a for a in (allr.get("rows", []) or [])
             if a.get("token") and a.get("id") != body.expo_id][:80]
    sem = asyncio.Semaphore(12)

    async def probe(a):
        async with sem:
            r = await _expo_app_builds(a["token"], project_id)
        return (a, r) if r.get("found") else None

    hits = [h for h in await asyncio.gather(*[probe(a) for a in accts]) if h]
    if hits:
        a, r = hits[0]
        r.update({"ok": True, "expo_project_id": project_id, "matched": False,
                  "true_owner": a.get("owner"),
                  "note": ("MISMATCH: the DB-resolved account ("
                           + str(resolved_owner) + ") does NOT own this build's EAS "
                           "project. It actually lives under Expo account '"
                           + str(a.get("owner")) + "'.")})
        return r

    return {"ok": True, "found": False, "expo_project_id": project_id,
            "note": ("No stored Expo account can read this EAS project. It may live "
                     "under an external/customer Expo account (not one of ours), or "
                     "resolved account " + str(resolved_owner) + " lacks access.")}


# --- fix identity (destructive, X-Internal-User) --------------------------

@api.post("/identity/ios")
async def set_ios_identity(body: IdentityIosBody):
    payload = {k: v for k, v in
               {"app_name": body.app_name, "bundle_id": body.bundle_id}.items()
               if v}
    if not payload:
        raise HTTPException(400, "Provide at least one of app_name / bundle_id")
    r = await deployer_client.ios_set_identity(body.job_id, payload)
    await audit.log(operator=body.operator or "", action="ios_set_identity",
                    job_id=body.job_id, status_code=r.get("status_code"),
                    details={"payload": payload})
    return r


@api.post("/identity/android")
async def set_android_identity(body: IdentityAndroidBody):
    payload = {k: v for k, v in
               {"app_name": body.app_name, "package_name": body.package_name}.items()
               if v}
    if not payload:
        raise HTTPException(400, "Provide at least one of app_name / package_name")
    r = await deployer_client.android_set_identity(body.job_id, payload)
    await audit.log(operator=body.operator or "", action="android_set_identity",
                    job_id=body.job_id, status_code=r.get("status_code"),
                    details={"payload": payload})
    return r


# --- keystore manager -----------------------------------------------------

def _sanitize_uid(user_id: str) -> str:
    # X-User-ID must be a plain identifier, no header injection.
    if not re.fullmatch(r"[A-Za-z0-9_\-\.]{1,80}", user_id or ""):
        raise HTTPException(400, "Invalid user_id (expected simple identifier)")
    return user_id


@api.get("/keystore/{job_id}")
async def keystore_get(job_id: str, user_id: str):
    _sanitize_uid(user_id)
    r = await deployer_client.android_keystore_get(job_id, user_id)
    return r


@api.post("/keystore/{job_id}")
async def keystore_upload(
    job_id: str,
    user_id: str = Form(...),
    operator: str = Form(""),
    pem_file: UploadFile = File(...),
):
    _sanitize_uid(user_id)
    name = pem_file.filename or "upload.bin"
    lname = name.lower()

    if lname.endswith(".der"):
        raise HTTPException(400, "DER files are public certificates only and cannot sign. "
                                 "Please upload the ORIGINAL keystore (.jks, .pem, or .p12).")

    content = await pem_file.read()

    # convert .jks/.p12 -> .pem before uploading
    converted_note = None
    if lname.endswith(".jks") or lname.endswith(".p12"):
        conv = _convert_keystore_to_pem(content, lname)
        if not conv["ok"]:
            raise HTTPException(400, f"Failed to convert {lname} -> PEM: {conv['error']}")
        content = conv["pem"].encode()
        name = re.sub(r"\.(jks|p12)$", ".pem", name, flags=re.I)
        converted_note = f"Converted {lname} -> PEM before upload"

    r = await deployer_client.android_keystore_upload(
        job_id, user_id, name, content, "application/x-pem-file")

    # Auto-fingerprint on success -- pull fresh row and compute
    fp = None
    if r.get("status_code") in (200, 201, 204):
        # try to compute fingerprint from the just-uploaded pem
        try:
            # We can't extract pkcs7 from a bare PEM public cert -- but we can
            # hash the DER cert. This is a best-effort convenience.
            from cryptography import x509
            from cryptography.hazmat.primitives import hashes, serialization
            cert = x509.load_pem_x509_certificate(content)
            der = cert.public_bytes(serialization.Encoding.DER)
            import hashlib
            fp = {
                "sha1": ":".join(f"{b:02X}" for b in hashlib.sha1(der).digest()),
                "sha256": ":".join(f"{b:02X}" for b in hashlib.sha256(der).digest()),
                "subject": cert.subject.rfc4514_string(),
                "source": "uploaded PEM",
            }
        except Exception as e:  # pragma: no cover
            fp = {"error": f"Could not parse uploaded PEM for fingerprint: {e}"}

    await audit.log(operator=operator, action="keystore_upload",
                    job_id=job_id, status_code=r.get("status_code"),
                    details={"filename": name, "converted": converted_note})

    return {**r, "converted_note": converted_note, "auto_fingerprint": fp}


def _convert_keystore_to_pem(content: bytes, lname: str) -> dict:
    """
    .jks -> .p12 -> .pem via keytool + openssl.
    .p12 -> .pem via openssl.

    Requires `keytool` on PATH for .jks. If missing, returns ok=False with a
    friendly error explaining the operator must convert to .pem locally first.
    """
    import shutil as _sh
    if lname.endswith(".jks") and not _sh.which("keytool"):
        return {"ok": False, "pem": None,
                "error": "keytool (JDK) not present -- convert .jks -> .pem locally "
                         "with `keytool -importkeystore` then re-upload."}
    if not _sh.which("openssl"):
        return {"ok": False, "pem": None, "error": "openssl not present on backend"}

    tmp = tempfile.mkdtemp(prefix="mbr-conv-")
    try:
        src = os.path.join(tmp, "in" + os.path.splitext(lname)[1])
        with open(src, "wb") as f:
            f.write(content)

        if lname.endswith(".jks"):
            p12 = os.path.join(tmp, "in.p12")
            # No password known here -- try with -srcstorepass=<blank>. In practice
            # the operator will paste the password if needed; we surface stderr.
            r = subprocess.run(
                ["keytool", "-importkeystore", "-srckeystore", src,
                 "-destkeystore", p12, "-deststoretype", "PKCS12",
                 "-noprompt"],
                capture_output=True, timeout=60,
            )
            if r.returncode != 0:
                return {"ok": False, "pem": None, "error": r.stderr.decode()[:1000]}
            src = p12

        # .p12 -> .pem
        r = subprocess.run(
            ["openssl", "pkcs12", "-in", src, "-passin", "pass:", "-nokeys", "-clcerts"],
            capture_output=True, timeout=30,
        )
        if r.returncode != 0:
            return {"ok": False, "pem": None,
                    "error": "openssl pkcs12 failed (probably needs a password). "
                             "Convert to .pem locally first."}
        r2 = subprocess.run(
            ["openssl", "x509", "-outform", "PEM"],
            input=r.stdout, capture_output=True, timeout=15,
        )
        if r2.returncode != 0:
            return {"ok": False, "pem": None, "error": r2.stderr.decode()[:1000]}
        return {"ok": True, "pem": r2.stdout.decode(), "error": None}
    finally:
        try:
            import shutil as _sh2
            _sh2.rmtree(tmp, ignore_errors=True)
        except Exception:
            pass


# --- creds & retry (iOS) --------------------------------------------------

@api.post("/creds/clear-asc/preview")
async def clear_asc_preview(body: JobBody):
    """Show every job that shares the same (user_id, itc_team_id) -- these will
    also be cleared if the operator opts into batch mode."""
    r = await redash_client.execute(Q_IOS_CFG, {"job": body.job_id})
    row = _first(r.get("rows", []))
    if not row:
        return {"found": False, "jobs": [], "user_id": None, "itc_team_id": None}
    u, t = row.get("user_id"), row.get("itc_team_id")
    if not u or not t:
        return {"found": True, "jobs": [], "user_id": u, "itc_team_id": t,
                "reason": "row missing user_id or itc_team_id"}
    r2 = await redash_client.execute(Q_ASC_BATCH, {"u": u, "t": t})
    return {
        "found": True,
        "user_id": u,
        "itc_team_id": t,
        "jobs": [str(x["job_id"]) for x in (r2.get("rows") or []) if x.get("job_id")],
        "query": Q_ASC_BATCH,
    }


@api.post("/creds/clear-asc")
async def clear_asc(body: ClearAscBody):
    targets = [body.job_id]
    if body.batch:
        prev = await clear_asc_preview(JobBody(job_id=body.job_id))
        targets = list({*targets, *prev.get("jobs", [])})

    results = []
    for jid in targets:
        r = await deployer_client.ios_clear_asc(jid)
        results.append({"job_id": jid, **r})
        await audit.log(operator=body.operator or "", action="ios_clear_asc",
                        job_id=jid, status_code=r.get("status_code"),
                        details={"batch": body.batch, "root_job": body.job_id})
    return {"batch": body.batch, "count": len(results), "results": results}


@api.post("/creds/testflight-retry")
async def testflight_retry(body: TestflightRetryBody):
    r = await deployer_client.ios_testflight_retry(body.job_id)
    await audit.log(operator=body.operator or "", action="ios_testflight_retry",
                    job_id=body.job_id, status_code=r.get("status_code"))
    return r


@api.post("/creds/expo-rebuild")
async def expo_rebuild(body: ExpoBuildActionBody):
    args = {k: v for k, v in {
        "appId": body.app_id, "platform": body.platform,
        "profile": body.profile}.items() if v}
    r = await mcp_client.expo_tool("build_run", args)
    await audit.log(operator=body.operator or "", action="expo_build_run",
                    job_id=body.job_id, status_code=r.get("status"),
                    details={"args": args})
    return r


# --- signing fingerprint --------------------------------------------------

@api.post("/fingerprint/lookup")
async def fingerprint_lookup(body: JobBody):
    r = await redash_client.execute(Q_FINGERPRINT_UNION, {"job": body.job_id})
    return {"rows": r.get("rows", []), "query": Q_FINGERPRINT_UNION,
            "ok": r["ok"], "error": r.get("error")}


@api.post("/fingerprint/from-url")
async def fingerprint_from_url(body: FingerprintUrlBody):
    try:
        fp = await signing.fingerprints_from_url(body.url)
    except Exception as e:
        raise HTTPException(400, f"Fingerprint failed: {e}")
    return fp


@api.post("/fingerprint/from-upload")
async def fingerprint_from_upload(file: UploadFile = File(...)):
    content = await file.read()
    try:
        fp = signing.fingerprints_from_bytes(content)
    except Exception as e:
        raise HTTPException(400, f"Fingerprint failed: {e}")
    return fp


# --- PEM / KMS tools ------------------------------------------------------

@api.post("/pem/extract-upload-key")
async def extract_upload_key(body: ExtractUploadKeyBody):
    # 1. read encrypted password from DB
    r_pw = await redash_client.execute(Q_KEYSTORE_PW, {"job": body.job_id})
    row = _first(r_pw.get("rows", []))
    if not row or not row.get("keystore_password"):
        raise HTTPException(404, "No keystore_password row for that job_id")
    encrypted = row["keystore_password"]

    # 2. KMS decrypt
    dec = await kms_shell.kms_decrypt(encrypted)
    if not dec["reachable"] or not dec["ok"]:
        await audit.log(operator=body.operator or "", action="pem_extract_upload_key",
                        job_id=body.job_id, status_code=None,
                        details={"stage": "decrypt", "error": dec.get("error")})
        return {"stage": "decrypt", "reachable": dec["reachable"],
                "ok": False, "error": dec.get("error"),
                "note": "KMS decrypt requires kubectl + VPN. In prod this "
                        "runs against the deployer pod."}

    # 3. gsutil cp
    tmpdir = tempfile.mkdtemp(prefix="mbr-pem-")
    p12 = os.path.join(tmpdir, "keystore.p12")
    ds = await kms_shell.gsutil_download_keystore(body.job_id, p12)
    if not ds["reachable"] or not ds["ok"]:
        return {"stage": "gsutil", **ds}

    # 4. openssl -> PEM
    pemres = await kms_shell.openssl_p12_to_pem(p12, dec["plaintext"] or "")
    try:
        os.unlink(p12)
    except OSError:
        pass

    await audit.log(operator=body.operator or "", action="pem_extract_upload_key",
                    job_id=body.job_id, status_code=None,
                    details={"ok": pemres["ok"]})

    return {"stage": "done", **pemres}


@api.post("/pem/encrypt-p8")
async def encrypt_p8(operator: str = Form(""), p8_file: UploadFile = File(...)):
    content = await p8_file.read()
    r = await kms_shell.kms_encrypt_p8(content)
    await audit.log(operator=operator, action="p8_encrypt",
                    job_id=None, status_code=None,
                    details={"filename": p8_file.filename, "ok": r.get("ok")})
    return r


@api.post("/pem/force-regen")
async def force_regen(body: ForceRegenBody):
    if body.platform == "ios":
        r = await redash_client.execute(Q_FORCE_REGEN_IOS, {"job": body.job_id})
    elif body.platform == "android":
        r = await redash_client.execute(Q_FORCE_REGEN_ANDROID, {"job": body.job_id})
    else:
        raise HTTPException(400, "platform must be 'ios' or 'android'")

    await audit.log(operator=body.operator or "", action=f"force_regen_{body.platform}",
                    job_id=body.job_id, status_code=None,
                    details={"error": r.get("error")})
    return r


# --- generic MCP passthrough (advanced) -----------------------------------

JOBS_DS_ID = int(os.environ.get("JOBS_DS_ID", "10"))

Q_FORKCHAIN_UP = """
WITH RECURSIVE up AS (
  SELECT id, title, status, parent_job_id, cloned_parent_job_id, created_at, 0 AS depth
  FROM jobs WHERE id = \'{{ job }}\'
  UNION ALL
  SELECT j.id, j.title, j.status, j.parent_job_id, j.cloned_parent_job_id, j.created_at, up.depth + 1
  FROM jobs j JOIN up ON j.id = COALESCE(up.parent_job_id, up.cloned_parent_job_id)
  WHERE up.depth < 10
)
SELECT id, title, status, parent_job_id, cloned_parent_job_id, created_at, depth
FROM up ORDER BY depth
""".strip()

Q_FORKCHAIN_CHILDREN = """
SELECT id, title, status, parent_job_id, cloned_parent_job_id, created_at
FROM jobs
WHERE parent_job_id = \'{{ job }}\' OR cloned_parent_job_id = \'{{ job }}\'
ORDER BY created_at DESC
LIMIT 50
""".strip()


@api.post("/forkchain")
async def forkchain(body: JobBody):
    """Show a job's fork/clone lineage: its ancestors (parent chain up to the
    original) and its direct children, so you can see where this session's job
    is connected. Reads the jobs table (DS10)."""
    up = await redash_client.execute(Q_FORKCHAIN_UP, {"job": body.job_id},
                                     data_source_id=JOBS_DS_ID)
    ch = await redash_client.execute(Q_FORKCHAIN_CHILDREN, {"job": body.job_id},
                                     data_source_id=JOBS_DS_ID)
    chain = up.get("rows", []) or []
    if not chain:
        return {"found": False,
                "reason": "job not found in jobs table (check the id)",
                "job_id": body.job_id, "error": up.get("error")}

    node = chain[0]
    ancestors = chain[1:]          # nearest parent first, original last
    children = ch.get("rows", []) or []
    root = ancestors[-1] if ancestors else node

    if ancestors:
        summary = ("Forked from '" + str(root.get("title")) + "' ("
                   + str(root.get("id")) + "). "
                   + str(len(ancestors)) + " ancestor(s), "
                   + str(len(children)) + " child(ren).")
    else:
        summary = ("Root job - not forked from anything. "
                   + str(len(children)) + " child(ren).")

    return {
        "found": True,
        "job": node,
        "ancestors": ancestors,
        "children": children,
        "root": root,
        "summary": summary,
    }


SUPRSEND_DS_ID = int(os.environ.get("SUPRSEND_DS_ID", "18"))

Q_OWNER_SLUGS = """
SELECT title FROM jobs
WHERE created_by = (SELECT created_by FROM jobs WHERE id = \'{{ job }}\')
  AND title IS NOT NULL
""".strip()


@api.post("/suprsend")
async def suprsend_lookup(body: JobBody):
    """Which of this job owner's app slugs is connected to SuprSend (push relay)?
    Resolve every slug the owner has (jobs.title, DS10), then look them up in the
    push_apps / push_apps_suprsend tables (DS18 integration-proxy)."""
    if not body.job_id:
        return {"found": False, "error": "job_id required"}
    sq = await redash_client.execute(Q_OWNER_SLUGS, {"job": body.job_id},
                                     data_source_id=JOBS_DS_ID)
    if not sq.get("ok"):
        return {"found": False, "error": sq.get("error") or "slug query failed"}
    slugs = [r.get("title") for r in (sq.get("rows", []) or []) if r.get("title")]
    # keep real slugs only (drop the job's own untitled UUID rows), dedup, cap
    uniq = [x for x in dict.fromkeys(slugs)
            if not re.fullmatch(r"[0-9a-fA-F-]{36}", x or "")][:500]
    if not uniq:
        return {"found": False, "job_id": body.job_id,
                "reason": "no named app slugs found for this job's owner."}

    inlist = ", ".join("'" + x.replace("'", "''") + "'" for x in uniq)
    q = ("SELECT p.app_id, p.provider, s.workspace_slug, s.provisioned_at "
         "FROM push_apps p "
         "LEFT JOIN push_apps_suprsend s ON s.push_app_id = p.id "
         "WHERE p.app_id IN (" + inlist + ")")
    pr = await redash_client.execute(q, data_source_id=SUPRSEND_DS_ID)
    if not pr.get("ok"):
        return {"found": False, "error": pr.get("error") or "push_apps query failed",
                "slug_count": len(uniq)}
    rows = pr.get("rows", []) or []
    connected = [r for r in rows if r.get("workspace_slug")]
    return {
        "found": True,
        "job_id": body.job_id,
        "slug_count": len(uniq),
        "push_apps": rows,
        "suprsend_connected": connected,
        "note": ((str(len(connected)) + " slug(s) connected to SuprSend.")
                 if connected else
                 "None of this owner's slugs are connected to SuprSend."),
    }


@api.post("/mcp/deployer")
async def mcp_deployer(body: McpToolBody):
    return await mcp_client.deployer_tool(body.tool, body.args)


@api.post("/mcp/expo")
async def mcp_expo(body: McpToolBody):
    return await mcp_client.expo_tool(body.tool, body.args)


# --- audit ----------------------------------------------------------------

@api.get("/audit")
async def audit_recent(limit: int = 100):
    return {"entries": await audit.recent(min(max(1, limit), 500))}


# --- health / config -------------------------------------------------------

@public_api.get("/health")
async def health():
    return {
        "ok": True,
        "redash_configured": bool(os.environ.get("REDASH_URL") and os.environ.get("REDASH_API_KEY")),
        "deployer_configured": bool(os.environ.get("DEPLOYER_URL")),
        "deployer_mcp_configured": bool(os.environ.get("DEPLOYER_MCP_URL")),
        "expo_mcp_configured": bool(os.environ.get("EXPO_MCP_URL")),
        "expo_mcp_authed": bool(os.environ.get("EXPO_MCP_TOKEN")),
        "auth_allowed_domain": os.environ.get("AUTH_ALLOWED_DOMAIN", "emergent.sh"),
    }


@public_api.get("/")
async def root():
    return {"service": "mobile-build-resolver", "ok": True}


# --- auth -----------------------------------------------------------------

@public_api.post("/auth/session")
async def auth_session(request: Request, response: Response):
    """Exchange a one-time session_id (from Emergent Auth) for a persistent session.

    Enforces the @emergent.sh allowlist. Sets an HttpOnly cookie and also returns
    the session_token so programmatic clients can use Bearer auth.
    """
    sid = request.headers.get("X-Session-ID") or ""
    if not sid:
        # Fallback: also accept in JSON body for clients that can't set headers
        try:
            body = await request.json()
            sid = body.get("session_id") or ""
        except Exception:
            pass
    if not sid:
        raise HTTPException(400, "Missing X-Session-ID header")

    data = await auth_mod.exchange_session_id(sid)
    email = (data.get("email") or "").strip()
    auth_mod.enforce_domain(email)

    user_id = await auth_mod.create_or_update_user(
        db,
        email=email,
        name=data.get("name") or email,
        picture=data.get("picture"),
    )
    token = data.get("session_token") or ""
    if not token:
        raise HTTPException(502, "Emergent Auth returned no session_token")
    await auth_mod.store_session(db, user_id, token)
    auth_mod.set_session_cookie(response, token)

    return {
        "user_id": user_id,
        "email": email,
        "name": data.get("name") or email,
        "picture": data.get("picture"),
    }


@public_api.get("/auth/me")
async def auth_me(user: auth_mod.User = protected):
    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
    }


@public_api.post("/auth/logout")
async def auth_logout(
    response: Response,
    session_token: str | None = Cookie(default=None),  # noqa: F821
    authorization: str | None = Header(default=None),  # noqa: F821
):
    token = auth_mod._extract_token(session_token, authorization)
    if token:
        await auth_mod.delete_session(db, token)
    auth_mod.clear_session_cookie(response)
    return {"ok": True}


# --- mount ----------------------------------------------------------------

app.include_router(public_api)
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX", "https?://.*"),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    client.close()
