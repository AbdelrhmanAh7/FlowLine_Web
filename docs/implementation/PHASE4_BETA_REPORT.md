# Flowline Phase 4: launch candidate & private beta report

## Run snapshots stay unnumbered after a rollback: reversible backfill 0026 (issue #205, PR #211) — 2026-10-13

Follow-up to #204 for the P1 review thread on PR #139. #204's migration 0025 nulls the version numbers that legacy run
snapshots held, but keeps no backup. Run snapshots can be numbered again afterwards, because the previous image (the
supported rollback) numbers every run it inserts. Migration `0026_flow_version_run_backfill` copies any numbered run
snapshot's number into `flow_version_run_number_backup` and sets it to NULL. Save, overwrite and publish snapshots keep
their numbers. It also adds the `BEFORE INSERT` trigger `flow_version_run_unnumbered`, which stores every new run snapshot
with `version = NULL`. Each statement is a no-op on a second run. The immutability trigger is off only for the UPDATE,
inside drizzle's migration transaction. `drizzle/reverse/0026_flow_version_run_backfill.sql` drops the trigger and puts the
backed-up numbers back. Numbers cleared by 0025 cannot be restored. The script stays outside the journal, starts with
`\set ON_ERROR_STOP on`, and is run by hand with
`psql -v ON_ERROR_STOP=1 --single-transaction -f drizzle/reverse/0026_flow_version_run_backfill.sql`. If a later save or
publication has taken a freed number, the unique index refuses and nothing changes.
Depends on #204: 0026 follows 0025 in the journal and needs its nullable `version`. #205 adds only 0026 with its snapshot
and journal entry, the backup table in `src/db/schema.ts`, the reverse script, the test and these docs. Branch base and
merge order live on PR #211 and PR #207, not in this ledger.
Verified locally on 2026-10-13 against a fresh `flowline_test_205`, with #204 at `e4ba1bc`. Results:
- `tests/integration/flow-version-run-backfill.test.ts`: 5/5. The fixture holds legacy-shaped rows (save v1, run snapshots
  v2 and v3, inserted as a pre-#204 image writes them). The backfill keeps v1, clears and backs up the run numbers, and the
  next publication and `publishedVersion` in the flows list are v2. A second run changes nothing. The reverse restores
  v2/v3, also when run twice, and the backfill then applies again. A numbered run insert after the backfill is stored
  unnumbered. The reverse fails atomically after a publication took v2.
- `flow-version-backfill.test.ts` (#204): 2/2. `runs.test.ts`: 18/18. Through `psql -v ON_ERROR_STOP=1
  --single-transaction -f`, the reverse, then 0026 twice, all exit 0.
- `drizzle-kit check` and `drizzle-kit generate` (no changes), `pnpm typecheck`, and eslint on the changed files are clean.
  The full integration and browser suites were not run locally; CI runs them.

## Flows list publishedVersion only changes on publish (issue #204, PR #207) — 2026-10-13

Fix for the `feat:fl-flows-list` failure (#117): a run's pinned `flow_version` snapshot took the next number of the
per-flow sequence, so two runs before the first publish made it v3 instead of v1. Run snapshots are now stored with
`version = NULL` (`insertVersion` in `src/server/flows.ts`; migration 0025 drops `NOT NULL`); only `save`, `overwrite`
and `publish` snapshots are numbered. Draft edits (autosave, which bumps `flow.revision`) never wrote a snapshot and
still don't. Migration 0025 also backfills legacy run snapshots: it drops the 0002 immutability trigger, nulls `version`
on `reason = 'run'` rows and recreates the trigger. History now orders by `created_at` (version can be NULL). The history
panel and the run inspector label an unnumbered snapshot "Run snapshot" (`common.runSnapshot`,
`runs.rerun.originalSnapshot`, ar + en) through `flowVersionLabel` / `rerunOriginalLabel` in `src/i18n/engine-text.ts`;
the run detail API (`/api/runs/:id`, `/api/v1/runs/:id`) returns `version: null` for such runs.
Verified locally on a freshly migrated `flowline_test_204`: `tests/integration/runs.test.ts` (publish once then two runs
keeps publishedVersion 1; draft edits and a run before the first publish give v1; two runs then publish give v1; the three
fail without the fix with 4≠2, 2≠1 and 3≠1), `tests/integration/flow-version-backfill.test.ts`,
`tests/integration/flows.test.ts`, `tests/unit/flow-version-label.test.ts`, `pnpm typecheck`, eslint on the changed
files and `drizzle-kit check`. Open for the CTO, in `AI_QUESTIONS.md`: whether Ctrl/⌘+S saves keep taking numbers from the
publication sequence, and a follow-up for strict insertion order in history (removed from this PR to keep it minimal).

## GitHub security settings (issue #160) — 2026-10-13

Not done, owner only, deferred until after the pilot: secret scanning with push protection, Dependabot alerts and Copilot code review as a second reviewer are all unverified. The owner's steps and the record of what was done are in [OWNER_ACTIONS.md](OWNER_ACTIONS.md#issue-160-github-security-settings-owner-only). No beta or production readiness verdict changes.

## Field-harness scoring review (#141 / PR #193) — 2026-10-12

The next-round harness compares the approved outbox entry against the reviewed draft and the packet's VP-05
expectation (quoted policy, no promise, consequential flag, no payment action), and requires one persisted VP-01
row with the original value before and after reprocessing. **Explicit assertions** in `field.spec.ts` now verify
all review-gate checks (recipient, text-only `email_reply`, no payment action, quoted policy, no promise,
consequential) and all persisted-row checks (`sameRowCount`, `sameRows`, `exactlyOneFollowUp`). Eight focused
scoring tests pass on `4a241db` (including one that runs the real compiled customer-follow-up pack); the code under test is unchanged since `475c293`.
Earlier `20261001-d224cfb` evidence is unchanged.
The live Playwright field run is still unverified: this worktree has no `.env.test`, no test server on port
3100, and no available Docker daemon. Full suite/build remain delegated to hosted CI under the task brief.
This internal harness change does not change product behavior or beta readiness.

Local verification on `4a241db` (all counts observed there; code under test unchanged since `475c293`): `pnpm test flowline-field --maxWorkers=2` passes 8/8 (the run includes the real-pack
test). Each original fix in `tests/helpers/field-scoring.ts` was disabled in turn and restored from git after each run:
`:117` no-promise scoring with legacy matching: 1 failed / 7 passed; `:138` review gate (`scoreReviewGate` checks forced true): 1 failed / 7 passed, and the approval-payload helpers
(`scoreApprovedOutboxEntry`, `scoreApprovedAgainstPacket` forced true): 3 failed / 5 passed;
`:143` persisted-row comparison (`comparePersistedRows` always passing): 3 failed / 5 passed (the duplicate-scoring and real-pack tests also depend on it);
`:160` digest verification (`verifyPacketDigest` always passing): 1 failed / 7 passed. On the later head `e3b6c75` (a merge of origin/main; #141 code unchanged since `475c293`) `pnpm typecheck` exited 0, ESLint on `tests/helpers/field-scoring.ts` and `tests/unit/flowline-field-scoring.test.ts` reported nothing, and the scoring test again passed 8/8 (the `artifacts/` field specs are ignored by ESLint); the hosted `gate` runs the rest. Playwright was not run: it needs `DATABASE_URL` and a live stack, so no live assertions ran. These
checks used Node 26.10.0; the project's supported Node 24 validation remains for CI.

## Company Builder refund note — 2026-10-04 (issue #49)

The fixed note added to every refund/cancellation draft (`REFUND_NOTE`, ar/en in `src/company-builder/packs/customer-follow-up.ts`) named "a member of our team" instead of who decides; it now names the business **owner** as the decision maker for that specific request and still promises no outcome (no refund, cancellation or approval announced or implied). Copy and lock: [COPY_REVIEW.md](../company-builder/COPY_REVIEW.md); bug ledger FB-14: [BUGS.md](../../artifacts/company-builder/BUGS.md). Scorer noPromise checks (`flowline-field/field.spec.ts`) globally exclude the updated note sentence via replaceAll so refunded/cancelled terms do not trigger false positives on VP-05/VP-06 across single or repeated note drafts. Verified locally with the unit REF-*/REF-NOTE tests in `tests/unit/cb-pack-customer-follow-up.test.ts`, `tests/unit/i18n.test.ts` and `pnpm typecheck`. No integration, browser, build or full-gate run is claimed here, and this changes no private-beta or production acceptance.

## Focused-run evidence helpers: explicit child environment — 2026-10-03

Issue #36: the four local focused-run helpers (`upload-admission/run-focused.mjs`, `federated-mfa/run-focused.mjs`, `run-auth-focused.mjs`, `artifacts/phase-4/security-auth/run-focused.mjs`) no longer start Vitest with `...process.env`. They use the allowlist in `scripts/focused-run-env.mjs` (OS/runtime names plus the synthetic values each helper builds), record variable names only (never values) in new result JSON or stderr, and support `--dry-run`. [Allowlist and limits](../../artifacts/phase-4/paid-pilot-round1/upload-admission/README.md#child-environment-issue-36). Verified locally on Windows only: unit test, dry-runs, and a probe launching `npx tsx` and a Vitest unit run under the allowlist. The helpers were **not re-run against a database** (no Docker started), the Linux path is unit-tested by name only, and the earlier recorded runs predate the change and used the ambient shell. `check-drizzle-prune.mjs` and the gate/release/Company Builder scripts still pass `process.env` (not focused database runs); the frozen `artifacts/beta-execution` helpers are historical. This does not change release scope or the unverified items below.

## H3 security readiness review — 2026-10-03

PR #21 (H3, open; its base PR #17 is merged into main) enforces local MFA across all session reads, refuses replayed TOTP codes at both federated gates, retains pending global-provider/account and workspace revocation fences, and documents the sign-in transition for existing enrolled users. [Behavior](../security/FEDERATED_MFA.md); [checks and source fingerprint](../../artifacts/phase-4/h3-readiness/README.md). Focused unit checks are separate from PostgreSQL integration, browser/provider validation and main-target CI, which remain pending. It is not merged or deployed. This update does not change private-beta or production acceptance. Issue #37 (a possible lock-order inversion between SSO link confirmation and federated challenge completion, which share the initiating session) is fixed in source by one documented lock order and a shared helper ([Lock order](../security/FEDERATED_MFA.md#lock-order)); the mocked-order unit test passes locally, the two-connection PostgreSQL regression `tests/integration/federated-lock-order.test.ts` is **not executed** locally and needs CI. Of two adjacent inversions found while auditing, the member role change/removal one (against the SSO audit insert) is still recorded there as a known gap. The other, password reset against account-deletion confirmation, is fixed by issue #45: verify, reset and delete confirmation now lock the user row before the token row and re-check the token under both locks ([Email-token lock order](../security/FEDERATED_MFA.md#email-token-lock-order)); its mocked-order unit test passes locally, the two-connection PostgreSQL test `tests/integration/email-token-lock-order.test.ts` is **not executed** locally and needs CI. Issue #66 adds a route-level H3 regression lock, `tests/integration/sec-federated-mfa-regression.test.ts` ([what it covers](../security/FEDERATED_MFA.md#validation-limits)), executed locally against a disposable PostgreSQL; it changes no production behaviour and no readiness verdict.

Issue #72 adds a bounded failure audit for failed and abandoned federated MFA steps (workspace `sso.mfa_failed`, platform `signin.mfa_failed`; reasons `invalid_code`, `replayed_code`, `rate_limited`, `expired`, the last also from the retention sweep), see [Failure audit](../security/FEDERATED_MFA.md#failure-audit); its tests extend the #66 file and pass locally against a disposable PostgreSQL 16. The two known lock-order gaps above are unchanged. It changes no readiness verdict and is not deployed.

## PR #14 diagnostic checkpoint — 2026-10-03

Full gate `37093517476`, CI SHA `f10278806a20a80b0bedd683ce446c46e7d0e416`, remains **FAIL**: WebKit 77 passed / 1 failed; Chromium and Firefox jobs succeeded. The journey found the Output tab and then hit its whole-test deadline during click actionability. Offline inspection of PR head `dd840db` found no loader import path linking the Drizzle prune to this failure. Pre-existing WebKit/test timing is suspected, not proven; the missing trace/JSON prevents root-cause confirmation. [Diagnosis and next experiment](WEBKIT_14_DIAGNOSIS.md). Follow-up (CI history, 27 full-tier WebKit runs): not attributable to #14; head `ec672d7` passed WebKit 78/78 in run `37132314447`, and the intermittent journey timeout is tracked in issue #35 ([follow-up](WEBKIT_14_DIAGNOSIS.md)). This docs-only investigation makes no readiness claim and does not close the earlier WebKit incidents recorded below or elsewhere. Issue #35 follow-up: the gate-report action now uploads the Playwright JSON reports and, for failed browser tests, `trace.zip` files (7 days), so the next occurrence can be diagnosed; no test, timeout or retry changed and the flake stays undiagnosed ([where to find them](../DEVELOPER_GUIDE.md#playwright-traces-in-ci)).

## PR #16 request-body follow-up — 2026-10-03

PR #16 (`b63ffed`, on base `a9f7597`) adds Caddy route caps, a 10-second upload-read/5-second header deadline and HTTP/1.1+HTTP/2 ingress, plus the missing shared `capBody` 10-second deadline and Arabic/English timeout messages. No Next.js Proxy body clone was added. [Layered policy](../security/REQUEST_BODY_LIMITS.md); [focused evidence](../../artifacts/phase-4/paid-pilot-round1/proxy-body-limits.md). M4's source deferral is addressed for the owned ingress; Caddy runtime, trusted-proxy/no-direct-web exposure and provider/tunnel deadlines remain unverified. This does not change the deployment/readiness verdicts or the historical evidence below.

## CodeQL triage D: e2e fake servers — 2026-10-11 (Issue #114, part 4/4 of #63)

Status: **implemented on ai/114** (PR #133), awaiting merge.

- CodeQL alerts #5 (stack-trace exposure), #6 (regex injection), #7 (resource exhaustion) and #9 (unvalidated redirect) fixed in `e2e/fakes/provider-server.ts` and `e2e/fakes/ai-server.ts`, with shared helpers in `e2e/fakes/safety.ts`.
- The Stripe fake's `success_url`/`cancel_url` redirect (part of #9) is dismissed with a written reason: it redirects to the URL the authenticated API caller registered, which `tests/contract/billing.test.ts` relies on.
- Tests: `tests/contract/codeql-fakes.test.ts`. Notes and the size exception: [`docs/security/codeql-triage-fakes.md`](../security/codeql-triage-fakes.md).
- No e2e-army test: internal to test doubles, no user-facing flow.

## Branch maintenance — 2026-10-03

Status: **merged into main** by [PR #20](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/20) (merge `db4b590`, final head `050407f`), built first on `claude/ci-trim-20261003` and the stacked `claude/ci-gate-always-report` (issues #22, #23).

What it changed: bare worktree names select only managed lanes and `pnpm wt add` rejects non-bare names (`feat/x`, `../../sibling`; `--branch` for slashed branches); worktree path comparisons fold case on Windows; root code/config files require documentation; `docs-not-needed` needs a non-empty same-line `Docs not needed because: <reason>` body entry (placeholder rejected; body edits rerun the check); a PR file list of 3000 or more and a push comparison of 300 or more (GitHub's caps) count as code, the latter with a `::warning::`. Gate reports a real `gate` for every non-draft PR event, push and dispatch: no `paths-ignore` or `labeled` trigger, a `changes` job (`scripts/ci/changed-scope.mjs`) lets docs-only changes skip the test jobs, the full tier starts only from `workflow_dispatch tier=full`, actions are pinned by SHA (Node 24) and runners to `ubuntu-24.04`. See the [developer guide](../DEVELOPER_GUIDE.md#ci-gate).

Verification: unit/fixture tests (`worktree-script`, `docs-check-script`, `changed-scope`, `ci-workflows`) and the [pre-merge local validation](../../artifacts/phase-4/ci-trim-defects/VALIDATION.md) (written while the work was uncommitted). Live: the full-tier `workflow_dispatch` run [37137969499](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/37137969499) on `050407f` passed all jobs, including the upgraded `pnpm/action-setup` v6 and `actions/setup-node` v7. No other live run is recorded here, and real worktree removal is unverified (tests mock Git/filesystem). This does not establish beta readiness.

### Toolchain & CI update — Node 24 (Issue #74)

Status: **implemented on ai/74**, awaiting PR merge.

What it changed:
- CI composite setup action (`.github/actions/setup-gate/action.yml`) updated to `node-version: 24` and code-sandbox pull updated to `node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`.
- `package.json` `engines.node` aligned to `24.x`.
- `Dockerfile` base image aligned to `node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`.
- `src/server/code-sandbox.ts` default `SANDBOX_IMAGE` aligned to `node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`.
- Release input policy unit test (`tests/unit/release-input-policy.test.ts`) updated to enforce Node 24 across package support, CI setup, Dockerfile base and sandbox image.
- Verification: unit tests (97 files, 1,247 tests), contract tests (23 files, 468 tests), linting, TypeScript typechecking, and Next.js production build all pass cleanly on Node 24. Live CI pipeline verification occurs on PR `gate` run.

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
