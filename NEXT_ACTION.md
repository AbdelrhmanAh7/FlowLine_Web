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

## AI provider hub — IN PROGRESS on branch `ai-hub` (worktree `FL-wt-aihub`, test DB `flowline_test_aihub`)

Owner-approved cloud-only multi-provider hub (prompt 2026-09-29). Base: `phase-4` @ `1a9883f` (= code of `flowline:e42667d`).
Plan: `docs/ai/IMPLEMENTATION_PLAN.md`; requirements AIH-01…AIH-20 in `SCOPE_MATRIX.md` (AI-HUB section).

- Wave A (foundation + OpenAI chat vertical slice): Opus agent running in `FL-wt-aihub` (uncommitted until reviewed).
- Provider verification research (official docs/terms for 26 providers): report goes to the session scratchpad, then
  becomes `docs/ai/PROVIDERS.md`.
- Parallel, unrelated: Kimi building the design system on `design-v2` (`FL-wt-design`).
- Next: review + commit Wave A → Wave B (protocols + 15 core adapters + expansion + routing/budgets + agents/Copilot)
  → Wave C (live certification BLOCKED without keys; benchmark needs an owner budget; Codex review + Chrome QA).
- Resume: `cd ../FL-wt-aihub && git status && pnpm typecheck && pnpm test:integration`.

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
