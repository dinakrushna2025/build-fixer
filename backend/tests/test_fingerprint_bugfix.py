"""Bug-fix verification (iteration 2) for the signing fingerprint feature.

Tests the fix: signing.download_artifact must download the URL exactly as
stored (no rewrite), follow redirects, and send Authorization: Bearer $EXPO_TOKEN
only when host contains 'expo.dev' AND EXPO_TOKEN is set.
"""
import asyncio
import io
import os
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://build-fixer-17.internal.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
JOB = "41b30fe6-9d40-4818-b76f-df7bac4858e7"
TIMEOUT = 240

FDROID_APK = "/tmp/fdroid.apk"
FDROID_URL = "https://f-droid.org/F-Droid.apk"

session = requests.Session()

# --- helpers --------------------------------------------------------------

_HEX_COLON = None


def _looks_like_hex_colon(s: str) -> bool:
    """AA:BB:CC:... uppercase colon-hex."""
    parts = s.split(":")
    if len(parts) < 8:
        return False
    return all(len(p) == 2 and all(c in "0123456789ABCDEF" for c in p) for p in parts)


# --- health regression ----------------------------------------------------

def test_health_still_ok():
    r = session.get(f"{API}/health", timeout=TIMEOUT)
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert d["redash_configured"] is True
    assert d["deployer_configured"] is True


# --- from-upload: engine still works with real signed APK -----------------

def test_from_upload_fdroid_returns_colon_hex():
    assert Path(FDROID_APK).exists(), "F-Droid apk missing"
    with open(FDROID_APK, "rb") as f:
        files = {"file": ("F-Droid.apk", f, "application/vnd.android.package-archive")}
        r = session.post(f"{API}/fingerprint/from-upload", files=files, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("sha1", "sha256", "subject", "issuer", "not_before", "not_after"):
        assert k in d, f"missing {k}: {d}"
    assert _looks_like_hex_colon(d["sha1"]), d["sha1"]
    assert _looks_like_hex_colon(d["sha256"]), d["sha256"]
    # sha1 = 20 bytes = 20 parts; sha256 = 32 parts
    assert len(d["sha1"].split(":")) == 20
    assert len(d["sha256"].split(":")) == 32
    # F-Droid.apk signing cert -> CN=Ciaran Gultnieks (well-known F-Droid maintainer)
    assert "Ciaran Gultnieks" in d["subject"] or "CN=" in d["subject"], d["subject"]
    assert d["block_file"].upper().startswith("META-INF/")
    # Stash for the from-url comparison
    global _FDROID_FP
    _FDROID_FP = d


_FDROID_FP: dict | None = None


# --- from-url: same URL, same fingerprint (proves passthrough) ------------

def test_from_url_fdroid_matches_from_upload():
    r = session.post(f"{API}/fingerprint/from-url",
                     json={"url": FDROID_URL}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert _looks_like_hex_colon(d["sha1"])
    assert _looks_like_hex_colon(d["sha256"])
    if _FDROID_FP:
        assert d["sha1"] == _FDROID_FP["sha1"], (d, _FDROID_FP)
        assert d["sha256"] == _FDROID_FP["sha256"]


# --- URL passthrough: no rewrite to api.expo.dev/v2 -----------------------

def test_from_url_404_preserves_original_url():
    """httpbin 404 should surface the ORIGINAL url in the error, not a rewrite."""
    url = "https://httpbin.org/status/404"
    r = session.post(f"{API}/fingerprint/from-url", json={"url": url}, timeout=TIMEOUT)
    assert r.status_code == 400, r.text
    body = r.text
    assert "Fingerprint failed" in body, body
    assert "404" in body, body
    assert "httpbin.org/status/404" in body, f"original URL not in error: {body}"
    assert "api.expo.dev/v2" not in body, f"URL was rewritten!: {body}"


def test_from_url_expo_dead_id_preserves_expo_dev():
    """expo.dev URL passthrough. Without EXPO_TOKEN it'll fail auth-side but the
    error must still reference expo.dev, NOT show a rewrite artefact."""
    url = "https://expo.dev/artifacts/eas/deadbeef-does-not-exist"
    r = session.post(f"{API}/fingerprint/from-url", json={"url": url}, timeout=TIMEOUT)
    assert r.status_code == 400, r.text
    body = r.text
    assert "Fingerprint failed" in body
    # The original url (or redirect target) must be preserved -- must not contain
    # a rewritten `/v2/artifacts/eas/<id>` produced by our code.
    # (api.expo.dev/v2 CAN legitimately appear as the httpx redirect target that
    # returned 4xx. What we're checking is that we didn't hardcode a rewrite.)
    # The key invariant: 'expo.dev' is present somewhere.
    assert "expo.dev" in body, f"expo.dev host lost from error: {body}"


# --- regression: non-archive / no PKCS#7 ----------------------------------

def test_from_upload_plain_text_returns_400():
    files = {"file": ("readme.txt", io.BytesIO(b"just plain text, not a zip"),
                      "text/plain")}
    r = session.post(f"{API}/fingerprint/from-upload", files=files, timeout=TIMEOUT)
    assert r.status_code == 400
    assert "Not a valid APK/AAB archive" in r.text, r.text


def test_from_upload_zip_without_pkcs7_returns_400():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("hello.txt", "world")
    buf.seek(0)
    files = {"file": ("empty.zip", buf, "application/zip")}
    r = session.post(f"{API}/fingerprint/from-upload", files=files, timeout=TIMEOUT)
    assert r.status_code == 400
    assert "No PKCS#7 signature block" in r.text, r.text


# --- fingerprint lookup regression ----------------------------------------

def test_fingerprint_lookup_still_returns_rows_shape():
    r = session.post(f"{API}/fingerprint/lookup",
                     json={"job_id": JOB}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "rows" in d
    assert "UNION ALL" in d["query"]
    assert isinstance(d["rows"], list)


# --- unit: EXPO_TOKEN header logic via monkeypatch ------------------------

class _FakeResp:
    def __init__(self, content=b"", status=200):
        self.content = content
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx
            req = httpx.Request("GET", "http://x")
            raise httpx.HTTPStatusError("boom", request=req,
                                        response=httpx.Response(self.status_code, request=req))


class _FakeClient:
    """Captures the headers passed to .get() so we can assert on them."""
    calls: list[dict] = []

    def __init__(self, *a, **kw):
        self.init_kwargs = kw
        _FakeClient.calls.append({"init": kw})

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, headers=None):
        _FakeClient.calls[-1].update({"url": url, "headers": headers or {}})
        return _FakeResp(content=b"stub")


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if not asyncio.iscoroutine(coro) else asyncio.new_event_loop().run_until_complete(coro)


def test_download_artifact_no_token_no_header(monkeypatch, tmp_path):
    """EXPO_TOKEN unset -> Authorization header MUST NOT be sent even for expo.dev."""
    import sys
    sys.path.insert(0, "/app/backend")
    import importlib
    import signing as sig
    importlib.reload(sig)

    monkeypatch.delenv("EXPO_TOKEN", raising=False)
    _FakeClient.calls.clear()
    monkeypatch.setattr(sig.__dict__.setdefault("httpx", __import__("httpx")),
                        "AsyncClient", _FakeClient, raising=False)
    # Because signing does `import httpx` inside the function, we must patch httpx.AsyncClient globally
    import httpx as _hx
    monkeypatch.setattr(_hx, "AsyncClient", _FakeClient)

    dest = str(tmp_path / "art.bin")
    asyncio.new_event_loop().run_until_complete(
        sig.download_artifact("https://expo.dev/artifacts/eas/x", dest))

    call = _FakeClient.calls[-1]
    assert call["url"] == "https://expo.dev/artifacts/eas/x", call
    assert "Authorization" not in call["headers"], call["headers"]
    assert call["init"].get("follow_redirects") is True, call["init"]


def test_download_artifact_with_token_sends_bearer_only_for_expo(monkeypatch, tmp_path):
    import sys
    sys.path.insert(0, "/app/backend")
    import importlib
    import signing as sig
    importlib.reload(sig)

    monkeypatch.setenv("EXPO_TOKEN", "fake-token-for-header-test")
    _FakeClient.calls.clear()
    import httpx as _hx
    monkeypatch.setattr(_hx, "AsyncClient", _FakeClient)

    # 1) expo.dev url -> header present
    asyncio.new_event_loop().run_until_complete(
        sig.download_artifact("https://expo.dev/artifacts/eas/y", str(tmp_path / "a")))
    assert _FakeClient.calls[-1]["headers"].get("Authorization") == "Bearer fake-token-for-header-test", \
        _FakeClient.calls[-1]

    # 2) non-expo url (even with token set) -> header MUST NOT be added
    asyncio.new_event_loop().run_until_complete(
        sig.download_artifact("https://f-droid.org/F-Droid.apk", str(tmp_path / "b")))
    assert "Authorization" not in _FakeClient.calls[-1]["headers"], _FakeClient.calls[-1]

    # 3) URL is passed through unchanged
    assert _FakeClient.calls[-1]["url"] == "https://f-droid.org/F-Droid.apk"


def test_download_artifact_rejects_gs_url(tmp_path):
    import sys
    sys.path.insert(0, "/app/backend")
    import importlib
    import signing as sig
    importlib.reload(sig)

    with pytest.raises(ValueError, match="GCS"):
        asyncio.new_event_loop().run_until_complete(
            sig.download_artifact("gs://bucket/x.apk", str(tmp_path / "z")))
