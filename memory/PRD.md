# Mobile Build Resolver — PRD

## Original problem statement
Internal L3 support tool that wraps Emergent's iOS/Android mobile-build
diagnostics behind a clean web UI. It replaces the copy-paste-curls workflow
used by support engineers with a single React + FastAPI app that speaks:

- **Redash** (DS5 = Deployer PG) for all SQL ground truth
- **Deployer HTTP** (VPN-internal) for identity/keystore/testflight endpoints
- **MCP servers**: `mcp__deployer` for build logs, `mcp__expo` for live EAS state
- **Shell tools**: gcloud + kubectl + gsutil + openssl for KMS/PEM/fingerprint

## Architecture

**Frontend** (`/app/frontend`): React + TS + Tailwind, Public Sans + JetBrains Mono,
zinc palette, indigo-600 accent, dark-mode toggle. Fixed left sidebar (7 features),
persistent job_id + operator top bar.

**Backend** (`/app/backend`): FastAPI proxy. All secrets stay server-side.
Modules:
- `redash_client.py` — async HTTP wrapper (job poll)
- `deployer_client.py` — internal deployer curls with correct auth style
- `mcp_client.py` — Streamable-HTTP MCP client (session init + tool call)
- `signing.py` — pure-python PKCS#7 SHA-1/SHA-256 fingerprint
- `kms_shell.py` — kubectl / gsutil / openssl subprocess helpers with graceful sandbox fallback
- `audit.py` — MongoDB audit log for every action

**Env vars** (all backend-only): `REDASH_URL`, `REDASH_API_KEY`, `REDASH_DS_ID`,
`DEPLOYER_URL`, `DEPLOYER_API_KEY`, `DEPLOYER_MCP_URL`, `EXPO_MCP_URL`,
`EXPO_MCP_TOKEN`, plus KMS_* / ANDROID_GCS_BUCKET for shell chain.

## User persona
Emergent support engineers on the L3 mobile build rotation. VPN-authenticated,
trusted, but not senior deployer devs. They need to diagnose failing iOS/Android
builds without memorising curls, SQL, or KMS commands.

## Core requirements (static)
1. UI never sees internal URLs/keys — every call goes through the FastAPI proxy.
2. Two auth styles kept strictly separate (X-Internal-User vs X-User-ID).
3. Never render raw keystore passwords, KMS blobs, or private keys.
4. Destructive actions require typed-confirmation modal (retype job_id).
5. Every action writes an audit line (operator, action, job_id, status, ts).
6. Semantic colour chips (green/amber/red) consistent everywhere.
7. Response drawer shows raw HTTP status + body for every action.

## Implemented (2026-07-16)
- **7/7 features** wired end-to-end:
  1. Diagnose — Redash ios+android configs, red-flag banner, MCP log pull
  2. Find Expo Account — by job_id or app_id (auto-resolve), MCP cross-check
  3. Fix App Identity — iOS + Android tabs, typed-confirm modal, audit
  4. Keystore Manager — GET lookup + POST upload (.pem/.jks/.p12 auto-convert), .der reject, auto-fingerprint on success
  5. Creds & Retry (iOS) — clear-asc (with batch preview), TestFlight retry, EAS rebuild via MCP
  6. Signing Fingerprint — union query, from-URL, from-upload; pure-python PKCS#7
  7. PEM / KMS Tools — chained upload-key extraction, .p8 encrypt for DB, force-regen SQL
- Live Redash queries (adhoc + parameter template `{{ job }}` + job polling)
- MCP Streamable-HTTP client (initialize → session id → tools/call)
- Graceful sandbox fallback for shell tools (kubectl / gsutil not installed here → `reachable=false` payload)
- MongoDB audit log at `/api/audit`
- Backend `.env` populated with real REDASH/DEPLOYER URLs

## Backlog (P1 → P2)
- P1: Auth on the tool itself (currently VPN-only, no login). Add SSO if opened up beyond L3.
- P1: Wire real `mcp__expo` token once ops team provisions one.
- P1: Add saved-searches / recent jobs list for common failure patterns.
- P2: Streamed build-log viewer (SSE from MCP fetch_cloudbuild_logs).
- P2: Slack / Discord webhook when destructive actions run.
- P2: Screenshot + description attachment on audit entries.

## Next tasks
- Run testing subagent (backend integration coverage)
- If any critical bugs surface, fix and re-run
- Ship
