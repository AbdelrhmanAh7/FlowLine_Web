# Next action

## Phase 2 — closed on revised scope

- **Original verdict (2026-09-27, preserved):** NOT PASS — BLOCKED. On `bee4390` every deterministic check passed, but 11 SaaS sandbox-live checks couldn't run without credentials.
- **Owner decision (2026-09-28):** those 11 checks are out of scope for the Phase 2 gate only. **Revised verdict: PASS — revised Phase 2 scope; 11 external live checks deferred.** Baseline re-verified: no code changed between `bee4390` and the decision commit.
- **Deferred checks stay BLOCKED — missing credentials.** They are release requirements R-01…R-11 in `SCOPE_MATRIX.md` → *Release acceptance* (credentials and verification steps listed there). Those integrations are implemented and contract-tested but **not** live-verified. Don't call the product Production Ready until they pass, unless the owner approves a release-scope change.
- **Not authorised:** production deployment and live payments.

## Phase 3 — in progress on branch `phase-3` (prompt received 2026-09-28)

State at `03a99d7` (update this block as work lands):
- Built and tested: agents (ALLOW/ASK/DENY in the backend), knowledge, Copilot, members/roles/invites, sharing,
  versioning/rollback, API keys + `/api/v1`, usage accounting, billing (Stripe-compatible adapter, test mode only,
  verified against the test double), OIDC SSO (verified against a test IdP only), audit log, REL-LIVE-SUITE
  (live rows stay BLOCKED without credentials).
- Gates at `ee265ea`: lint/typecheck clean; unit 98, contract 97, integration 260/260; E2E Chromium+Firefox 60/60,
  WebKit (Linux container, `bash e2e/tools/webkit-docker.sh`) 13/13.
- Independent review: Codex code/security review (7 findings, all fixed with regression tests),
  Fable 5.1 security review + capability × role matrix (1 low finding, fixed).
- Release evidence on candidate `ee265ea` (`artifacts/phase-3/`): rollback (incl. across a migration), backup →
  clean restore, load L-1…L-6 all met, DB outage test (found + fixed a health hang in `72cff16`).
- P3-15 classified (WSL relay on ::1; dev/test now use 127.0.0.1). P3-16: clean in all monitored runs so far.
- **Running:** Codex agent-driven exploratory browser test of staging (`http://localhost:3200`, image
  `flowline:ee265ea`) + retest of CX3 findings, in worktree `../FL-wt-codex` →
  `artifacts/phase-3/codex-qa/REPORT.md`.

Next: fix Codex QA findings → Codex retest → build the final image → rerun `scripts/release/{rollback,backup-restore,db-outage}.mjs`
and `scripts/load/run.mjs` on it → SCOPE_MATRIX statuses → `docs/implementation/RELEASE_REPORT.md` → three verdicts.

## Waiting for the user

- Nothing is blocking the build. Production deployment and live payments are **not** authorised and won't be done.
- **Optional, any time:** sandbox credentials `FLOWLINE_LIVE_*` for R-01…R-11 (see `.env.example`), a Stripe
  `sk_test_` key for a real test-mode billing check, real OAuth apps for Google/GitHub sign-in, an email provider for
  password reset/verification.

## Resume or verify locally

```bash
pnpm install --frozen-lockfile
pnpm db:up && pnpm db:migrate && pnpm db:migrate:test
pnpm dev                 # http://localhost:3000 (web + worker)
pnpm check               # lint + typecheck + unit + contract + integration
pnpm test:e2e            # test stack on :3100 with provider doubles on :4010/:4011 (Chromium + Firefox)
bash e2e/tools/webkit-docker.sh  # WebKit @critical/@cross-browser, needs the test stack running (pnpm dev:test)
pnpm test:live           # real Ollama + Postgres; SaaS BLOCKED without FLOWLINE_LIVE_* credentials
pnpm stop:test           # if a leftover stack holds :3100
```
