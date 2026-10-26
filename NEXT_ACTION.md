# Next action — 2026-10-03

## Issue #435 — node-config.tsx machine text dir="ltr" RTL fix (2026-10-27)

Added explicit `dir="ltr"` to machine-text code and span elements (`className="data"`) in `src/components/builder/node-config.tsx` (lines 108, 236, 562, 563) so code references, cron previews, and field names display left-to-right in Arabic/RTL contexts.
Supersedes part of #383. Closes #435.
Unit regression tests: `tests/unit/node-config-rtl.test.ts` (2/2 passing).
E2E test: `e2e-army/85-sign-in-and-core-flow.e2e.ts` tagged `feat:fl-builder`.
Evidence: `docs/evidence/435/EVIDENCE.md`.
Pre-push quality gates verified: `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), `pnpm check:evidence` (exit 0).
Harness next: push branch `ai/435` and obtain CI and reviewer confirmation.

## Issue #316 — pilot-metrics 0.0% run success rate fix (2026-10-20)

Fixed truthiness check on `metrics.runSuccessRate` in `scripts/pilot-metrics.ts:263` where 0% was formatted as "N/A" instead of "0.0%".
Supersedes part of #170.
All 15 unit tests (`tests/unit/pilot-metrics.test.ts`) and 9 integration tests (`tests/integration/pilot-metrics.test.ts`) pass.
E2E: not needed — internal read-only ops CLI script, no user-facing UI or endpoints.
Harness next: push branch `ai/316` and obtain CI and review confirmation.

## Issue #204 — harness handoff (2026-10-15)

The product fix is already on main (`83a80114`); carry the new unit/concurrency/migration-fixture regressions on #207.
After push, obtain the production-stack feature gate, CI and reviewer confirmation before automerge; then close #139.
See [evidence](artifacts/phase-4/issue-204/EVIDENCE.md#revalidation--2026-10-15). No push or PR changes made locally.
## PR #287 CI repair — 2026-10-16

Main is merged locally; the demo lock readiness race is fixed. Harness must push and obtain
fresh CI and review confirmation; this worker performs no GitHub writes. Migration 0027
applied successfully with all predecessors on a throwaway localhost:5432 database.
See the phase-4 report for exact local checks and the pre-existing conditional skip.

## Pilot E2E corrections — 2026-10-15

Local work on `fix/pilot-e2e-failures` is recorded in
[the evidence report](artifacts/pilot-e2e/EVIDENCE.md). Owner requested no push, PR or writes outside
this worktree. Harness next: link the tracking issue, arrange CI/review, and update the hub's outdated
`fl-flow-versions.1` expectation per CTO decision #204 (save version numbers intentionally null).
Apply migration 0027 before verifying CSV queue behavior. No hub files were changed.

## Issue #226 — resolve CodeRabbit review backlog (2026-10-16)

Resolved all four deferred CodeRabbit review findings from merged PRs:
1. `tests/helpers/field-scoring.ts`: `scoreNoPromise` skips empty or whitespace-only entries in `approvedInformation` before splitting or matching; regression test in `tests/unit/flowline-field-scoring.test.ts` fails on base and passes on head.
2. `src/ai/hub/protocols/shared.ts`: `badToolArgs` uses conditional billing language ("may have been billed"), and all shared protocol exports have complete JSDoc blocks detailing parameters, returns, and thrown/returned `HubError` codes. Unit tests in `tests/unit/ai-hub-shared-protocols.test.ts` verify `parseArgs`, `badToolArgs`, `streamJson`, and `mapInBandError`.
3. `docs/ai/ADDING_A_PROVIDER.md`: accurately reflects the JSDoc contracts provided by `src/ai/hub/protocols/shared.ts`.
4. `docs/engineering/lock-order.md`: updated Example #41 to cite #45 (user-first) and #41 commit `66cc2799` (`delete session` before `account` write, pinned by `password-reset-lock-order.test.ts`).
E2E: not needed — pure internal docs and test helper chore.

## Issue #234 — review after main integration (2026-10-15)

PR #200 landed as `d1368116`, so the unit suite runs without skips. Main conflicts are resolved, preserving its combined #179/#200 E2E file. The harness must push this branch and obtain fresh CI and reviewer confirmation for PR #247; no push or PR mutation was performed here. E2E: not needed — #234 adds unit coverage only, with no product behavior change. No dependencies added; secrets, permissions and workflow tokens unchanged.

## Issue #161 — PR #245 linkage review (2026-10-13)

Documentation scope follows the CTO answer: no duplicate security doc; dependency work remains in #62. The harness must preserve `Refs #161` and `Refs #24` in PR #245 and its merge message. Check `gh pr view 245 --json body,closingIssuesReferences` before merge; #161 must not appear in closing references. Local evidence cannot certify the live PR body. Review confirmation and CI remain the harness's next steps.

## Issue #205 handoff — 2026-10-14

Local lock/rollback regression fixes are ready; harness pushes. Backfill/runs integration: 26/26; E2E tooling hygiene: 12/12; typecheck, lint and drizzle metadata check pass. GitHub rejected retargeting PR #253 to ai/204 because PR #211 already uses ai/205 → ai/204. Reconcile duplicate PRs under the recorded-exception rules; #207 remains open, so keep #205 stacked until it merges, then rebase only #205 onto main and rerun CI/review. The inherited #204 E2E spec was removed as explicitly requested; add no E2E spec for this internal migration. [Details](docs/implementation/PHASE4_BETA_REPORT.md#legacy-backfill-0026-issue-205--2026-10-14).

## Issue #160 — await the owner after the pilot (2026-10-13)

Not done. The owner enables the three GitHub security settings and records evidence by following the steps in [OWNER_ACTIONS.md](docs/implementation/OWNER_ACTIONS.md#issue-160-github-security-settings-owner-only). Engineers cannot change these settings (secrets-settings hard rule, AGENTS.md article 7). #160 stays open; PR #213 references it as `Refs #160`. Re-adding the `pilot` label reactivates the issue.

## Issue #221 — `fl-auth-api` release gate triage (2026-10-13, updated 2026-10-14)

**Status: #221 stays open.** Its acceptance is that `fl-auth-api` passes on `main`; this branch records a triage diagnosis and a regression test, but no product or hub fix (hub write authorization remains explicitly denied by the CTO comment on the issue). #221 closes only after any necessary hub-side fix lands and the reproduce command passes on a fresh stack. Until then the release gate is not resolved. PR #227 references `Refs #221`.

### Revision reconciliation & seed evidence

- **Failing FlowLine revision on `main`**: `2ca60e5` (the 2026-10-12 stable release gate candidate where `fl-auth-api` failed with `expected 200 to be 403`, logged in `~/agents/logs/stable/FlowLine_Web/2026-10-12/app.log`).
- **Inspected FlowLine branch revision**: `ceea864` was the merge commit on `ai/221` (incorporating `2ca60e5` and main ancestors) where the failure was first inspected. Successive merges updated the branch through `27cbeda`, `5037003`, `c9269af`, up to `143383f` (and base `main` @ `83a8011`).
- **Hub revisions**: The failing stable run executed on hub commit `e06a85e` (2026-10-12). Subsequent hub inspection on 2026-10-14 examined deployed hub `1544080` / `e9479fbb` and source checkout `02b81bfd`.
- **Seed evidence & suspected causes**: The runtime `E2E_ARMY_SEED` was not logged in `e2e-army.log` or `app.log`. While `hub-live/ops/verify/e2e-army/tests/lib.ts:19` defaults `E2E_ARMY_SEED` to `"nql-e2e-army-1"`, direct evidence that the seed was unchanged between runs is unavailable from logs. Because seed invariance cannot be established from the artifacts alone, **account reuse and the `confirmFailures` stage explanation are described as suspected causes rather than confirmed facts**, until fresh-stack reproduction passes.

### Suspected causes & log analysis

Evidence from hub log `~/agents/logs/stable/FlowLine_Web/2026-10-12/e2e-army.log` (FlowLine `2ca60e5` @ hub `e06a85e`):

- **Run 1 (fresh DB)**: `fl-auth-api.1`–`.5` passed (lines 57-61).
- **Run 2 (suspected stack rerun)**: A whole-shard rerun by the quota fallback in `nql-agents/src/jobs/stable.ts` observed `fl-auth-api.1` returning 200 instead of 403, and `fl-email-flows`, `fl-onboarding`, `fl-workspaces`, `fl-members` failing (lines 476-560, 689-703), which is consistent with suspected account reuse and already-consumed email tokens. Product behavior is verified: unverified accounts are refused at sign-in (403 `not verified`, FlowLine `src/lib/auth.ts:45`), whereas verified accounts sign in with 200.
- **Confirmation run**: `confirmFailures` (`nql-agents/src/jobs/e2eregress.ts:56`) reported `NO_TESTS` (suspected missing `E2E_ARMY_STAGE: "next"`), keeping the recorded failure.

### FlowLine changes (2026-10-14)

Added regression test `e2e-army/221-auth-isolation.e2e.ts` to document and lock the expected auth behavior:

1. **Test 1 (`@issue-221.1`)**: Sign-in with wrong password returns 401, not 200 or 403.
   - Tests that both wrong-password and non-existent-user cases return 401.
   - Verifies identical error messages (account enumeration protection).

2. **Test 2 (`@issue-221.2`)**: Sign-in with unverified account returns 403, not 200.
   - Verifies that the product's `requireEmailVerification` setting is enforced correctly.

Both tests are API-level (no model needed) and tagged with `feat:fl-auth-api`, `shard:core-api`, `lvl:api`.

### QA fixes (2026-10-14)

Fixed all remaining QA findings from review rounds 9-11:

1. **Added missing import** for `createHash` from `node:crypto` (line 10)
2. **Fixed per-run uniqueness** - emails now include timestamp to avoid account reuse on reruns
3. **Fixed misleading comment** - updated to accurately describe that code selects first element after descending sort by timestamp, not "fallback to last element"
4. **Added status assertion** before JSON parsing (line 61)

All changes committed in `e61dd5f2` with typecheck and lint passing.

### Hub-side triage (repo `nql-agents`, separate task)

If fresh-stack reproduction confirms the suspected causes, the hub changes identified during triage include:

1. **Isolate shard runs**: Add `freshStack: true` and a test filter for quota-related tests in `nql-agents/src/jobs/stable.ts` to prevent stack reuse across shard reruns.
2. **Use test-only credentials**: Set `TEST_HUB_USER`/`TEST_HUB_SECRET` environment variables for the hub's test stack.
3. **Improve error messages**: Replace the `NO_TESTS` error in `nql-agents/src/jobs/e2eregress.ts` with actionable diagnostics.
4. **Pass E2E_ARMY_STAGE**: Ensure `confirmFailures` in `nql-agents/src/jobs/e2eregress.ts` passes `E2E_ARMY_STAGE: "next"` when running tests.

Verification command on a fresh stack once hub fixes land:

```sh
REF=2ca60e5; ops/verify/e2e-army/run-local.sh FlowLine_Web "$REF" -- --tag feat:fl-auth-api
```

Note: Hub write authorization remains explicitly denied by the CTO on issue #221 (`AI_QUESTIONS.md` was retired after CTO answers were recorded on the issue). Acceptance remains unmet; PR #227 references `Refs #221` and #221 remains open until fresh-stack reproduction passes.

## Issue #141 handoff — 2026-10-12

Status: awaiting review + CI. PR #193 review follow-up is implemented on `ai/141`; the harness pushes and manages review replies. Both open Codex findings are met at `field.spec.ts`: persisted `kv_entry` rows read from the DB before/after the duplicate run (`:167-184`, helper `comparePersistedRows`), and the approved outbox entry's recipient, text-only payload and no-payment check (`:150-163`, `scoreApprovedOutboxEntry`/`scoreApprovedAgainstPacket`); unit tests in `tests/unit/flowline-field-scoring.test.ts` (8/8 pass on `4a241db`; per-mutation results in `EVIDENCE.md`).
Hard review-gate and persisted-row assertions now run after `results.json` is written, so a failing round still leaves its evidence.
Run the next-round field spec with a new packet on an isolated test stack, using its matching test database;
the live run remains unverified locally because `.env.test`, the server and Docker are unavailable. Preserve
the frozen `20261001-d224cfb` run. No new e2e-army test is needed for this internal scoring-only change.

## Current state

- **Pilot round (2026-10-03):** all twelve pilot PRs are merged into main: #20 (CI tiers, always-reporting `gate`, `docs` check, `pnpm wt`), #12, #13, #16, #15, #17, #19, #14, #18, #21 (H3 federated MFA + TOTP replay guard), #31 (docs refresh, GitHub workflow) and #33 (90 s upload deadline). Every CodeRabbit thread was confirmed by CodeRabbit before merge; full-tier runs passed on code PRs #20, #21, and #33. No full-tier run is recorded on the final heads of code PRs #13–#19; keep this validation gap visible in the next steps. Open follow-ups: issues #27, #35, #36, #37; owner items #24 and #30.
- **Owner-only items unchanged:** Google → ZITADEL → FlowLine round-trip, TOTP/bootstrap, DNS/host, invitations, deployment and spend; see [OWNER_ACTIONS.md](docs/implementation/OWNER_ACTIONS.md).
- **Baseline:** this docs branch (`claude/docs-freshness`, PR #31) was written against `9641ad1e684cad7b84bd2385751ea19b0a9d4060`, the PR #8 docs merge, which follows the PR #2 merge `9fdcb7d`; it now merges `origin/main` at `cf11f3c0754d8310e300d017aa6bdc24389ab109` (the head when the merge was made; main moves). GitHub states below come from read-only `gh` queries on 2026-10-03 and change over time; recheck before relying on them.
- **Stack:** Company Builder source is integrated, with the feature off unless `FLOWLINE_COMPANY_BUILDER=on`. [PR #2](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/2) (head `719056c`) merged into main as `9fdcb7d` at `2026-10-02T23:40:03Z`; PRs #3–#5 had merged earlier that day into their stack bases and reached main through #2. [PR #1](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/1) is closed without merging (recorded as superseded). Owner UI acceptance, provider operation and beta readiness remain unverified.
- **Review and CI:** full-tier run [37077650513](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/37077650513) (`pull_request` on `pr/cb-1-core`, head `719056c`) concluded success with all six jobs (`static`, `integration`, `chromium`, `firefox`, `webkit`, `gate`) successful; it tested the PR #2 head, not the merge commit. Fast-tier `push` runs on main also succeeded at the PR #2 merge `9fdcb7d` ([37078652764](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/37078652764)) and the PR #8 merge `9641ad1` ([37081206220](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/37081206220)); `firefox` and `webkit` are skipped on that tier. PRs #2–#5 have no unresolved review threads (24, 22, 12 and 8 threads) and PR #7 has no threads. The [PR #7 review](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/7#issuecomment-5962942806) covers `719056c` with no actionable comments. PR #7 is an open draft (base `codex/cb-review-baseline-20261003`) and review-only, not a merge instruction.
- **Remaining status:** `PRIVATE_BETA_READY: NO`; production is not approved; spend cap remains `$0`. Owner Google → ZITADEL → FlowLine round-trip and TOTP/bootstrap remain unverified. Provider/cloud-AI, Pi, DNS, deployment and invitations remain unverified or blocked. [Issue #6](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/6) is open with six unchecked scoring/coverage items for the next field-validation round. G2 reviewed proof and G4 ARM64 readiness require fresh evidence; no committed G2 record was located. The earlier claim of 18 passing disposable-DB checks is not recorded on main or in this checkout. The only record found is on the unmerged draft [PR #9](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/9) branch `codex/takeover-beta-20261003`: `artifacts/phase-4/takeover-20261003/beta/RECOVERY-1536fd4f52bb8b817a42ab4b475fa746.json` (`PASS_DB_ONLY`, 18 of 18 checks, candidate `7a315f7`), plus local `linux/arm64` build records (registry push `false`). That proof is DB-only, was not re-run or reviewed here, and does not cover app/worker runtime, Pi, providers or deployment.

## Next steps

1. Work the open follow-up issues on the [board](https://github.com/users/AbdelrhmanAh7/projects/21) under the constitution in `AGENTS.md` (every exception needs a recorded reason).
2. Reconcile G2/G4 with their actual evidence and owner authorization before execution; main does not establish completion, and the only G4 record lives on draft PR #9 until that PR is reviewed and merged.
3. Obtain a fresh issue #6 field-validation version without modifying frozen evidence; keep issue #6 open until the new run's evidence supports closure.
4. Owner completes the Google → ZITADEL → FlowLine round-trip and TOTP/bootstrap privately, following [OWNER_ACTIONS.md](docs/implementation/OWNER_ACTIONS.md) (bounded provider checks: [BETA_EXECUTION_BRIEF.md](docs/implementation/BETA_EXECUTION_BRIEF.md)). Keep `PRIVATE_BETA_READY: NO` until provider, security, field-validation, and owner checks are evidenced.
5. After PR #77 (issue #62, `source-map-js` override) merges: confirm Dependabot alert #3 (GHSA-68fv-2mgg-jv7q) is closed as `fixed`, and that every alert left in `gh api 'repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts?state=open'` was created after issue #62 (2026-10-07T15:00Z); record both on issue #62, then close it. On 2026-10-11 the open alerts were #3 plus #4–#17 (`next` 16.3.6, `shell-quote` 1.9.0, `sharp` 0.35.4, created 2026-10-08), which need their own issues; no tracking issue was found ([evidence](artifacts/phase-4/issue-62/EVIDENCE.md)).

Production deployment, live payments, invitations, DNS/Pi changes, and spending remain unapproved. No production readiness is implied by the stack implementation, review, or CI.

## Issue #251 — CSV build keeps later-row columns (2026-10-19)

PR #280. `src/engine/execute.ts` (`data.csv` build) now takes the header from all rows in first-seen order.
The jsonb→json run input fix (migration 0027) is already on main at `39364b5d` and is not part of this PR.
The harness must read the `feat:fl-csv-data-node` e2e-army result on the pushed head: it could not run locally
(sandbox blocks port binding). See [evidence](artifacts/phase-4/issue-251/EVIDENCE.md).

## Issue #297 — guard AI_QUESTIONS.md against stray audit deliverables (2026-10-19)

PR branch `ai/297` supersedes part of #271. Resolves reviewer finding where the Issue #250 CI PR audit deliverable was incorrectly placed into root `AI_QUESTIONS.md`. The QA checklist audit deliverable is properly housed under `docs/evidence/250/qa-checklist-audit.md`, and unit regression test `tests/unit/questions-deliverable-guard.test.ts` guards `AI_QUESTIONS.md` from containing stray audit deliverables or checklist tables. Harness next: CI and reviewer confirmation. E2E: not needed — internal documentation and test guard chore.
