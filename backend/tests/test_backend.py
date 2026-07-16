"""Backend integration tests for Mobile Build Resolver.

Runs against the LIVE preview backend which itself proxies live internal
Redash / deployer / MCP endpoints. See /app/test_reports/iteration_1.json.
"""
import io
import os
import re
import uuid
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL",
                          "https://build-fixer-17.internal.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
JOB = "41b30fe6-9d40-4818-b76f-df7bac4858e7"
OWNER_UID = "8a5f8361-7922-4e36-ae0e-083310753430"
TIMEOUT = 90

session = requests.Session()


# --- health ---------------------------------------------------------------

def test_health():
    r = session.get(f"{API}/health", timeout=TIMEOUT)
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert d["redash_configured"] is True
    assert d["deployer_configured"] is True
    assert d["deployer_mcp_configured"] is True


# --- diagnose -------------------------------------------------------------

@pytest.fixture(scope="module")
def diagnose_result():
    r = session.post(f"{API}/diagnose", json={"job_id": JOB}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def test_diagnose_banner(diagnose_result):
    d = diagnose_result
    assert d["banner"]["found"] is True
    assert d["banner"]["platform"] == "iOS + Android"
    labels = [f["label"] for f in d["banner"]["flags"]]
    assert any("keystore_path is NULL" in l for l in labels), labels
    assert any("No AAB/APK URL" in l for l in labels), labels
    assert d["ios"]["ok"] is True
    assert d["android"]["ok"] is True
    assert d["resolved_user_id"] == OWNER_UID


def test_diagnose_sensitive_redacted(diagnose_result):
    """Sensitive fields must be {present, masked}, never raw."""
    sensitive = {"keystore_password", "fastlane_session", "api_key_issuer_id"}
    for side in ("ios", "android"):
        row = diagnose_result[side]["row"]
        if not row:
            continue
        for key in sensitive & set(row):
            v = row[key]
            assert isinstance(v, dict), f"{side}.{key} not redacted: {v!r}"
            assert set(v.keys()) >= {"present", "masked"}


def test_diagnose_no_raw_pem_or_b64_blobs(diagnose_result):
    """Sweep entire response for anything resembling raw PEM/PKCS material."""
    import json
    blob = json.dumps(diagnose_result)
    assert "BEGIN CERTIFICATE" not in blob
    assert "BEGIN RSA PRIVATE KEY" not in blob
    assert "BEGIN PRIVATE KEY" not in blob
    # long base64 (>200 chars unbroken alnum/+/=) is suspicious
    long_b64 = re.findall(r"[A-Za-z0-9+/]{300,}={0,2}", blob)
    assert not long_b64, f"Suspicious raw blob(s) found: lengths={[len(x) for x in long_b64]}"


def test_diagnose_unknown_job():
    r = session.post(f"{API}/diagnose",
                     json={"job_id": str(uuid.uuid4())}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["banner"]["found"] is False
    assert d["ios"]["row"] is None
    assert d["android"]["row"] is None
    assert d["resolved_user_id"] is None


def test_diagnose_logs():
    r = session.post(f"{API}/diagnose/logs", json={"job_id": JOB}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "cloudbuild" in d and "pipeline" in d
    for k in ("cloudbuild", "pipeline"):
        e = d[k]
        assert "reachable" in e
        assert ("result" in e) or ("error" in e)


# --- expo -----------------------------------------------------------------

def test_expo_lookup_by_job():
    r = session.post(f"{API}/expo/lookup", json={"job_id": JOB}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    if d["found"]:
        assert d["resolved_from"] in ("ios_app_configs", "android_app_configs")
    else:
        assert isinstance(d.get("reason"), str)


def test_expo_lookup_missing_args():
    r = session.post(f"{API}/expo/lookup", json={}, timeout=TIMEOUT)
    assert r.status_code == 400


def test_expo_builds_unauthed():
    """EXPO_MCP_TOKEN empty -> reachable=false with auth error, no 500."""
    r = session.post(f"{API}/expo/builds", json={"app_id": "x"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("reachable") is False
    err = (d.get("error") or "").lower()
    assert ("401" in err) or ("auth" in err) or ("bearer" in err) or ("token" in err), err


# --- identity -------------------------------------------------------------

def test_identity_ios_missing_body():
    r = session.post(f"{API}/identity/ios", json={"job_id": JOB}, timeout=TIMEOUT)
    assert r.status_code == 400


def test_identity_ios_ok():
    r = session.post(f"{API}/identity/ios",
                     json={"job_id": JOB, "bundle_id": "com.probe.test",
                           "operator": "testbot"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "reachable" in d
    assert "status_code" in d


def test_identity_android_missing_body():
    r = session.post(f"{API}/identity/android", json={"job_id": JOB}, timeout=TIMEOUT)
    assert r.status_code == 400


def test_identity_android_ok():
    r = session.post(f"{API}/identity/android",
                     json={"job_id": JOB, "package_name": "com.probe.test",
                           "operator": "testbot"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "reachable" in d and "status_code" in d


# --- keystore -------------------------------------------------------------

def test_keystore_get():
    r = session.get(f"{API}/keystore/{JOB}", params={"user_id": OWNER_UID},
                    timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "status_code" in d


def test_keystore_get_invalid_user_id():
    r = session.get(f"{API}/keystore/{JOB}",
                    params={"user_id": "../etc/passwd"}, timeout=TIMEOUT)
    assert r.status_code == 400


def test_keystore_upload_rejects_der():
    files = {"pem_file": ("test.der", b"\x30\x82\x00\x00", "application/octet-stream")}
    data = {"user_id": OWNER_UID, "operator": "testbot"}
    r = session.post(f"{API}/keystore/{JOB}", files=files, data=data, timeout=TIMEOUT)
    assert r.status_code == 400
    assert "DER files are public certificates only" in r.text


# --- clear-asc ------------------------------------------------------------

def test_clear_asc_preview():
    r = session.post(f"{API}/creds/clear-asc/preview",
                     json={"job_id": JOB}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "found" in d
    assert "user_id" in d
    assert "itc_team_id" in d
    assert "jobs" in d


def test_clear_asc_execute():
    r = session.post(f"{API}/creds/clear-asc",
                     json={"job_id": JOB, "operator": "testbot", "batch": False},
                     timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["batch"] is False
    assert d["count"] == 1
    assert isinstance(d["results"], list) and len(d["results"]) == 1
    res = d["results"][0]
    assert res["job_id"] == JOB
    assert "reachable" in res and "status_code" in res


def test_testflight_retry():
    r = session.post(f"{API}/creds/testflight-retry",
                     json={"job_id": JOB, "operator": "testbot"}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "status_code" in d


# --- fingerprint ----------------------------------------------------------

def test_fingerprint_lookup():
    r = session.post(f"{API}/fingerprint/lookup", json={"job_id": JOB}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "rows" in d
    assert "UNION ALL" in d["query"]


def test_fingerprint_from_url_bad_archive():
    r = session.post(f"{API}/fingerprint/from-url",
                     json={"url": "https://httpbin.org/bytes/1024"}, timeout=TIMEOUT)
    assert r.status_code == 400
    body = r.text.lower()
    assert ("not a valid apk/aab archive" in body) or ("valid apk" in body) or ("archive" in body), r.text


# --- force regen ----------------------------------------------------------

def test_force_regen_invalid_platform():
    r = session.post(f"{API}/pem/force-regen",
                     json={"job_id": JOB, "platform": "invalid", "operator": "x"},
                     timeout=TIMEOUT)
    assert r.status_code == 400
    assert "platform" in r.text.lower()


def test_force_regen_android_no_500():
    r = session.post(f"{API}/pem/force-regen",
                     json={"job_id": JOB, "platform": "android", "operator": "testbot"},
                     timeout=TIMEOUT)
    assert r.status_code == 200, r.text


def test_force_regen_ios_no_500():
    r = session.post(f"{API}/pem/force-regen",
                     json={"job_id": JOB, "platform": "ios", "operator": "testbot"},
                     timeout=TIMEOUT)
    assert r.status_code == 200, r.text


# --- pem / kms ------------------------------------------------------------

def test_extract_upload_key():
    r = session.post(f"{API}/pem/extract-upload-key",
                     json={"job_id": JOB, "operator": "testbot"}, timeout=TIMEOUT)
    # 404 (no keystore_password) OR 200 with reachable=false (kubectl missing) both acceptable
    assert r.status_code in (200, 404), r.text
    if r.status_code == 200:
        d = r.json()
        # kms shell must not throw; sandbox has no kubectl
        assert "reachable" in d or "stage" in d


def test_encrypt_p8_no_kubectl():
    files = {"p8_file": ("test.p8", b"-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
                          "application/x-pem-file")}
    data = {"operator": "testbot"}
    r = session.post(f"{API}/pem/encrypt-p8", files=files, data=data, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("reachable") is False


# --- MCP passthrough ------------------------------------------------------

def test_mcp_deployer_passthrough():
    r = session.post(f"{API}/mcp/deployer",
                     json={"tool": "fetch_app_details",
                           "args": {"identifier": "nonexistent-app"}},
                     timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("reachable") is True


# --- audit ----------------------------------------------------------------

def test_audit_has_entries():
    # Give async writes a beat
    time.sleep(1)
    r = session.get(f"{API}/audit", timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "entries" in d
    assert len(d["entries"]) >= 1
    e = d["entries"][0]
    for k in ("operator", "action", "timestamp"):
        assert k in e
