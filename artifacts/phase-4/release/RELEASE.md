# Phase 4 beta candidate — immutable release record (P4-21)

| Field | Value |
|---|---|
| Git SHA (code) | `e42667dfba93aa90f6df69d101d87d4ca75a10ee` (branch `phase-4`). Later commits are docs/evidence only. |
| Image | `flowline:e42667d` — image id `sha256:7c92ffa662aee8fa804f3fdce64a34d9bc1d67a2b64687c8b9d248242a9ba674` (local build, not pushed to a registry; ~1.6 GB) |
| Build | `docker build --build-arg GIT_SHA=e42667dfba93aa90f6df69d101d87d4ca75a10ee -t flowline:e42667d .` — `/api/health` reports this revision |
| Migration version | schema version 12 (`drizzle/0000` … `0011_rate_limit.sql`); Phase 4 added 0008 beta access, 0009 product events, 0010 email, 0011 rate limit — all expand-only |
| Environment verified | Local staging (`docker-compose.staging.yml`: web + worker + PostgreSQL 17.6, `http://localhost:3200`), `FLOWLINE_ENV=staging`, `FLOWLINE_BETA_MODE=invite_only`. Beta stack (`deploy/beta/`, Caddy TLS) dry-run verified locally (`artifacts/phase-4/beta-infra/`). **No public beta host yet.** |
| Previous release (rollback target) | `flowline:ce08d9f` (Phase 3) |

## Provider configuration (names only, no values)

| Area | Configuration names | State on the verified environment |
|---|---|---|
| Email | `FLOWLINE_EMAIL_PROVIDER` (`resend`/`postmark`/`outbox`), `FLOWLINE_EMAIL_FROM`, `FLOWLINE_EMAIL_RESEND_KEY` or `FLOWLINE_EMAIL_POSTMARK_TOKEN`, `FLOWLINE_EMAIL_ALLOWED_RECIPIENTS` | `outbox` (DB, no delivery). A real provider needs an owner account plus a verified domain. |
| Beta access | `FLOWLINE_BETA_MODE`, `FLOWLINE_BETA_ADMINS` | `invite_only` |
| Support | `FLOWLINE_SUPPORT_EMAIL`, `FLOWLINE_FEEDBACK_URL` | support email set (QA address) |
| Billing | `FLOWLINE_BILLING_PROVIDER` (`paddle`), `FLOWLINE_BILLING_PADDLE_KEY`, `…_WEBHOOK_SECRET`, `…_CLIENT_TOKEN`, `…_PADDLE_ENV` (`sandbox`), `FLOWLINE_BILLING_PLANS`, `FLOWLINE_BILLING_ALLOW_LIVE` (unset) | not configured (no Paddle sandbox account) |
| AI | `FLOWLINE_AI_PROVIDER`, `FLOWLINE_AI_MODEL`, `OLLAMA_BASE_URL`, `ANTHROPIC_API_KEY` | Ollama `qwen2.5:7b` (local); no hosted key |
| Sign-in | `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | not configured |
| Ops | `FLOWLINE_OPS_TOKEN`, `FLOWLINE_ALERT_WEBHOOK_URL`, `FLOWLINE_RETENTION_*` | ops token set on the beta dry run |

## Checks run on this exact image

| Check | Result | Evidence |
|---|---|---|
| Smoke (invite-only, verified users) | 8/8 PASS | `artifacts/phase-4/smoke/smoke-e42667d-*.json` |
| Rollback `ce08d9f` ↔ `e42667d` (no down migrations) | 11/11 PASS | `artifacts/phase-4/rollback/rollback-e42667d-to-ce08d9f.json` |
| Backup → clean restore → verify (46 tables) | 17/17 PASS | `artifacts/phase-4/backup-restore/backup-restore-e42667d.json` |
| DB outage (stall + hard stop) | 12/12 PASS | `artifacts/phase-4/failure/db-outage-e42667d.json` |
| P4-20 beta load (5 users, 32 flows, 30+3+3 runs, AI, email, pages) | 5/5 targets PASS; no SLA claim | `artifacts/phase-4/load/beta-load-e42667d-*.md` |
