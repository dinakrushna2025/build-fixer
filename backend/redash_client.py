"""
Direct Redash HTTP API client.

Wraps `execute_adhoc_query` against a single data source (DS5 = Deployer PG by default).
Handles both:
  - synchronous responses (cached query_result)
  - async job responses (poll /api/jobs/<id> then GET /api/query_results/<id>)
"""
from __future__ import annotations

import asyncio
import os
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _cfg() -> tuple[str, str, int]:
    url = os.environ.get("REDASH_URL", "").rstrip("/")
    key = os.environ.get("REDASH_API_KEY", "")
    ds = int(os.environ.get("REDASH_DS_ID", "5"))
    return url, key, ds


async def _poll_job(client: httpx.AsyncClient, base: str, headers: dict,
                    job_id: str, deadline: float) -> dict:
    """
    Poll Redash /api/jobs/<id>.

    Statuses: 1=pending, 2=started, 3=success, 4=failure, 5=cancelled.
    Returns the query_result_id on success.
    """
    while asyncio.get_event_loop().time() < deadline:
        r = await client.get(f"{base}/api/jobs/{job_id}", headers=headers)
        r.raise_for_status()
        j = r.json().get("job", {})
        status = j.get("status")
        if status == 3:
            return {"ok": True, "query_result_id": j.get("query_result_id")}
        if status in (4, 5):
            return {"ok": False, "error": j.get("error") or f"job status={status}"}
        await asyncio.sleep(0.5)
    return {"ok": False, "error": "poll deadline exceeded"}


async def execute(query: str, parameters: dict[str, Any] | None = None,
                  timeout: float = 45, data_source_id: int | None = None) -> dict:
    """
    Run an ad-hoc SQL query against Redash. Returns:
        { "ok": bool, "rows": [...], "columns": [...], "raw": {...}, "error": str | None }
    """
    url, key, ds = _cfg()
    if data_source_id is not None:
        ds = data_source_id
    if not url or not key:
        return {"ok": False, "rows": [], "columns": [], "raw": None,
                "error": "REDASH_URL / REDASH_API_KEY not configured on backend"}

    body = {
        "query": query,
        "data_source_id": ds,
        "parameters": parameters or {},
        "max_age": 0,
    }
    headers = {
        "Authorization": f"Key {key}",
        "Content-Type": "application/json",
    }

    loop = asyncio.get_event_loop()
    deadline = loop.time() + timeout

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(f"{url}/api/query_results", json=body, headers=headers)
            if r.status_code != 200:
                return {"ok": False, "rows": [], "columns": [],
                        "raw": r.text[:2000],
                        "error": f"Redash HTTP {r.status_code}"}
            payload = r.json()

            # sync path: query_result already present
            qr = payload.get("query_result")

            # async path: got a job -> poll
            if qr is None and payload.get("job"):
                job_id = payload["job"]["id"]
                jr = await _poll_job(client, url, headers, job_id, deadline)
                if not jr["ok"]:
                    return {"ok": False, "rows": [], "columns": [],
                            "raw": None, "error": jr.get("error")}
                qres = await client.get(
                    f"{url}/api/query_results/{jr['query_result_id']}",
                    headers=headers,
                )
                qres.raise_for_status()
                qr = qres.json().get("query_result", {})

            if not qr:
                return {"ok": False, "rows": [], "columns": [],
                        "raw": payload, "error": "no query_result in response"}

            data = qr.get("data", {}) or {}
            return {
                "ok": True,
                "rows": data.get("rows", []),
                "columns": data.get("columns", []),
                "raw": {
                    "runtime": qr.get("runtime"),
                    "retrieved_at": qr.get("retrieved_at"),
                    "data_source_id": qr.get("data_source_id"),
                },
                "error": None,
            }
    except httpx.HTTPError as e:
        logger.warning("redash unreachable: %s", e)
        return {"ok": False, "rows": [], "columns": [], "raw": None,
                "error": f"Redash unreachable: {e}"}
