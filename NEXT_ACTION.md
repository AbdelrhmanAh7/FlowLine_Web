# Next action

## Company Builder (Milestones A–C) — feature branch `claude/company-builder-milestones-abc-pmba6v`

Implemented from main 9324b1f in a Claude cloud session (2026-09-30). Report and verdicts: `docs/company-builder/REPORT.md`;
defects: `artifacts/company-builder/20260930-51f1473/BUGS.md`. Feature flag `FLOWLINE_COMPANY_BUILDER=on` (off by default).
NOT merged, NOT deployed; no payments, invitations or DNS/tunnel changes. Owner CLI prototype runs only on the founder's
machine (`docs/company-builder/CLI_PROTOTYPE.md`).

Next owner actions, in order: (1) run the first journey locally (`docs/company-builder/OWNER_TEST_GUIDE.md`);
(2) real Claude/Codex CLI trials on the laptop (CLI_PROTOTYPE.md "Founder runbook"); (3) Codex independent re-test +
real Chrome exploratory QA against this branch; (4) decide merge. Preserved blockers below (DV2-G01 WebKit timeout,
R03, external integrations, owner MFA, Pi) are unchanged by this feature.


## Current main handoff — owner consolidation complete

Merged design-v2 source b40cb38 into main 264e0c7 and pushed main only. See docs/implementation/MAIN_CONSOLIDATION.md and the complete docs/company-builder/CLOUD_IMPLEMENTATION_PROMPT.md. The owner will continue Company Builder implementation with Claude cloud, then return for testing. Company Builder remains unimplemented; React/React DOM already19.3.0. Initial WebKit timeout stays OPEN despite final123/59/59 repeat and actual Chrome10/10 pass. No production/deployment/live-payment/invitation approval; no worktrees removed. Historical pending/paused statements below are superseded by this current handoff.


## Current owner consolidation — 2026-09-30

The owner explicitly requests merging the completed candidate into main for Claude continuation. See docs/implementation/MAIN_CONSOLIDATION.md for current gate, preservation and release limits. Earlier no-merge/no-push statements are historical for this consolidation only. Company Builder is not implemented; its complete updated prompt is docs/company-builder/CLOUD_IMPLEMENTATION_PROMPT.md. React/React DOM are already 19.3.0. Final merge/push is pending; no deployment, live payments or invitations.


## Active private-beta executor — 2026-09-30

Use [BETA_EXECUTION_STATUS.md](docs/implementation/BETA_EXECUTION_STATUS.md), [OWNER_ACTIONS.md](docs/implementation/OWNER_ACTIONS.md) and the binding [BETA_EXECUTION_BRIEF.md](docs/implementation/BETA_EXECUTION_BRIEF.md). These supersede the historical paused/VPS/env-AI instructions below.

HEAD design-v2 remains 776337c. Latest execution checkpoint cp22 is 7a26cb1e5cbaab56cc2cd68e392595fc95983b6b; it adds the Sheets identity permissions, restricted Resend probe warning and guarded current AI-hub benchmark runner. Real index/branch and all existing work are preserved. cp22 lint, main/focused typechecks, unit402 and contract467 passed; integration is running with one recovery-case failure observed. Preserve that failure and diagnose it; no rerun-only acceptance. cp20 browser114/50/50 remains historical coverage, not proof for cp22. Claude review pending.

Local staging runs at http://localhost:3000 on cp21, build F6m0LaSa_-jaq5hCKtlY3, fresh isolated database flowline_beta_local20260930, schema20, worker concurrency1. Supervised exec session66698; stop via write_stdin with stop plus newline. No deletion of old DBs or credentials imported. Named bootstrap code redeemed through masked UI; owner signup completed, real verification endpoint returned200/done and persisted emailVerified. Owner replied done to sign-in; inspect non-sensitive state only after the running heavy suite finishes, then continue /admin/setup to private owner MFA. Never snapshot seeds/recovery codes. Chrome tabs846411899 (setup),846411913 (sign-in),846411866 (Google) are handoff pages.

Google flowline-beta Sheets/Gmail enabled, billing unlinked, External/Testing identity and local sign-in client CREATED by owner. Client secret was not read; owner holds it privately for masked /admin entry. Integration client/test users/fixtures/access grant/live verification are not complete. Owner authorizes safe named secret transfer; password/signup/MFA remain takeover. Aggregate spending cap $0; no paid requests/billing activation/top-ups. Host/domain inputs and exact DNS/exposure/Pi approvals remain pending. MERGED: NO. PUBLIC PRODUCTION APPROVED: NO. No real invitations.

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

## AI provider hub + credentials in the UI: DONE, product blocked on owner credentials (branch `ai-hub`)

**Branch and final code:** `ai-hub` @ **`c2fd494`** (final product code — later commits on `ai-hub` change only
evidence, docs and test infrastructure). Based on `phase-4` `1a9883f` (= code of `flowline:e42667d`). **No immutable
image digest exists for this work**: every gate below ran against the local test stack (`pnpm dev:test`, or a
`next start` production build run manually), not a built/pushed release image. Full report: `docs/ai/AI_HUB_REPORT.md`.
Plan: `docs/ai/IMPLEMENTATION_PLAN.md`. Security design: `docs/security/CREDENTIALS_DESIGN.md`. Scope rows: AIH-01…24
and SEC-01…06 in `SCOPE_MATRIX.md`.

**Gates on `c2fd494`** (`artifacts/ai-hub/gate-final-c2fd494/GATE.md`):
- lint/typecheck clean; unit 285; contract 465; integration 460 (×2).
- **Production build** (`FLOWLINE_TEST_NEXT=start`: `next build` + `next start`): Chromium 66/66, Firefox 24/24 ×2,
  WebKit 24/24 ×2, all first attempt — 0 failures in 5 full suite runs.
- **Dev stack** (`next dev`): Chromium 66/66; Firefox 23/24 ×2; WebKit 23/24 — see INTERMITTENT-02 below.
- Earlier merged gate on `22de627` (predates the CXQ-05 fix): Chromium 65/65, Firefox 24/24, WebKit 24/24
  (`artifacts/ai-hub/gate-final-22de627/GATE.md`).

**Verdicts** (`docs/ai/AI_HUB_REPORT.md` §2):
- CORE IMPLEMENTATION — DONE (contract-tested; live NOT RUN).
- EXPANSION COVERAGE — 23 candidate providers (15 core + 8 expansion): 20 connectable, 3 unsuitable (OpenCode Zen,
  Command Code, NVIDIA), 3 deferred enterprise clouds documented only, 1 retired provider recorded; registry 26 entries.
- LIVE CLOUD VERIFICATION = **BLOCKED** — no owner API keys entered through the UI, no owner-approved spend budget;
  every live check (20 providers, all 5 protocol adapters, streaming, tool calls, routing over priced routes, cost
  reconciliation, error handling, key verification) is NOT RUN.
- COPILOT QUALITY = **EXPERIMENTAL** — only the historical local `qwen2.5:7b` benchmark exists (5/12 vs target
  ≥10/12, from Phase 4, predates the AI hub); the hosted-model benchmark (12 frozen cases, EN+AR) is specified but
  PLANNED, pending an owner-approved budget.
- CHROME QA — original pass 9 PASS/2 FAIL, P0 0/P1 0/P2 2/P3 2; retest on `22de627`: 4/4 original findings fixed,
  4/4 regressions pass, 1 new finding CXQ-05; retest on `c2fd494`: CXQ-05 FIXED, spot-checks PASS, 1 new P3 CXQ-06 (favicon 404, open).
- PRIVATE BETA — unchanged: still blocked by Phase 4 external items (see the Phase 4 section below), still **NO**.
- PUBLIC PRODUCTION APPROVED = **NO** (owner authorisation only).

**Open items:**
- **INTERMITTENT-01** (integration, cause unknown): `ai-review-wavec` agent-run claim path failed intermittently
  across two runs on the round-2 merge, never reproduced again in 7 subsequent runs. A bounded retry + diagnostics
  was added as a **mitigation, not a fix**; Codex's own retest-3 language states this does not prove the hypothesized
  lock-contention cause (`artifacts/ai-hub/wavec-84f2cc1/BUGS.md`).
- **INTERMITTENT-02** (dev-server test infra, OPEN): occasional Settings-page stalls on the **dev** test stack only
  (an invite link or revealed key never appears, or `page.goto` never reaches load) — seen once in Phase 4 and 3× at
  `c2fd494`; isolated re-runs pass; 0 failures in 5 production-build suite runs. Classification: evidence-backed, not
  proven, dev-server artifact. Recommendation: run release E2E against the production build
  (`artifacts/ai-hub/gate-final-c2fd494/GATE.md`).
- **CXQ-06** (P3): `/favicon.ico` 404, a console error on every page; add `src/app/icon.svg` in the next change set.
- **CXH-21** (test-quality finding on the concurrency regression tests: `upTo` swallowed timeouts, `lockWaiting`
  accepted any ungranted lock) — fixed by the lead; **Codex retest not run**.

**Owner actions needed** (`docs/ai/AI_HUB_REPORT.md` §7):
1. Enter **at least 2 real provider keys** through Settings → AI Providers → Add connection — one **direct**
   provider (e.g. OpenAI or Anthropic) and one **gateway** provider (e.g. OpenRouter) — to unblock AIH-17 live
   certification and the credential-UI live checks.
2. Approve a **bounded benchmark budget** so the Copilot benchmark (12 frozen cases, EN+AR, ≤3 routes + a stability
   repeat) can run on a hosted model instead of only the historical local result.
3. **Legal review before a public BYOK launch:** Command Code Provider API (owner/legal go/no-go on the
   sublicensing/transfer prohibition and "automated requests" ban), plus credential-sharing clauses for Cohere
   §4(a)(i), Moonshot §3.2(6), Fireworks §1.2(d), DeepInfra §11(a)(viii), Cloudflare §2.2.1(a), and terms only
   readable as search excerpts for xAI and Mistral.
4. **Phase 4 externals**, unchanged and still required before any private beta: dedicated Sheets/Gmail/Slack/GitHub
   test accounts (P4-08), Google/GitHub OAuth apps (P4-10), a domain + VPS for `beta.<domain>` (P4-11), a
   Resend/Postmark account (P4-05/06), a Paddle sandbox account + client-side token (P4-07) — these are now entered
   through `/admin` (the platform admin panel), not `.env`.

**Deployment/upgrade order** (`docs/ai/MIGRATION.md` "Upgrading an existing Phase 4 deployment: required order"):
1. Set `FLOWLINE_PLATFORM_ENCRYPTION_KEY` (distinct from every workspace key); take a backup.
2. Deploy — migrations `0012`–`0019` run (expand-only).
3. Bootstrap the first platform admin (`scripts/admin/bootstrap.mts --email <admin>`), verify email, enrol TOTP.
4. Import existing Google/Slack/GitHub OAuth apps, sign-in apps, email and Paddle credentials from environment, once
   each, in `/admin`.
5. Run `scripts/admin/rewrap.mts` repeatedly until `remaining=0`; only then retire old keys (long-running on a large
   database — see TEST-03 in `artifacts/ai-hub/wavec-84f2cc1/BUGS.md`).
6. Reconnect or backfill existing Google/Slack/GitHub connections' issuing app provenance.
7. Have customers add their own AI keys under Settings → AI Providers — nothing is imported automatically.

**Paused:** Kimi's `design-v2` run was stopped by the system for low memory. Its 27 files are uncommitted in
`FL-wt-design`. Resume only when the owner asks:
`cd ../FL-wt-design && kimi -c -p "Continue KIMI_BRIEF.md" < /dev/null`.

**GitHub push:** pending until all work — Phase 4 and the AI hub — is finished (owner asked to push only then).

## Phase 4 — launch candidate & private beta: PAUSED for owner credentials (branch `phase-4`)

**Current state (2026-09-28):** release code `e42667d`, image `flowline:e42667d` (`sha256:7c92ffa6…`), schema 12,
running on local staging `http://localhost:3200` in invite-only mode. Report: `docs/implementation/PHASE4_BETA_REPORT.md`;
release record: `artifacts/phase-4/release/RELEASE.md`.

- **Gates on `e42667d`:** lint and typecheck clean; unit 182; contract 124; integration 331; E2E Chromium+Firefox
  81/81 (one earlier full run 80/81 — the API-keys stall under load, open test-infra issue); WebKit 23/23.
- **Release checks on the image:** smoke 8/8, rollback 11/11, backup/restore 17/17, DB outage 12/12, beta load 5/5.
- **Reviews:**
  - Fable security: 6 of 7 fixed, 1 P3 accepted.
  - Codex code review: 7/7 fixed.
  - Codex Chrome QA: 0 P0/P1, 2 P2 — both fixed.
- **Verdicts so far:** CODE COMPLETE PASS · BETA INFRA VERIFIED BLOCKED · PRIVATE BETA READY NO · PUBLIC PRODUCTION NO.

**Paused by the owner** ("stop codex until I get them"): the Codex Chrome retest of CX4Q-01/02 was stopped before it
started testing. Nothing is failing.

**Next, when the owner has added credentials to `.env` (never in chat):**
1. Wire them into staging (`.env.staging`) and restart: `FLOWLINE_IMAGE=flowline:e42667d docker compose -f docker-compose.staging.yml --env-file .env.staging up -d`.
2. Live certification: `pnpm test:live:saas` → `artifacts/phase-4/live-certification/` (Sheets, Gmail, Slack, GitHub).
3. Paddle sandbox journey 8, the real email provider, and the hosted Copilot benchmark:
   `FLOWLINE_AI_PROVIDER=anthropic node scripts/with-env.mjs .env npx tsx scripts/diag/copilot-benchmark.mts`.
4. Domain + VPS → deploy `deploy/beta/`, then `node scripts/release/verify-beta-stack.mjs --base https://beta.<domain>`.
5. Codex Chrome retest + journeys 2–5, 8 (`artifacts/phase-4/codex-qa/RETEST-BRIEF.md`; launch `codex exec … < /dev/null`
   — without closing stdin it waits forever).
6. Update the verdicts, commit, and push to GitHub (owner asked to push only when all work is finished).

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
