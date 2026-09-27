# Next action

Phase 2 (automation platform) is implemented on branch `phase-2`. The gate on `bee4390` is **NOT PASS — BLOCKED**: every deterministic check passes (lint, typecheck, unit 80, contract 82, integration 110, E2E 32; nothing skipped), but the sandbox-live checks for 11 SaaS integrations can't run without credentials. See `artifacts/phase-2/REPORT.md`.

## Waiting for the user

1. **Sandbox credentials** (dedicated test accounts only) as `FLOWLINE_LIVE_<PROVIDER>` in `.env` (format in `.env.example`) for Google Sheets, Gmail, Slack, HubSpot, Zendesk, Airtable, Snowflake, GitHub, Stripe, Notion, Linear. Then run `pnpm test:live`, update each adapter's `verification.live`, and re-run the gate. **Or** explicitly accept these live checks as out of scope for Phase 2.
2. After that: merge `phase-2`, then start Phase 3 with its own prompt. Phase 3 has not been started.

## Open minor items

- CX2-R01: a dev-mode React hydration console warning Codex saw on Templates/Runs/Integrations; not reproducible so far.
- CX2-01: the Docker Desktop port proxy on :5433 stalled while another project's containers were being started/stopped. Flowline now fails fast and recovers; for long test sessions, avoid heavy parallel Docker work on the same machine.

## Resume or verify locally

```bash
pnpm install --frozen-lockfile
pnpm db:up && pnpm db:migrate && pnpm db:migrate:test
pnpm dev                 # http://localhost:3000 (web + worker)
pnpm check               # lint + typecheck + unit + contract + integration
pnpm test:e2e            # starts the test stack on :3100 with provider doubles on :4010/:4011
pnpm test:live           # real Ollama + Postgres; SaaS BLOCKED without FLOWLINE_LIVE_* credentials
pnpm stop:test           # if a leftover stack holds :3100
```
