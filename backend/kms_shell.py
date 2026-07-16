"""
Shell wrappers for KMS / GCS / openssl operations.

These run against the deployer pod via kubectl exec (see docs in the problem
statement). In environments without kubectl/gsutil/gcloud (e.g. the preview
sandbox), each call returns a graceful `{"reachable": false, ...}` payload so
the UI can still render the flow. Real calls light up automatically once the
binaries + VPN are present.
"""
from __future__ import annotations

import asyncio
import base64
import os
import shutil
from typing import Any


def _has(bin_name: str) -> bool:
    return shutil.which(bin_name) is not None


async def _run(cmd: list[str], stdin: bytes | None = None, timeout: float = 60) -> dict:
    """Run a subprocess, capture stdout+stderr."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE if stdin is not None else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(input=stdin), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return {"ok": False, "stdout": "", "stderr": "timeout", "returncode": -1}
    return {
        "ok": proc.returncode == 0,
        "stdout": out.decode(errors="replace"),
        "stderr": err.decode(errors="replace"),
        "returncode": proc.returncode,
    }


def _env_ctx() -> dict[str, str]:
    return {
        "kubectl": os.environ.get("KUBECTL_BIN", "kubectl"),
        "context": os.environ.get("KUBECTL_CONTEXT", ""),
        "namespace": os.environ.get("DEPLOYER_NAMESPACE", "default"),
        "pod": os.environ.get("DEPLOYER_POD", "deployer"),
        "kms_project": os.environ.get("KMS_PROJECT", "emergent-default"),
        "kms_location": os.environ.get("KMS_LOCATION", "us-central1"),
        "kms_keyring_ios": os.environ.get("KMS_KEYRING_IOS", "ios-credentials"),
        "kms_keyring_android": os.environ.get("KMS_KEYRING_ANDROID", "android-credentials"),
        "kms_key": os.environ.get("KMS_KEY", "credentials-key"),
        "android_gcs_bucket": os.environ.get(
            "ANDROID_GCS_BUCKET", "emergent-default-android-credentials"),
    }


# --- KMS: decrypt DB-stored keystore_password blob ------------------------

async def kms_decrypt(encrypted_blob: str) -> dict[str, Any]:
    """
    Take the DB-stored `kms::...` blob and produce plaintext.

    In prod: runs `kubectl exec ... /tmp/decrypt_password ...` on the deployer
    pod. In sandbox: returns a `reachable=false` shell so the UI still works.
    """
    ctx = _env_ctx()
    if not _has(ctx["kubectl"]):
        return {"reachable": False, "ok": False, "plaintext": None,
                "error": "kubectl not present in this environment. "
                         "Available on the jumpbox / deployer host once deployed."}
    # Best-effort: pipe blob into the decrypt binary inside the pod.
    cmd = [ctx["kubectl"]]
    if ctx["context"]:
        cmd += ["--context", ctx["context"]]
    cmd += ["exec", "-n", ctx["namespace"], ctx["pod"], "-i", "--",
            "/tmp/decrypt_password",
            ctx["kms_project"], ctx["kms_location"],
            ctx["kms_keyring_android"], ctx["kms_key"], "-"]
    res = await _run(cmd, stdin=encrypted_blob.encode())
    return {"reachable": True, "ok": res["ok"],
            "plaintext": res["stdout"].strip() if res["ok"] else None,
            "error": None if res["ok"] else res["stderr"][:2000]}


# --- GCS: download job keystore.p12 ---------------------------------------

async def gsutil_download_keystore(job_id: str, dest: str) -> dict[str, Any]:
    ctx = _env_ctx()
    src = f"gs://{ctx['android_gcs_bucket']}/job_{job_id}/keystore.p12"
    if not _has("gsutil"):
        return {"reachable": False, "ok": False, "path": None, "source": src,
                "error": "gsutil not present in this environment"}
    res = await _run(["gsutil", "cp", src, dest])
    return {"reachable": True, "ok": res["ok"], "path": dest if res["ok"] else None,
            "source": src,
            "error": None if res["ok"] else res["stderr"][:2000]}


# --- openssl: extract public PEM from p12 ---------------------------------

async def openssl_p12_to_pem(p12_path: str, password: str) -> dict[str, Any]:
    if not _has("openssl"):
        return {"reachable": False, "ok": False, "pem": None,
                "error": "openssl not present"}
    # openssl pkcs12 -in in.p12 -passin pass:<pw> -nokeys -clcerts | openssl x509 -outform PEM
    r1 = await _run(["openssl", "pkcs12", "-in", p12_path, "-passin",
                     f"pass:{password}", "-nokeys", "-clcerts"])
    if not r1["ok"]:
        return {"reachable": True, "ok": False, "pem": None,
                "error": r1["stderr"][:2000]}
    r2 = await _run(["openssl", "x509", "-outform", "PEM"], stdin=r1["stdout"].encode())
    return {"reachable": True, "ok": r2["ok"],
            "pem": r2["stdout"] if r2["ok"] else None,
            "error": None if r2["ok"] else r2["stderr"][:2000]}


# --- .p8 encrypt for DB (iOS) ---------------------------------------------

async def kms_encrypt_p8(p8_bytes: bytes) -> dict[str, Any]:
    """
    Encrypts a raw .p8 file and returns the `kms::` blob to store in Postgres.
    """
    ctx = _env_ctx()
    if not _has(ctx["kubectl"]):
        return {"reachable": False, "ok": False, "kms_blob": None,
                "error": "kubectl not present in this environment"}
    b64 = base64.b64encode(p8_bytes).decode()
    cmd = [ctx["kubectl"]]
    if ctx["context"]:
        cmd += ["--context", ctx["context"]]
    cmd += ["exec", "-n", ctx["namespace"], ctx["pod"], "-i", "--",
            "sh", "-c",
            "b=$(cat); echo $b | base64 -d > /tmp/key.p8 && "
            f"/tmp/encrypt_password {ctx['kms_project']} {ctx['kms_location']} "
            f"{ctx['kms_keyring_ios']} {ctx['kms_key']} /tmp/key.p8"]
    res = await _run(cmd, stdin=b64.encode())
    return {"reachable": True, "ok": res["ok"],
            "kms_blob": res["stdout"].strip() if res["ok"] else None,
            "error": None if res["ok"] else res["stderr"][:2000]}
