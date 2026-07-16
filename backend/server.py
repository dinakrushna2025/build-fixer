"""
Mobile Build Resolver -- FastAPI backend proxy.

All UI traffic goes: browser -> this backend -> internal endpoint / MCP.
Secrets (REDASH_API_KEY, DEPLOYER_URL, MCP tokens, ...) stay server-side.
"""
from __future__ import annotations

import io
import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, UploadFile
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
from audit import AuditLog

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

# --- app + db -------------------------------------------------------------

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
audit = AuditLog(db)

app = FastAPI(title="Mobile Build Resolver")
api = APIRouter(prefix="/api")

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


@api.post("/diagnose/logs")
async def diagnose_logs(body: JobBody):
    """Pull real EAS / Cloud Build failure logs from the deployer MCP."""
    r_cb = await mcp_client.deployer_tool("fetch_cloudbuild_logs",
                                          {"identifier": body.job_id})
    r_pl = await mcp_client.deployer_tool("fetch_pipeline_logs",
                                          {"identifier": body.job_id})
    return {"cloudbuild": r_cb, "pipeline": r_pl}


# --- find expo account ----------------------------------------------------

@api.post("/expo/lookup")
async def expo_lookup(body: ExpoLookupBody):
    if not body.app_id and not body.job_id:
        raise HTTPException(400, "Provide app_id or job_id")

    # apps.id IS the job id -- resolve directly, no config indirection.
    app_id = body.app_id or body.job_id
    resolved_from = None if body.app_id else "apps.id"

    q = await redash_client.execute(Q_APP_BY_ID, {"app_id": app_id})
    row = _first(q.get("rows", []))

    # Fallback: the id matched no apps row -> resolve the slug via pipeline_runs.
    if not row and body.job_id:
        q2 = await redash_client.execute(Q_APP_VIA_PIPELINE, {"job": body.job_id})
        row = _first(q2.get("rows", []))
        if row:
            resolved_from = "pipeline_runs.deployment_name"

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


@api.post("/expo/builds")
async def expo_builds(body: ExpoLookupBody):
    """Cross-check via mcp__expo. Requires EXPO_MCP_TOKEN env."""
    args: dict[str, Any] = {}
    if body.app_id:
        args["appId"] = body.app_id
    r = await mcp_client.expo_tool("build_list", args)
    return r


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

@api.get("/health")
async def health():
    return {
        "ok": True,
        "redash_configured": bool(os.environ.get("REDASH_URL") and os.environ.get("REDASH_API_KEY")),
        "deployer_configured": bool(os.environ.get("DEPLOYER_URL")),
        "deployer_mcp_configured": bool(os.environ.get("DEPLOYER_MCP_URL")),
        "expo_mcp_configured": bool(os.environ.get("EXPO_MCP_URL")),
        "expo_mcp_authed": bool(os.environ.get("EXPO_MCP_TOKEN")),
    }


@api.get("/")
async def root():
    return {"service": "mobile-build-resolver", "ok": True}


# --- mount ----------------------------------------------------------------

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    client.close()
