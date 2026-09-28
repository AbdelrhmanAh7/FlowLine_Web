# Flowline Phase 4: launch candidate & private beta report

**Status: private-beta candidate.** Every Phase 4 item that needs no external account is built and verified. Everything
that needs an owner-supplied account (domain/host, email provider, Paddle sandbox, SaaS test accounts, OAuth apps,
hosted AI key) is **BLOCKED on credentials**. Nothing here is a production deployment, and no real money can be
collected.

- **Code:** `e42667dfba93aa90f6df69d101d87d4ca75a10ee` on branch `phase-4`. Later commits are docs/evidence only.
- **Image:** `flowline:e42667d` (`sha256:7c92ffa6…`), schema version 12.
- **Release record:** `artifacts/phase-4/release/RELEASE.md`.
- **Beta URL:** none yet. No domain or host has been provided. Verified environments: local staging
  `http://localhost:3200`, and the `deploy/beta` stack dry-run with Caddy TLS on `localhost`.

## Verdicts (p4§17)

| Verdict | Result | Why |
|---|---|---|
| CODE COMPLETE | **PASS** | Every Phase 4 item is implemented with tests. Items that need external accounts are implemented against provider doubles and documented, and their live checks are BLOCKED (below). |
| BETA INFRA VERIFIED | **BLOCKED** | The beta stack is proven on a local dry run: TLS, HTTP→HTTPS, security headers, internal routes blocked, DB/app ports closed, invite-only, backups, and monitor alert + recovery. Backup/restore, rollback and outage checks pass on the release image. There is **no real `beta.<domain>` host yet** (domain/DNS + VPS needed). |
| PRIVATE BETA READY | **NO** | Per p4§18 this needs all of the following, which are not yet true:<ul><li>selected integrations live-certified (blocked: test accounts);</li><li>billing sandbox working with Paddle (blocked: sandbox account);</li><li>email working with a real provider (blocked);</li><li>TLS on the real host (blocked).</li></ul>Everything else in p4§18 passes. |
| PUBLIC PRODUCTION APPROVED | **NO** | Owner authorisation only. |

## What was delivered

| Area | Result | Evidence |
|---|---|---|
| **Arabic-first** (owner decision) | Arabic default + RTL app-wide, English secondary. Every screen, email and product-supplied content (templates, integration catalog) is translated with identical keys. RTL E2E runs at 375/1024/1440. | `src/i18n/`, `e2e/arabic.spec.ts` |
| Email flows | Required verification, reset, invitation email (best-effort, with honest "not emailed" state), account deletion (confirmation link; cancels sole-workspace subscriptions or refuses), security notices. Tokens are hashed, single-use, expiring and purpose-scoped. No enumeration (500 ms floor), shared rate limits, safe redirects, tokens redacted from proxy logs. | `src/server/email/`, `email.test.ts`, `p4-security-fixes.test.ts` |
| Invitation-only beta | Invites / hashed beta codes (atomic use) / admin allowlist on every sign-up path (email, Google/GitHub, SSO). Sign-up UX: code field, pre-check with a real refusal, check-inbox state. | `src/server/beta.ts`, `p4-beta-*.test.ts`, `e2e/beta.spec.ts` |
| Billing (Paddle, MoR) | Behind the provider abstraction, sandbox-only (live keys and tokens refused). Webhook HMAC + replay window + idempotency + customer binding + streamed size cap. Paddle.js checkout page on our domain; provider-neutral UI. Stripe stays a workflow integration. | `src/billing/`, `docs/integrations/BILLING-PROVIDER.md`, `paddle-billing` contract + `p4-paddle*` integration tests |
| Integration beta scope | Core: Google Sheets, Gmail, Slack, GitHub (+ PostgreSQL, live-verified in Phase 2). HubSpot, Zendesk, Airtable, Snowflake, Stripe, Notion and Linear stay in release scope, labelled "beta: not yet verified live". | catalog `betaScope`, `BETA_LIMITATIONS.md` |
| Copilot | Benchmark: 12 fixed requests, 6 dimensions. Local `qwen2.5:7b` **5/12** (target ≥10/12 not met), safe refusal 12/12. → labelled **Experimental** in the UI; preview says "Ran without errors — verify the output matches your request". Hosted-model run BLOCKED (no key). | `artifacts/phase-4/copilot-benchmark/` |
| Telemetry & ops | Product events without content, correlation ids on every response, funnel report, retention job, ops status + monitor (alerts on an unusable probe too), shared PostgreSQL rate limiting. | `src/server/{telemetry,ops,retention,rate-limit}.ts` |
| Beta UX | Onboarding, credential-free templates, BETA badge, Report an issue / Contact support / Account in the user menu (disabled with a reason when unset). No misleading claims. | E2E `arabic`, `beta` |
| Docs | Private beta runbook, user guide (Arabic first), limitations, privacy & safety drafts (no compliance claims). | `docs/implementation/` |

## Tests on the release code (`e42667d`)

| Suite | Result |
|---|---|
| lint, typecheck | clean |
| unit | 182 passed |
| contract | 124 passed |
| integration | 331 passed |
| E2E Chromium + Firefox | 81/81 (the latest full run). One earlier full run had 80/81, see the known issue below. |
| E2E WebKit (@critical + @cross-browser, Docker) | 23/23, no hydration warnings |

**Known test-infrastructure issue (open):** the "API keys" E2E once stalled under full-suite load in Firefox, and a
sign-up request once stalled in WebKit. It happened once in about 5 full runs. It could not be reproduced in 28
targeted runs, including a forced pre-hydration click. Both runs were on the `next dev` test server under parallel
load. None of the production-build checks (staging, release scripts, load) showed it. It stays open for investigation
and is not hidden.

## Release checks on `flowline:e42667d`

- Smoke 8/8 (invite-only, verified users).
- Rollback `ce08d9f` ↔ `e42667d` 11/11 (no down migrations).
- Backup → clean restore 17/17 (46 tables match; a wrong key is refused).
- DB outage 12/12 (stall + hard stop: fast 503, clean errors, recovery without restart, no duplicate steps).
- Beta load 5/5 targets: 5 users, 32 flows, 36 runs, 3 AI runs, reset emails, 60 page loads. API p95 134 ms, pages
  p95 220 ms, 0 5xx, 0 duplicate runs, drain 4.2 s. Measured on one laptop. **No SLA or capacity claim.**

## Independent review and QA

| Review | Findings | Status |
|---|---|---|
| Fable 5.1 security review (email, beta gate, billing, telemetry, OAuth) | 0 P0/P1, 3 P2, 4 P3 | 6 fixed with regressions; 1 P3 accepted (per-address email limit as lockout lever, revisit before public launch) — `artifacts/phase-4/fable-security/REVIEW.md` |
| Codex gpt-6-astra code review (`ce08d9f..adf3248`) | 6 P2, 1 P3 | all 7 fixed (log redaction proven against Caddy 2.10; the co-owner deletion race has a regression that fails without the fix) — `artifacts/phase-4/codex-review/` |
| Codex Chrome exploratory QA (real Chrome, staging, invite-only) | 0 P0, 0 P1, 2 P2, 0 P3 | both fixed on `e42667d` (unit/E2E-verified); **Codex Chrome retest pending** — paused by the owner while credentials are gathered (`artifacts/phase-4/codex-qa/RETEST-BRIEF.md`) |

**Acceptance journeys (p4§13, Chrome QA):**
- **PASS:**
  - 1 — invited user → verify → onboarding → run → inspect;
  - 6 — Copilot: proposal → validate → preview → manual approve → draft, with behaviour checked;
  - 7 — viewer vs owner;
  - 9 — a provider failure is isolated.
- **10 — service interruption:** FAIL on error presentation only, fixed in CX4Q-02. Recovery and no-duplicate
  checks passed.
- **BLOCKED (credentials):**
  - 2 Google Sheets;
  - 3 Gmail;
  - 4 Slack;
  - 5 GitHub;
  - 8 Paddle checkout.

## Blockers: what the owner must provide

Put these in the server's env file only, never in chat.
1. **Domain + DNS and a small VPS** for `beta.<domain>`. Then: `deploy/beta/` + `scripts/release/verify-beta-stack.mjs`
   (runbook §2).
2. **Email provider** (Resend or Postmark) with a verified sending domain, plus a test inbox:
   `FLOWLINE_EMAIL_PROVIDER`, `FLOWLINE_EMAIL_RESEND_KEY` or `FLOWLINE_EMAIL_POSTMARK_TOKEN`, `FLOWLINE_EMAIL_FROM`.
3. **Paddle sandbox account:** API key, client-side token, webhook secret, approved domain/default payment link, one
   price per paid plan (`docs/integrations/BILLING-PROVIDER.md`).
4. **Live certification accounts:** a Google test account + sheet (Sheets/Gmail), a Slack test workspace + channel, a
   GitHub test repo + token; Google/GitHub OAuth apps with the beta redirect URIs (also enables Google/GitHub
   sign-in).
5. **Hosted AI key** (e.g. `ANTHROPIC_API_KEY`) to benchmark Copilot on a stronger model.

## Known limitations

See `BETA_LIMITATIONS.md`:
- one host;
- Copilot experimental;
- 7 integrations not live-verified;
- sandbox billing only;
- no presence or light theme;
- privacy docs are drafts pending qualified review.
