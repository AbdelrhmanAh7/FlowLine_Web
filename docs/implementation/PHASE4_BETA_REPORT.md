# Flowline Phase 4: launch candidate & private beta report

## Company Builder refund note — 2026-10-04 (issue #49)

The fixed note added to every refund/cancellation draft (`REFUND_NOTE`, ar/en in `src/company-builder/packs/customer-follow-up.ts`) named "a member of our team" instead of who decides; it now names the business **owner** as the decision maker for that specific request and still promises no outcome (no refund, cancellation or approval announced or implied). Copy and lock: [COPY_REVIEW.md](../company-builder/COPY_REVIEW.md); bug ledger FB-14: [BUGS.md](../../artifacts/company-builder/BUGS.md). Verified locally with the unit REF-*/REF-NOTE tests in `tests/unit/cb-pack-customer-follow-up.test.ts`, `tests/unit/i18n.test.ts` and `pnpm typecheck`. No integration, browser, build or full-gate run is claimed here, and this changes no private-beta or production acceptance.

## H3 security readiness review — 2026-10-03

PR #21 (H3, open; its base PR #17 is merged into main) enforces local MFA across all session reads, refuses replayed TOTP codes at both federated gates, retains pending global-provider/account and workspace revocation fences, and documents the sign-in transition for existing enrolled users. [Behavior](../security/FEDERATED_MFA.md); [checks and source fingerprint](../../artifacts/phase-4/h3-readiness/README.md). Focused unit checks are separate from PostgreSQL integration, browser/provider validation and main-target CI, which remain pending. It is not merged or deployed. This update does not change private-beta or production acceptance. Issue #37 (a possible lock-order inversion between SSO link confirmation and federated challenge completion, which share the initiating session) is fixed in source by one documented lock order and a shared helper ([Lock order](../security/FEDERATED_MFA.md#lock-order)); the mocked-order unit test passes locally, the two-connection PostgreSQL regression `tests/integration/federated-lock-order.test.ts` is **not executed** locally and needs CI. Two adjacent inversions found while auditing (password-reset recovery, and member role change/removal against the SSO audit insert) are recorded there as known gaps, not fixed.

## PR #14 diagnostic checkpoint — 2026-10-03

Full gate `37093517476`, CI SHA `f10278806a20a80b0bedd683ce446c46e7d0e416`, remains **FAIL**: WebKit 77 passed / 1 failed; Chromium and Firefox jobs succeeded. The journey found the Output tab and then hit its whole-test deadline during click actionability. Offline inspection of PR head `dd840db` found no loader import path linking the Drizzle prune to this failure. Pre-existing WebKit/test timing is suspected, not proven; the missing trace/JSON prevents root-cause confirmation. [Diagnosis and next experiment](WEBKIT_14_DIAGNOSIS.md). Follow-up (CI history, 27 full-tier WebKit runs): not attributable to #14; head `ec672d7` passed WebKit 78/78 in run `37132314447`, and the intermittent journey timeout is tracked in issue #35 ([follow-up](WEBKIT_14_DIAGNOSIS.md)). This docs-only investigation makes no readiness claim and does not close the earlier WebKit incidents recorded below or elsewhere.

## PR #16 request-body follow-up — 2026-10-03

PR #16 (`b63ffed`, on base `a9f7597`) adds Caddy route caps, a 10-second upload-read/5-second header deadline and HTTP/1.1+HTTP/2 ingress, plus the missing shared `capBody` 10-second deadline and Arabic/English timeout messages. No Next.js Proxy body clone was added. [Layered policy](../security/REQUEST_BODY_LIMITS.md); [focused evidence](../../artifacts/phase-4/paid-pilot-round1/proxy-body-limits.md). M4's source deferral is addressed for the owned ingress; Caddy runtime, trusted-proxy/no-direct-web exposure and provider/tunnel deadlines remain unverified. This does not change the deployment/readiness verdicts or the historical evidence below.

## Branch maintenance — 2026-10-03

Status: **merged into main** by [PR #20](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/20) (merge `db4b590`, final head `050407f`), built first on `claude/ci-trim-20261003` and the stacked `claude/ci-gate-always-report` (issues #22, #23).

What it changed: bare worktree names select only managed lanes and `pnpm wt add` rejects non-bare names (`feat/x`, `../../sibling`; `--branch` for slashed branches); worktree path comparisons fold case on Windows; root code/config files require documentation; `docs-not-needed` needs a non-empty same-line `Docs not needed because: <reason>` body entry (placeholder rejected; body edits rerun the check); a PR file list of 3000 or more and a push comparison of 300 or more (GitHub's caps) count as code, the latter with a `::warning::`. Gate reports a real `gate` for every non-draft PR event, push and dispatch: no `paths-ignore` or `labeled` trigger, a `changes` job (`scripts/ci/changed-scope.mjs`) lets docs-only changes skip the test jobs, the full tier starts only from `workflow_dispatch tier=full`, actions are pinned by SHA (Node 24) and runners to `ubuntu-24.04`. See the [developer guide](../DEVELOPER_GUIDE.md#ci-gate).

Verification: unit/fixture tests (`worktree-script`, `docs-check-script`, `changed-scope`, `ci-workflows`) and the [pre-merge local validation](../../artifacts/phase-4/ci-trim-defects/VALIDATION.md) (written while the work was uncommitted). Live: the full-tier `workflow_dispatch` run [37137969499](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/37137969499) on `050407f` passed all jobs, including the upgraded `pnpm/action-setup` v6 and `actions/setup-node` v7. No other live run is recorded here, and real worktree removal is unverified (tests mock Git/filesystem). This does not establish beta readiness.

## Current execution — 2026-09-30

The binding [beta execution brief](BETA_EXECUTION_BRIEF.md) supersedes the historical account/host instructions below. Current ledger: [BETA_EXECUTION_STATUS.md](BETA_EXECUTION_STATUS.md); owner handoffs: [OWNER_ACTIONS.md](OWNER_ACTIONS.md). The following older `e42667d` evidence remains historical and does not certify the design-v2/AI-hub candidate.

Current HEAD remains 776337c. Latest execution checkpoint cp22 7a26cb1e5cbaab56cc2cd68e392595fc95983b6b contains the preserved keyboard work plus narrow Sheets identity/Resend probe fixes and the new guarded current hub benchmark. cp22 lint, main/focused typechecks, unit402 and contract467 passed. Full integration is running with one recovery-case failure observed; diagnosis pending. Retained cp20 browsers114/50/50 and cp21 non-browser gates remain historical, not fresh proof for cp22. New one-build sequential browser gates and Claude independent review remain pending.

Local staging is RUNNING at http://localhost:3000 using cp21 build F6m0LaSa_-jaq5hCKtlY3 and fresh database flowline_beta_local20260930/schema20; it predates helper fixes. Bootstrap redeemed through masked UI, owner signup complete and real POST /api/email returned200/done with persisted verification. No external email sent: staging uses the DB outbox. Owner sign-in confirmation arrived; non-sensitive browser inspection and owner MFA follow heavy-suite completion. Private bootstrap is not host certification.

DV2-02's additional FlowLine/ai-hub disposable test configurations were rotated into independent fresh test databases; old databases preserved, no active old-key fallback. Current named dev/staging reuse audit found no exposed-key reuse. Reachable text history scan: 2,592 blobs, zero affected-key hits; binaries/compressed/unreachable material excluded. No production key migration was performed.

Preferred deployment is the existing owner Pi, subject to read-only approval, verified architecture/workloads, an approved domain, a named Cloudflare Tunnel plan and an exact deployment approval. No host/domain is confirmed, no current immutable artifact/digest exists, and no Pi access/exposure has occurred. No paid VPS is authorized. Customer AI keys belong in Settings → AI Providers; platform service keys in protected /admin; infrastructure in operator storage. No local inference.

Google flowline-beta Sheets/Gmail APIs are enabled; billing is unlinked. Owner configured External/Testing OAuth identity and created the local sign-in client. Its saved secret remains private; platform UI entry follows admin MFA. Integration client, test users, fixtures, connect/action/revoke/reconnect and live verification remain incomplete. Other external services remain blocked on account/credential/consent dependencies. No real external email, sandbox checkout, AI inference or benchmark has run. Spend $0, cap $0; Copilot remains Experimental. The new benchmark runner passed offline/focused checks only. Remaining seven SaaS integrations stay deferred for private beta and in full-product scope.

LOCAL CLOSEOUT: cp21 executor checks passed; cp22 integration failure under diagnosis and browser gates/Claude review pending.
BETA INFRA VERIFIED: BLOCKED. PRIVATE BETA READY: NO.
MERGED: NO. PUBLIC PRODUCTION APPROVED: NO. No real invitations or worktree deletion.

## Historical Phase 4 report (preserved)

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

Put these in the server's env file only, never in chat. **Superseded on branch `ai-hub`:** OAuth apps, sign-in apps, email and Paddle credentials are entered in the platform admin panel (`/admin`), and AI keys per workspace in Settings → AI Providers (`docs/security/CREDENTIALS_DESIGN.md`, `docs/ai/MIGRATION.md`). Only the encryption keys, database and auth secret stay in the env file.
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
