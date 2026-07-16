"""
Thin HTTP wrapper around internal deployer endpoints.

TWO auth styles -- kept strictly separate:
  - `X-Internal-User: true`     -> /internal/ paths (identity, clear-asc)
  - `X-User-ID: <owner uid>`    -> keystore, testflight retry (owner-scoped)
"""
from __future__ import annotations

import os
from typing import Any

import httpx


def _base() -> str:
    return os.environ.get("DEPLOYER_URL", "").rstrip("/")


def _extra_headers() -> dict[str, str]:
    """Optional shared auth header if the deployer requires one."""
    key = os.environ.get("DEPLOYER_API_KEY", "")
    return {"X-Deployer-Api-Key": key} if key else {}


async def _request(
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    json_body: Any = None,
    files: dict[str, Any] | None = None,
    timeout: float = 45,
) -> dict:
    base = _base()
    if not base:
        return {"reachable": False, "status_code": 0, "body": None,
                "error": "DEPLOYER_URL not configured"}

    hdrs = {**_extra_headers(), **(headers or {})}
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as c:
            if files is not None:
                r = await c.request(method, f"{base}{path}", headers=hdrs, files=files)
            else:
                r = await c.request(method, f"{base}{path}", headers=hdrs, json=json_body)
    except httpx.HTTPError as e:
        return {"reachable": False, "status_code": 0, "body": None,
                "error": f"deployer unreachable: {e}"}

    ct = r.headers.get("content-type", "")
    try:
        body: Any = r.json() if "json" in ct else r.text
    except Exception:
        body = r.text

    return {
        "reachable": True,
        "status_code": r.status_code,
        "body": body,
        "error": None,
    }


# --- iOS identity ---------------------------------------------------------

async def ios_set_identity(job_id: str, payload: dict[str, str]) -> dict:
    return await _request(
        "POST",
        f"/api/v1/ios/internal/jobs/{job_id}/identity",
        headers={"X-Internal-User": "true", "Content-Type": "application/json"},
        json_body=payload,
    )


# --- Android identity -----------------------------------------------------

async def android_set_identity(job_id: str, payload: dict[str, str]) -> dict:
    return await _request(
        "POST",
        f"/api/v1/android/internal/jobs/{job_id}/identity",
        headers={"X-Internal-User": "true", "Content-Type": "application/json"},
        json_body=payload,
    )


# --- iOS clear-asc-credentials --------------------------------------------

async def ios_clear_asc(job_id: str) -> dict:
    return await _request(
        "POST",
        f"/api/v1/ios/internal/jobs/{job_id}/clear-asc-credentials",
        headers={"X-Internal-User": "true"},
    )


# --- iOS testflight retry -------------------------------------------------

async def ios_testflight_retry(job_id: str) -> dict:
    return await _request(
        "POST",
        f"/api/v1/ios/{job_id}/testflight/retry",
    )


# --- Android keystore lookup / upload -------------------------------------

async def android_keystore_get(job_id: str, user_id: str) -> dict:
    return await _request(
        "GET",
        f"/api/v1/android/jobs/{job_id}/keystore",
        headers={"X-User-ID": user_id},
    )


async def android_keystore_upload(job_id: str, user_id: str, filename: str,
                                  content: bytes, content_type: str) -> dict:
    return await _request(
        "POST",
        f"/api/v1/android/jobs/{job_id}/keystore",
        headers={"X-User-ID": user_id},
        files={"pem_file": (filename, content, content_type)},
    )
