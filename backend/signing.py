"""
Compute SHA-1 / SHA-256 signing fingerprints for an Android APK or AAB.

Pure-python replacement for `keytool -list -v -printcert`. Reads the PKCS#7
signature block (META-INF/*.RSA|DSA|EC) from the archive, parses the first
X.509 cert, hashes its DER bytes.
"""
from __future__ import annotations

import hashlib
import io
import zipfile
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs7


def _colon_hex(digest: bytes) -> str:
    return ":".join(f"{b:02X}" for b in digest)


def fingerprints_from_bytes(artifact: bytes) -> dict[str, Any]:
    """
    Returns:
        {
          "sha1": "AA:BB:...",
          "sha256": "AA:BB:...",
          "block_file": "META-INF/CERT.RSA",
          "subject": "CN=..."
        }
    Raises ValueError on unrecognised input.
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(artifact))
    except zipfile.BadZipFile as e:
        raise ValueError(f"Not a valid APK/AAB archive: {e}") from e

    block_name = None
    block_bytes: bytes | None = None
    for name in zf.namelist():
        upper = name.upper()
        if upper.startswith("META-INF/") and upper.endswith((".RSA", ".DSA", ".EC")):
            block_name = name
            block_bytes = zf.read(name)
            break

    if not block_bytes:
        raise ValueError("No PKCS#7 signature block (META-INF/*.RSA|DSA|EC) found. "
                         "The artifact may be unsigned or use v2/v3-only signing.")

    try:
        certs = pkcs7.load_der_pkcs7_certificates(block_bytes)
    except Exception as e:
        raise ValueError(f"Failed to parse PKCS#7 block: {e}") from e

    if not certs:
        raise ValueError("PKCS#7 block contained no certificates")

    cert = certs[0]
    der = cert.public_bytes(serialization.Encoding.DER)
    return {
        "sha1": _colon_hex(hashlib.sha1(der).digest()),
        "sha256": _colon_hex(hashlib.sha256(der).digest()),
        "block_file": block_name,
        "subject": cert.subject.rfc4514_string(),
        "issuer": cert.issuer.rfc4514_string(),
        "not_before": cert.not_valid_before_utc.isoformat(),
        "not_after": cert.not_valid_after_utc.isoformat(),
    }


async def download_artifact(url: str, dest: str) -> str:
    """
    Download an APK/AAB artifact to `dest`.

    Rules (per user spec):
      - Do NOT rewrite the URL. The DB stores expo.dev links; we hit those
        directly and let redirects resolve to the signed download.
      - Follow redirects (expo.dev artifact links are signed 302s).
      - Attach `Authorization: Bearer $EXPO_TOKEN` only when the URL host is
        expo.dev and EXPO_TOKEN is configured (private-org artifacts).
    """
    import os
    import httpx  # local import to keep module cheap on cold start

    if url.startswith("gs://"):
        raise ValueError(f"GCS path is not directly downloadable: {url}")

    headers: dict[str, str] = {}
    token = os.environ.get("EXPO_TOKEN", "")
    if token and "expo.dev" in url:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(follow_redirects=True, timeout=180) as c:
        r = await c.get(url, headers=headers)
        r.raise_for_status()
        with open(dest, "wb") as f:
            f.write(r.content)
    return dest


async def fingerprints_from_url(url: str, timeout: float = 180) -> dict[str, Any]:
    """
    Download the artifact via `download_artifact` (which handles expo.dev
    auth + redirects correctly) then extract SHA-1 / SHA-256 fingerprints.
    """
    import os
    import tempfile

    fd, path = tempfile.mkstemp(prefix="mbr-fp-", suffix=".artifact")
    os.close(fd)
    try:
        await download_artifact(url, path)
        with open(path, "rb") as f:
            return fingerprints_from_bytes(f.read())
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
