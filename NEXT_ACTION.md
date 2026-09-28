# Next action

## Phase 2 — closed on revised scope

- **Original verdict (2026-09-27, preserved):** NOT PASS — BLOCKED. On `bee4390` every deterministic check passed, but 11 SaaS sandbox-live checks couldn't run without credentials.
- **Owner decision (2026-09-28):** those 11 checks are out of scope for the Phase 2 gate only. **Revised verdict: PASS — revised Phase 2 scope; 11 external live checks deferred.** Baseline re-verified: no code changed between `bee4390` and the decision commit.
- **Deferred checks stay BLOCKED — missing credentials.** They are release requirements R-01…R-11 in `SCOPE_MATRIX.md` → *Release acceptance* (credentials and verification steps listed there). Those integrations are implemented and contract-tested but **not** live-verified. Don't call the product Production Ready until they pass, unless the owner approves a release-scope change.
- **Not authorised:** production deployment and live payments.

## Phase 3 — delivered on branch `phase-3` (release report: `docs/implementation/RELEASE_REPORT.md`)

- **Verdicts:** CODE COMPLETE **YES** · STAGING VERIFIED **YES, with stated limits** · PRODUCTION APPROVED **NO**.
- **Release:** code `ce08d9f`, image `flowline:ce08d9f` (`sha256:eb536049…`); local staging `http://localhost:3200`
  (`FLOWLINE_IMAGE=flowline:ce08d9f docker compose -f docker-compose.staging.yml --env-file .env.staging up -d`).
- **Tests on the release revision:** unit 108, contract 97, integration 263, E2E Chromium+Firefox 63/63, WebKit 14/14.
- **Independent QA:** Codex code review (7 findings fixed), Fable security matrix (1 fixed), Codex staging browser QA
  (5 findings) + 2 retests (2 more findings fixed) → `artifacts/phase-3/codex-qa*/`.
- **Known limitation:** Copilot's proposal quality with the local 7B model is not verified (the safety contract is).
- **Release evidence:** rollback across migrations, backup → clean restore, DB outage, load L-1…L-6 (`artifacts/phase-3/`).

## Phase 4 — launch candidate & private beta: IN PROGRESS on branch `phase-4`

Owner decisions during Phase 4: **Arabic-first** product (Arabic default + RTL, English secondary); implementation by
a swarm of **Opus 5.5** subagents in separate worktrees (removed after merge); reviews by **Codex gpt-6-astra** and
**Fable 5.1**; goal is production readiness (production deploy / live payments still need explicit owner approval).

Done (merged on `phase-4` @ adf3248, gates green: unit 135, contract 123, integration 320):
- Entry gate (smoke 8/8 on ce08d9f), Phase 4 scope section in SCOPE_MATRIX.
- Arabic-first i18n: shell, landing, auth, onboarding, invite, Flows dashboard, builder/canvas, run history +
  inspector, templates, email/account pages (RTL app-wide).
- Email delivery + account flows: verification (required), reset, invitation email, account deletion, notices.
  E2E runs under required verification via the test-only outbox route.
- Invitation-only beta access (invites / hashed beta codes / admin allowlist) with sign-up UX: beta-code field,
  pre-check with a real refusal, check-inbox state; invitation carried through verification.
- Paddle sandbox billing behind the provider abstraction (Stripe stays a workflow integration).
- Telemetry + correlation ids + funnel report; retention job; shared PostgreSQL rate limiting.
- Ops status + monitor (alert/recovery verified); beta stack verified locally; runbook, user guide (Arabic first),
  limitations, privacy/safety drafts.
- Beta UX: BETA badge; user menu has Report an issue / Contact support (FLOWLINE_SUPPORT_EMAIL,
  FLOWLINE_FEEDBACK_URL; disabled with a reason when unset) and Account (resend verification, delete).
- Fable 5.1 security review: 0 P0/P1; 6 of 7 fixed, 1 P3 accepted (artifacts/phase-4/fable-security/REVIEW.md).
- Copilot benchmark harness (12 fixed requests): local qwen2.5:7b 5/12.

Running: `FL-wt-w2b2` (Opus: Arabic settings/agents/knowledge/integrations + Copilot EXPERIMENTAL badge);
full E2E Chromium+Firefox on adf3248; Codex gpt-6-astra review of ce08d9f..adf3248.

Next: merge W2-B2 → E2E 3 browsers → beta image + release checks (smoke, rollback, backup-restore, beta load) →
Chrome QA (Codex, real Chrome) → PHASE4_BETA_REPORT + SCOPE_MATRIX statuses → verdicts → push.

BLOCKED on owner inputs: hosted AI key (Copilot benchmark), Resend/Postmark, Paddle sandbox, Google/Slack/GitHub test
accounts + OAuth apps, domain/DNS + VPS for `beta.<domain>`.

## Waiting for the user (only you can do these)

1. **Production approval** — not given; nothing was deployed to production and no live payments were enabled.
2. **Credentials to close the BLOCKED rows** (dedicated sandbox/test accounts only; put them in `.env`, never in chat):
   `FLOWLINE_LIVE_*` for R-01…R-11 then `pnpm test:live:saas`; a Stripe `sk_test_` key + plans/webhook secret for real
   test-mode billing; Google/GitHub OAuth apps (P3-13); an OIDC IdP if SSO should be offered.
3. **Product decisions:** an email provider for password reset / verification / account deletion (P3-08); whether
   presence (P3-10) and light mode (P3-11) are wanted; or an explicit release-scope change for R-01…R-11.

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
