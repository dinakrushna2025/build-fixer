"""
Simple audit log stored in MongoDB.

Every action taken through the tool (destructive or not) is written here with:
  - operator name (from the top-bar field, free-text)
  - action name
  - job_id (if applicable)
  - HTTP status returned by the downstream endpoint
  - short details blob (redacted -- never store raw creds)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any


class AuditLog:
    def __init__(self, db):
        self.col = db["audit_log"]

    async def log(self, *, operator: str, action: str, job_id: str | None,
                  status_code: int | None, details: dict[str, Any] | None = None) -> dict:
        doc = {
            "id": str(uuid.uuid4()),
            "operator": operator or "anonymous",
            "action": action,
            "job_id": job_id or None,
            "status_code": status_code,
            "details": details or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self.col.insert_one(doc)
        return doc

    async def recent(self, limit: int = 100) -> list[dict]:
        cur = self.col.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit)
        return await cur.to_list(length=limit)
