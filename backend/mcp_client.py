"""
Minimal MCP client speaking Streamable-HTTP (MCP spec 2025-06-18).

Used server-side ONLY. Two servers:
  - deployer  : http://deployer-mcp.internal-apps.emergentagent.com/mcp   (no auth)
  - expo      : https://mcp.expo.dev/mcp                                  (bearer)

Each call re-initializes a session -- cheap and stateless from the caller's POV.
Errors are returned in-band ({"reachable": False, "error": "..."}) so the UI can
render a friendly banner instead of a 500.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_PROTOCOL = "2025-06-18"


def _parse_body(r: httpx.Response) -> Any:
    """MCP servers may respond as SSE or plain JSON. Handle both."""
    ct = r.headers.get("content-type", "")
    text = r.text
    if "event-stream" in ct or text.startswith("event:") or "\ndata:" in text:
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("data:"):
                data = line[5:].strip()
                if data and data != "[DONE]":
                    try:
                        return json.loads(data)
                    except json.JSONDecodeError:
                        continue
        return None
    try:
        return r.json()
    except Exception:
        return text


async def _call_tool(url: str, name: str, args: dict[str, Any],
                     token: str | None = None, timeout: float = 45) -> dict:
    if not url:
        return {"reachable": False, "error": "MCP url not configured", "result": None}

    hdrs = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if token:
        hdrs["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            # 1. initialize -> get session id
            init_body = {
                "jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": {
                    "protocolVersion": _PROTOCOL,
                    "capabilities": {},
                    "clientInfo": {"name": "mobile-build-resolver", "version": "0.1"},
                },
            }
            r = await c.post(url, json=init_body, headers=hdrs)
            if r.status_code == 401:
                return {"reachable": False, "status": 401,
                        "error": "MCP requires auth (bearer token missing/invalid)",
                        "result": None}
            if r.status_code >= 400:
                return {"reachable": False, "status": r.status_code,
                        "error": f"MCP initialize HTTP {r.status_code}", "result": None}
            sid = r.headers.get("mcp-session-id")
            if not sid:
                return {"reachable": False, "error": "MCP did not return session id",
                        "result": None}
            hdrs["mcp-session-id"] = sid

            # 2. notify initialized
            await c.post(url, json={
                "jsonrpc": "2.0", "method": "notifications/initialized", "params": {},
            }, headers=hdrs)

            # 3. call the tool
            call_body = {
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {"name": name, "arguments": args},
            }
            r2 = await c.post(url, json=call_body, headers=hdrs)
    except httpx.HTTPError as e:
        return {"reachable": False, "error": f"MCP transport error: {e}",
                "result": None}

    if r2.status_code >= 400:
        return {"reachable": True, "status": r2.status_code,
                "error": f"MCP HTTP {r2.status_code}",
                "result": _parse_body(r2)}

    payload = _parse_body(r2) or {}
    if isinstance(payload, dict) and payload.get("error"):
        return {"reachable": True, "status": r2.status_code,
                "error": payload["error"].get("message", "MCP error"),
                "result": payload}
    result = payload.get("result") if isinstance(payload, dict) else payload
    return {"reachable": True, "status": r2.status_code, "error": None,
            "result": result}


# ---- deployer MCP --------------------------------------------------------

async def deployer_tool(name: str, args: dict[str, Any]) -> dict:
    url = os.environ.get("DEPLOYER_MCP_URL", "").strip()
    return await _call_tool(url, name, args)


# ---- expo MCP ------------------------------------------------------------

async def expo_tool(name: str, args: dict[str, Any]) -> dict:
    url = os.environ.get("EXPO_MCP_URL", "").strip()
    token = os.environ.get("EXPO_MCP_TOKEN", "").strip() or None
    return await _call_tool(url, name, args, token=token)
