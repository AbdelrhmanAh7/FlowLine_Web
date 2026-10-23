# Flowline Phase 4: launch candidate & private beta report


## Pilot E2E failure corrections — 2026-10-15

Local branch `fix/pilot-e2e-failures`; owner requested local changes/commit only, no push/PR or hub edits.
Two product defects fixed: run input's JSONB storage reordered CSV columns at the queue boundary
(migration 0027 now stores JSON), and copy-page metadata exposed the restricted page title despite a
404 content check (metadata now checks platform-admin authorization before translation).
The admin root also withholds privileged metadata from denied users. Auth/2FA checks are unchanged.

The reported `fl-flow-versions.1` expectation `[2,1]` contradicts the deliberate #204 CTO decision
below: save snapshots are unnumbered; only publications receive numbers. Product behavior is retained.
Local regression tests assert two saves yield null numbers, `save` reasons and descending revisions;
the repository's feature E2E expectation is corrected. Read-only hub reference remains unchanged and
will still fail this outdated assertion until its owner updates it.

Evidence and commands: [pilot E2E report](../../artifacts/pilot-e2e/EVIDENCE.md). Integration regressions
cover manual sample input and explicit run input through persistence and the real worker, and denied
admin content plus metadata for anonymous/non-admin/API-key callers. Existing JSONB row key order
cannot be reconstructed by migration. No production/provider verification is claimed. GitHub tracking,
CI and review are deferred to the harness under the owner's worktree-only/no-push/no-PR instruction;
this local commit is not a merge-ready or CI-gated claim.


## route() error-header unit coverage (issue #234) — 2026-10-15

PR #200 landed on main as `d1368116`; its implementation is now inherited from main. The active (unskipped) unit suite covers `HttpError` 403, `ZodError` 400, plain `Error` 500, and a cookie-bearing POST with an evil Origin and no `sec-fetch-site`. Each checks the status, error code and both headers; the CSRF case also proves the handler never runs. This is test-only coverage; no new user flow or dependency is introduced. Local verification after integrating main: `nice -n 10 pnpm exec vitest run tests/unit/route-error-headers.test.ts --maxWorkers=2` — 4 passed, none skipped; `pnpm typecheck` and `pnpm lint` — exit 0. Full suite/build remain for hosted CI.

## Legacy backfill 0026 (issue #205) — 2026-10-14

Migration `0026_flow_version_run_backfill` backs up numbered non-publication snapshots before clearing their numbers;
publication numbers remain unchanged. Its insert trigger keeps old application images from numbering new snapshots.
Forward and manual reverse acquire `SHARE ROW EXCLUSIVE` on `flow_version` before accessing the backup, retain it through
commit, and use transaction-local lock/statement timeouts of 5/30 seconds. Readers continue; writers wait. The immutability
trigger is disabled only inside the transaction. Reverse stays outside the journal; run it with
`psql -v ON_ERROR_STOP=1 --single-transaction -f drizzle/reverse/0026_flow_version_run_backfill.sql`.
It restores backed-up numbers, fails atomically if a later publication reused one, and leaves the backup for reruns.
Numbers already cleared without backup by prerequisite #204's 0025 are outside this reverse's coverage.

Verified locally on a disposable `flowline_test_205r6` database with Node 24: backfill integration 6/6 and runs 20/20.
The fixture also removes the backup table to exercise a real pre-0026 schema. Cases cover legacy save/run/overwrite data,
forward twice, reverse twice, forward after reverse, old-image inserts and collision refusal. The concurrent-insert
regression failed before the fix (writer completed between backup and update), then passed with the early lock.
`pnpm typecheck`, `pnpm lint`, `drizzle-kit check`, and E2E tooling hygiene 12/12 pass; full suites/build run only in CI.
The inherited #204 E2E spec was removed per the CTO scope instruction; no new E2E spec was added.

Not merge-ready: #207 is still open. PR #253 still targets main; GitHub rejected retargeting it to ai/204 because PR #211
already has that base/head pair. The harness must reconcile the duplicate PRs, keep this work stacked until #207 lands,
then rebase onto main and obtain new green CI and CodeRabbit confirmation. No push or review-thread resolution was made.

## Flows list publishedVersion only changes on publish (issue #204, PR #207) — 2026-10-15

The fix and migration below are already on main via `83a80114` (#253). Revalidation adds isolated numbering coverage,
a deterministic two-connection publish/unique-index regression, and fixes the legacy fixture so 0025 actually clears numbers.
The issue and feature API E2E tests pass 2/2 on the isolated dev stack; authenticated EN/AR routes return 200.
Exact hub production-stack validation, hosted CI and review confirmation remain pending. [Current evidence](../../artifacts/phase-4/issue-204/EVIDENCE.md#revalidation--2026-10-15).
The following results are historical (2026-10-13):

Fix for the `feat:fl-flows-list` failure (#117): a run's pinned `flow_version` snapshot took the next number of the
per-flow sequence, so two runs before the first publish made it v3 instead of v1. Per the CTO decision on PR #207, only
publications are numbered now: `insertVersion` (`src/server/flows.ts`) gives `save`, `overwrite` and `run` snapshots
`version = NULL` and derives the next number from `publish` rows only, so the first publication is always v1. Draft
edits (autosave, which bumps `flow.revision`) never wrote a snapshot and still don't. Migration 0025 drops `NOT NULL`
and backfills: it drops the 0002 immutability trigger, nulls `version` on every non-`publish` row (published numbers,
which subflow steps pin, are kept) and recreates the trigger in the same transaction. History orders by `created_at`.
The history panel and run inspector name an unnumbered snapshot by reason ("Saved snapshot", "Copy kept before
overwrite", "Run snapshot"; `common.*Snapshot`, `runs.rerun.originalSnapshot`, ar + en) through `flowVersionLabel` /
`rerunOriginalLabel` in `src/i18n/engine-text.ts`; the run detail API returns `version: null` for such runs.
Verified locally on a freshly migrated `flowline_test_204`: `tests/integration/runs.test.ts` (publish once then two runs
keeps publishedVersion 1; saves and an overwrite before the first publish give v1; publish, save, overwrite, two runs,
then publish gives v2; the save/overwrite tests fail without the `insertVersion` change),
`tests/integration/flow-version-backfill.test.ts` (legacy save/overwrite/run numbers nulled, published number and its
subflow lookup kept, trigger back on), `tests/integration/flows.test.ts`, `tests/unit/flow-version-label.test.ts`.
e2e-army tooling and hygiene (`tests/unit/e2e-army-tooling.test.ts`, 12/12 passed): `e2e-army/117-flows-list-dashboard.e2e.ts`
uses `expect.poll` (no fixed `setTimeout` delay) and passes 1/1 against a stack built from `c95f8b5`; top-level e2e-army files
stay within the 8-file cap by consolidating the Mizano integration actions spec (`148` into `147`).
`pnpm typecheck` and eslint on the changed files are clean.
Evidence: `artifacts/phase-4/issue-204/EVIDENCE.md`. Known gap, left for a follow-up issue (not filed
from this PR): history orders by `created_at`, the transaction start, so overlapping transactions can list two
snapshots out of insertion order (see `DESIGN_DECISIONS.md`).

## route() error headers (issue #200) — 2026-10-13

`route()` (`src/server/http.ts`) now sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on every error response it builds (`HttpError`, validation, unhandled 500), not only on the platform success path. Non-platform `route()` success responses are unchanged and not covered. Covered by `tests/integration/route-error-headers.test.ts` (platform copy refusals 404 (member and anonymous) and 403, plus `/api/me` 401 and the cross-site refusal; fails on the old code; 4 tests pass locally) and the request-level `e2e-army/200-route-error-headers.e2e.ts`. [Design item 10](../security/CREDENTIALS_DESIGN.md). Run locally against a disposable PostgreSQL; full CI is pending.

## Account deletion: audit rows before the workspace lock — 2026-10-13 (issue #109, part 2 of #47)

`consumeAccountToken("delete")` (`src/server/email/flows.ts`) now inserts its `account.deleted` audit rows before it locks the user's workspaces `FOR UPDATE`, so the key-share lock each insert takes on its workspace comes in the same order as in the SSO transactions (user row, then the audit insert) and is never awaited while holding a workspace. Rows are corrected under the workspace lock if a membership changed in between; `transfer_required` now rolls back. The person-visible result is unchanged. Two co-members deleting at once cannot deadlock on the shared workspace: every deletion first takes the installation-wide retained-file accounting lock, so deletions are serialized; a new two-connection test in `tests/integration/retained-file-locking.test.ts` pins this. Verified locally at `6323281` (the last code and test change on this branch; later commits only touch docs and comments) against a throwaway `flowline_test_109` database (PostgreSQL): `tests/integration/retained-file-locking.test.ts` (4/4), `email.test.ts` (9/9), `email-token-lock-order.test.ts` (3/3); `tests/unit/email-token-lock-order.test.ts` (10/10, mocked database); eslint and `pnpm typecheck`. The e2e-army test `e2e-army/109-account-delete-shared-audit.e2e.ts` runs in the hub verify job, not locally. No full gate or browser run is claimed. Details: [lock-order.md](../engineering/lock-order.md#workspace-for-update-vs-sso-audit-insert-47).

Review rounds 1–2 resolution — 2026-10-13 (same issue): the #108 deadlock test `tests/integration/account-delete-sso-lock-order.test.ts` is now **part of this change** (copied verbatim from `origin/ai/108` at `2ef1fb8`, together with the `routeTransactions` helper it needs in `tests/integration/pg-lock-helpers.ts`), so the issue's "passes the deadlock test" criterion is verified on the head being merged, not claimed: it passes 2/2 on this branch against a throwaway `flowline_test_109r3` database. The key-share → `FOR UPDATE` upgrade the reorder could introduce is now pinned by a real negative control, `tests/integration/account-delete-key-share-upgrade.test.ts`: with only the accounting lock removed (a test-only mock), the same two co-member deletions, each paused after its audit insert and released together, leave one transaction aborted with `40P01` at the workspace `FOR UPDATE` while holding its key-share — proving the accounting lock is load-bearing (the earlier "the test fails" sentence in lock-order.md was a counterfactual; it is now an executed test). The e2e-army header was corrected to name exactly what each test pins. Local runs on this head: `retained-file-locking.test.ts` 4/4, `account-delete-sso-lock-order.test.ts` 2/2, `account-delete-key-share-upgrade.test.ts` 1/1 (three consecutive runs), `email.test.ts` 9/9, `tests/unit/email-token-lock-order.test.ts` 10/10. The #108 test file is identical to PR #214's, so merging either first keeps the other merge clean.

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

## Dependabot alert #3, `source-map-js` — 2026-10-12 (issue #62)

`source-map-js` 1.2.1 (GHSA-68fv-2mgg-jv7q, high; CSS build and test tooling only, no Flowline source imports it) is raised by the override `"source-map-js": ">=1.2.2 <2"` in `pnpm-workspace.yaml`; the lockfile was regenerated with `pnpm install --lockfile-only` and resolves only 1.2.2. Guarded by `tests/unit/dependency-advisories.test.ts`; details in [DEPENDENCIES.md](../security/DEPENDENCIES.md), evidence in [artifacts/phase-4/issue-62/EVIDENCE.md](../../artifacts/phase-4/issue-62/EVIDENCE.md). **Pending after PR #77 merges:** alert #3 closed as `fixed` and the open-alert query checked ([NEXT_ACTION.md](../../NEXT_ACTION.md) step 5). Open alerts #4–#17 (`next`, `shell-quote`, `sharp`) are newer and not covered here. This changes no private-beta or production acceptance.

## Account deletion vs the user's own SSO sign-in: lock-order test — 2026-10-12 (issue #108, part 1 of #47)

`tests/integration/account-delete-sso-lock-order.test.ts` runs the real `consumeAccountToken("delete")` and `completeSso` for one user on two PostgreSQL connections, in both orders, and requires both to settle without `40P01`. This is a **regression test** for the lock ordering fix from issue #109 (PR #216, commit `d86fb7d7`): the fix made `consumeAccountToken("delete")` lock the user row and write its `account.deleted` audit rows before locking workspaces `FOR UPDATE`, matching the SSO transaction order.

**Acceptance criteria & history (#108 / #109):** Issue #108 originally called for an integration test that "reliably fails due to the lock ordering". The test was created on branch `ai/108` along with helper `tests/integration/pg-lock-helpers.ts`. When issue #109 (PR #216) implemented the lock-reordering fix in `src/server/email/flows.ts`, it copied `account-delete-sso-lock-order.test.ts` and `pg-lock-helpers.ts` verbatim from `ai/108` to satisfy its own verification ("passes the deadlock test"), and PR #216 was merged to `main` first (commit `d86fb7d7`). Authored on `ai/108`, copied into PR #216, the test serves as a regression guard on `main` verifying that both orders complete without deadlock (2/2 pass without `40P01`). The test guards against the lock-ordering deadlock hazard described in its header (in the SSO-first order prior to commit `d86fb7d7` / parent `83c7bb8e`, deletion held the workspace row and waited at `delete from "user"`, while the in-flight SSO transaction held the user row and needed a key-share lock on that workspace). No execution against the pre-fix parent commit `83c7bb8e` is recorded here; validation confirms that both orders finish without deadlock on the current codebase. `routeTransactions` is exported from `pg-lock-helpers.ts` and reused across `account-delete-sso-lock-order.test.ts` and `federated-lock-order.test.ts`. Local verification against a throwaway `flowline_test_i108` database: `tests/integration/account-delete-sso-lock-order.test.ts` (2/2 pass), `tests/integration/federated-lock-order.test.ts` (2/2 pass), eslint on the changed files, `pnpm typecheck` (`tsc --noEmit`), and the `.husky/pre-push` check suite (134/134 files, 1780 tests pass). CI remains the gate. No full gate or browser run is claimed here; this changes no beta or production acceptance. Details: [lock-order.md](../engineering/lock-order.md#workspace-for-update-vs-sso-audit-insert-47).

## Company Builder refund note — 2026-10-04 (issue #49)

The fixed note added to every refund/cancellation draft (`REFUND_NOTE`, ar/en in `src/company-builder/packs/customer-follow-up.ts`) named "a member of our team" instead of who decides; it now names the business **owner** as the decision maker for that specific request and still promises no outcome (no refund, cancellation or approval announced or implied). Copy and lock: [COPY_REVIEW.md](../company-builder/COPY_REVIEW.md); bug ledger FB-14: [BUGS.md](../../artifacts/company-builder/BUGS.md). Scorer noPromise checks (`flowline-field/field.spec.ts`) globally exclude the updated note sentence via replaceAll so refunded/cancelled terms do not trigger false positives on VP-05/VP-06 across single or repeated note drafts. Verified locally with the unit REF-*/REF-NOTE tests in `tests/unit/cb-pack-customer-follow-up.test.ts`, `tests/unit/i18n.test.ts` and `pnpm typecheck`. No integration, browser, build or full-gate run is claimed here, and this changes no private-beta or production acceptance.

## Focused-run evidence helpers: explicit child environment — 2026-10-03

Issue #36: the four local focused-run helpers (`upload-admission/run-focused.mjs`, `federated-mfa/run-focused.mjs`, `run-auth-focused.mjs`, `artifacts/phase-4/security-auth/run-focused.mjs`) no longer start Vitest with `...process.env`. They use the allowlist in `scripts/focused-run-env.mjs` (OS/runtime names plus the synthetic values each helper builds), record variable names only (never values) in new result JSON or stderr, and support `--dry-run`. [Allowlist and limits](../../artifacts/phase-4/paid-pilot-round1/upload-admission/README.md#child-environment-issue-36). Verified locally on Windows only: unit test, dry-runs, and a probe launching `npx tsx` and a Vitest unit run under the allowlist. The helpers were **not re-run against a database** (no Docker started), the Linux path is unit-tested by name only, and the earlier recorded runs predate the change and used the ambient shell. `check-drizzle-prune.mjs` and the gate/release/Company Builder scripts still pass `process.env` (not focused database runs); the frozen `artifacts/beta-execution` helpers are historical. This does not change release scope or the unverified items below.

## H3 security readiness review — 2026-10-03

PR #21 (H3, open; its base PR #17 is merged into main) enforces local MFA across all session reads, refuses replayed TOTP codes at both federated gates, retains pending global-provider/account and workspace revocation fences, and documents the sign-in transition for existing enrolled users. [Behavior](../security/FEDERATED_MFA.md); [checks and source fingerprint](../../artifacts/phase-4/h3-readiness/README.md). Focused unit checks are separate from PostgreSQL integration, browser/provider validation and main-target CI, which remain pending. It is not merged or deployed. This update does not change private-beta or production acceptance. Issue #37 (a possible lock-order inversion between SSO link confirmation and federated challenge completion, which share the initiating session) is fixed in source by one documented lock order and a shared helper ([Lock order](../security/FEDERATED_MFA.md#lock-order)); the mocked-order unit test passes locally, and the two-connection PostgreSQL regression `tests/integration/federated-lock-order.test.ts` ran locally on 2026-10-12 against a throwaway PostgreSQL database for #108, and CI is the gate. Of two adjacent inversions found while auditing, member role change/removal against the SSO audit insert (#42: the workspace row was locked `FOR UPDATE`, which conflicts with the key-share lock of the `audit_event` foreign key, while the SSO transactions held the member row) is fixed in source by locking it `FOR NO KEY UPDATE` ([Member changes](../security/FEDERATED_MFA.md#lock-order)); the mocked-order unit test `tests/unit/member-lock-order.test.ts` passes locally, the two-connection regression `tests/integration/member-lock-order.test.ts` **passed locally (5 tests) against a throwaway `flowline_test_46` database via `scripts/with-env.mjs`**; the other integration files were not run locally and CI runs them. Password reset against account-deletion confirmation, is fixed by issue #45: verify, reset and delete confirmation now lock the user row before the token row and re-check the token under both locks ([Email-token lock order](../security/FEDERATED_MFA.md#email-token-lock-order)); its mocked-order unit test passes locally, the two-connection PostgreSQL test `tests/integration/email-token-lock-order.test.ts` is **not executed** locally and needs CI. Account deletion still takes workspace locks `FOR UPDATE` and is outside #42; after #45 it locks the user first, so the earlier same-user SSO/audit gap description no longer applies. Issue #66 adds a route-level H3 regression lock, `tests/integration/sec-federated-mfa-regression.test.ts` ([what it covers](../security/FEDERATED_MFA.md#validation-limits)), executed locally against a disposable PostgreSQL; it changes no production behaviour and no readiness verdict.

Issue #72 adds a bounded failure audit for failed and abandoned federated MFA steps (workspace `sso.mfa_failed`, platform `signin.mfa_failed`; reasons `invalid_code`, `replayed_code`, `rate_limited`, `expired`, the last also from the retention sweep), see [Failure audit](../security/FEDERATED_MFA.md#failure-audit); its tests extend the #66 file and pass locally against a disposable PostgreSQL 16. It does not change the lock order or the lock-order known gaps above. It changes no readiness verdict and is not deployed.

### PR #46 review follow-up — 2026-10-11

Merged `origin/main` at `6aa89ed` into `claude/issue-42`, preserving #42 membership locks and #45 email-token locks and reconciling their documentation. The three queued comments affirm the implementation and identify no code defect; no runtime change was made for them. Focused local verification: `pnpm exec vitest run --project unit tests/unit/member-lock-order.test.ts tests/unit/federated-lock-order.test.ts tests/unit/email-token-lock-order.test.ts tests/unit/docs-index.test.ts` passed (4 files, 22 tests). PostgreSQL integration and the full suite were not run in this follow-up; CI must verify the merged candidate. Round 5 (QA): the rank table in [lock-order.md](../engineering/lock-order.md) was reordered to the order the code takes the locks (user, email token, session, account, workspace, member, audit) and its backward sequences (reset writes account before session; the audit insert key-share locks the workspace after the member row) are written down as exceptions with the reason each cannot deadlock; `tests/unit/lock-order-doc.test.ts` pins the table. The `FOR NO KEY UPDATE` conflict list now includes `FOR SHARE`. The `tests/integration/member-lock-order.test.ts` file runs in the `checks` integration shards on CI; its pass on the final head must be confirmed there. Round 8 (merge conflict): merged the local `origin/main` ref (`d136811`; a fetch was blocked by the sandbox, so later main commits are not included) into the branch; the conflicts were only in [lock-order.md](../engineering/lock-order.md) and [FEDERATED_MFA.md](../security/FEDERATED_MFA.md). Both keep this PR's rank table and #42 fix, and take main's additions: the #241 account-after-member gap (tracked, not fixed here), the #109 note that `delete` inserts its audit rows before its workspace locks, and the scope sentence on implicit locks. The `changeRole`/`removeMember` known gap main still listed is removed because this fix closes it. Focused local run, serial: `pnpm exec vitest run "$FILE"` for `tests/unit/lock-order-doc.test.ts` (3 tests), `tests/unit/member-lock-order.test.ts` (6), `tests/unit/sso-callback-lock-order.test.ts` (2), `tests/unit/password-reset-lock-order.test.ts` (6) and `tests/unit/federated-lock-order.test.ts` (4) all passed. `tests/integration/member-lock-order.test.ts` also passed locally (5 tests) against a throwaway `flowline_test_46` database via `scripts/with-env.mjs`, its first real execution; the other integration files were not run locally and CI runs them. The Stop hook's `vitest related` run fails on integration files at `global-setup.ts` because it passes no `DATABASE_URL`; that is the hook's environment, not a test failure. Round 10 (merge conflict): merged latest `origin/main` into `claude/issue-42`; verified `tests/unit/lock-order-doc.test.ts` (3 tests), `tests/unit/member-lock-order.test.ts` (6 tests), `tests/unit/docs-index.test.ts` (4 tests), `tests/integration/member-lock-order.test.ts` (5 tests passed against `flowline_test_46`), `pnpm lint` and `pnpm typecheck` (clean, exit code 0). Round 11 (review threads): addressed review board comments across `src/server/members.ts:131,159`, `tests/integration/member-lock-order.test.ts:1`, and `tests/unit/member-lock-order.test.ts:1`; verified unit tests, integration tests against `flowline_test_46`, lint, and typecheck. Round 12 (QA & review cleanup): deduplicated `routeTransactions` and `TransactionRunner` in `tests/integration/member-lock-order.test.ts` by importing from `./pg-lock-helpers`; relaxed markdown substring assertions in `tests/unit/lock-order-doc.test.ts`; extended `tests/unit/member-lock-order.test.ts` to assert HTTP 404 on missing member across both `changeRole` and `removeMember`; verified all unit tests, lint, and typecheck. Round 13 (QA review findings): exported and directly verified `lockWorkspaceMembership` (AC1); added explicit AC4 test demonstrating `FOR UPDATE` causes deadlocks while `FOR NO KEY UPDATE` avoids them in `tests/unit/member-lock-order.test.ts` (8 tests); updated `docs/DEVELOPER_GUIDE.md` security regression and integration examples to reference `member-lock-order.test.ts`; aligned `Known violations` in `docs/engineering/lock-order.md` noting V1 is resolved by #42; verified unit tests, lint, and typecheck (all exit 0). Round 14 (CodeRabbit review threads & merge): merged latest `origin/main` into `claude/issue-42`; updated `docs/engineering/lock-order.md` and `tests/unit/lock-order-doc.test.ts` to remove the obsolete reset exception (session deletion precedes credential account writes per #41), clarified that user `FOR SHARE` is not a complete ordering fence, and corrected V1 sequence in Known Violations to `Member (6) → Workspace key-share (5) during SSO audit insert (7)`; verified unit tests, lint, and typecheck (all exit 0).

## PR #14 diagnostic checkpoint — 2026-10-03

Full gate `37093517476`, CI SHA `f10278806a20a80b0bedd683ce446c46e7d0e416`, remains **FAIL**: WebKit 77 passed / 1 failed; Chromium and Firefox jobs succeeded. The journey found the Output tab and then hit its whole-test deadline during click actionability. Offline inspection of PR head `dd840db` found no loader import path linking the Drizzle prune to this failure. Pre-existing WebKit/test timing is suspected, not proven; the missing trace/JSON prevents root-cause confirmation. [Diagnosis and next experiment](WEBKIT_14_DIAGNOSIS.md). Follow-up (CI history, 27 full-tier WebKit runs): not attributable to #14; head `ec672d7` passed WebKit 78/78 in run `37132314447`, and the intermittent journey timeout is tracked in issue #35 ([follow-up](WEBKIT_14_DIAGNOSIS.md)). This docs-only investigation makes no readiness claim and does not close the earlier WebKit incidents recorded below or elsewhere. Issue #35 follow-up: the gate-report action now uploads the Playwright JSON reports and, for failed browser tests, `trace.zip` files (7 days), so the next occurrence can be diagnosed; no test, timeout or retry changed and the flake stays undiagnosed ([where to find them](../DEVELOPER_GUIDE.md#playwright-traces-in-ci)).

## PR #16 request-body follow-up — 2026-10-03

PR #16 (`b63ffed`, on base `a9f7597`) adds Caddy route caps, a 10-second upload-read/5-second header deadline and HTTP/1.1+HTTP/2 ingress, plus the missing shared `capBody` 10-second deadline and Arabic/English timeout messages. No Next.js Proxy body clone was added. [Layered policy](../security/REQUEST_BODY_LIMITS.md); [focused evidence](../../artifacts/phase-4/paid-pilot-round1/proxy-body-limits.md). M4's source deferral is addressed for the owned ingress; Caddy runtime, trusted-proxy/no-direct-web exposure and provider/tunnel deadlines remain unverified. This does not change the deployment/readiness verdicts or the historical evidence below.

## Issue #41 password-reset lock order — 2026-10-04

`consumeAccountToken("reset")` takes the user row (`FOR UPDATE`, ahead of the token row since #45), then deletes the user's sessions, then writes the accounts, the same user-first order the federated transactions use after prerequisite #43; before #41 it had locked the credential account, then the sessions, then the user. [Order and retained-upload note](../security/FEDERATED_MFA.md#password-reset-recovery-lock-order); the two gaps listed in the original change were closed by #45. `#43` (the federated paths' shared user-first order, `src/server/federated-locks.ts`) is merged into this branch, so both sides now take the same order; `tests/unit/sso-callback-lock-order.test.ts` (passes locally, 2 of 2) pins the user-then-session order of the two `completeSso` callback transactions in `src/server/sso.ts`, which the other lock-order tests do not execute. The mocked-order unit test `tests/unit/password-reset-lock-order.test.ts` passes locally (6 of 6) and is the check that guards the #41 change: 3 of its 6 tests fail on the previous `flows.ts` (the two exact-sequence tests and the rank test). The two-connection PostgreSQL test `tests/integration/password-reset-lock-order.test.ts` pins the end-to-end protocol (no `40P01`, correct final state) in both directions but, because #45 had already put the user row first, it would also pass on the previous code, so it does not by itself catch a regression of the session-before-account move; it is **not executed** locally and needs CI. No migration, no UI change, no change to private-beta or production acceptance.

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

## Issue #161 — security documentation review follow-up (2026-10-13)

AGENTS.md and the PR template document security posture; OWNER_ACTIONS.md remains the single record of unverified owner security settings. Dependency work is separately tracked in #62 per the CTO answer. When acceptance criteria are deferred to a follow-up issue, PRs must use non-closing references (`Refs #N`), and linkage is verified against the live PR body (`gh pr view YOUR_PR_NUMBER --json body,closingIssuesReferences`). No security setting was changed.

## Test coverage note: hub route selection (#174)

`tests/unit/selection.spec.test.ts` tests the real exports of `src/ai/hub/selection.ts` (`assertRoutesUsable`, `assertRouteSelection`, `aiRoutesIn`, `pinDefaultRoutes`). Issue #174 named `selectEngineByScore` and `selectFreeEndpoint`, which never existed in this repo (`git log --all -S "selectEngineByScore" -- src` is empty), so per the CTO decision on PR #183 the file's first test pins the module's export list. Acceptance with this repo's Vitest, since Jest's `--listTests` is rejected as an unknown option: `pnpm exec tsc --noEmit && pnpm exec vitest list --project unit --filesOnly | grep selection.spec`. A second test keeps the commands in the file header and in this note literal: it fails on any angle-bracket placeholder, which a POSIX shell would parse as an input redirection.

## PR #287 local CI repair — 2026-10-16

Merged main `131235b9` into the pilot branch (merge `b5765988`), preserving both NEXT_ACTION entries.
Main ends at migration 0026; 0027 needs no renumbering. `pnpm db:generate` reports no drift;
all 28 migrations applied to fresh `flowline_test_pr287_migrations` on localhost:5432,
and `run.input` is `json`. CI run 38792754200 attempt 2 failed the demo cross-process lock test:
readiness preceded SIGTERM handler registration. The test now registers cleanup first and
always terminates/awaits the child in finally. No production lock semantics changed.
Local lint/typecheck pass; unit results: 1759 passed, 1 conditional skip (1760 total),
131 files. The pre-existing skip is the DEMO_MEDIA-only placeholder assertion instantiated
for DEVELOPER_GUIDE by describe.each; no failure was skipped by this repair.
No push, GitHub writes, dependency changes, secrets or permission changes.


## CSV build keeps later-row columns (issue #251) — 2026-10-19

`data.csv` build mode (`src/engine/execute.ts:335-342`) now builds the header from every row's keys in first-seen order;
before, `Papa.unparse` used row 1 only and dropped columns that first appear later. Regression test:
`tests/unit/engine-v2.test.ts` (fails on base, passes on head). The jsonb→json run input change that fixed the
gate's `qty,name` ordering is already on main (`39364b5d`, migration 0027). Local e2e-army run not possible
(sandbox); see `artifacts/phase-4/issue-251/EVIDENCE.md`.

## Pilot metrics: run success rate 0.0% formatting (issue #316) — 2026-10-20

Fixed truthiness check bug on `metrics.runSuccessRate` in `scripts/pilot-metrics.ts:263`.
Previously, `metrics.runSuccessRate ? ... : "N/A"` evaluated a true `0` success rate (when every
finished run in the cohort failed) as falsy, outputting `"N/A"` instead of `"0.0%"`.
Using `metrics.runSuccessRate != null` ensures that `0` correctly formats as `"0.0%"`, while `null`
(no finished runs) outputs `"N/A"`.
Covered by unit tests in `tests/unit/pilot-metrics.test.ts` (15/15 passing) and integration
tests in `tests/integration/pilot-metrics.test.ts` (9/9 passing).
Regression tested against base failure. Supersedes part of #170.

## Pilot metrics: duplicate runs, scheduled runs and uptime (issue #320) — 2026-10-20

Resolved review findings from PR #170 (split finding f7eba2a4e9dd):
1. **Duplicate webhook runs**: Production never creates rejected `webhook_event` rows (retries return 200/409 directly), so querying `status = 'rejected'` reported 0 and missed duplicate runs. `getDuplicateWebhookRuns` now counts duplicate `run` rows grouped by `(flow_id, trigger_ref)` where `trigger_kind = 'webhook'` and `trigger_ref IS NOT NULL`.
2. **Scheduled runs**: Added `getScheduledRuns` querying runs where `trigger_kind = 'schedule'`, included in `PilotMetrics` and formatted in Markdown report.
3. **Staging uptime**: Added `NOT_TRACKED_UPTIME` documenting external `/api/health` monitoring, and included staging uptime row in `formatMetricsAsMarkdown`.
Covered by unit tests in `tests/unit/pilot-metrics.test.ts` (18/18 passing) and integration tests in `tests/integration/pilot-metrics.test.ts` (9/9 passing). Supersedes part of #170. Refs #143.
## i18n: Deal won → Mizano quote gallery strings (issue #242) — 2026-10-20

Added `localTemplates.deal-won-mizano-quote` EN and AR entries to message catalogs (`src/i18n/messages/en.json` and `src/i18n/messages/ar.json`).
Structure matches `lead-qualifier` with `name`, `description`, `sample`, `result`, and `nodes` (`deal`, `won`, `prepare`, `customer`, `quote`, `notify`, `skipped`).
Tested with `tests/unit/i18n-content-text.test.ts` (demonstrated failure on base, passes on head), `tests/unit/i18n.test.ts` (all 16 catalogue parity checks pass), and `tests/unit/local-scenarios.test.ts` (85/85 tests pass with pending subtask exclusion).
Subtask of #149.

## Blocker breaker: cigroup verify failure investigation (issue #335) — 2026-10-22

Investigated `cigroup:AbdelrhmanAh7/FlowLine_Web:verify` alert across 5 cited PRs (#329, #215, #184, #139, #135).
Proved via hub verification reports that each failed on independent branch-specific diffs and test planner
expectations rather than a shared regression on `main`. Cited PRs have been superseded or resolved by fresh
restarts (#376 merged at `8167bcbb`, #380 passed verify at `311ffd4`, #385 passed verify at `4d69ef1`).
All CI workflow gates preserved with zero workflow edits (`tests/unit/ci-workflows.test.ts` 82/82 passing).
Evidence documented in `docs/evidence/335/EVIDENCE.md`.

## i18n: RTL arrow consistency in Arabic gallery template string (issue #340) — 2026-10-23

Resolved non-blocking P3 localization review finding from PR #334 on `deal-won-mizano-quote`:
- Updated `localTemplates.deal-won-mizano-quote.name` in `src/i18n/messages/ar.json:361` from `"صفقة مكسوبة ← عرض سعر Mizano"` to `"صفقة مكسوبة → عرض سعر Mizano"`, replacing the leftwards arrow (`←`, U+2190) with the rightwards arrow (`→`, U+2192) for Arabic RTL typographic consistency.
- Added test coverage in `tests/unit/i18n-content-text.test.ts` and `tests/unit/i18n.test.ts` (`local template localization consistency (#340)`), asserting exact name equality and guarding against misplaced `←` arrows across all local templates.
- Demonstrated regression failure on base state (3 failures, rc=1) and 61/61 passes on head state (rc=0).
- Evidence documented in `docs/evidence/340/EVIDENCE.md`.

## Template validation: detailed missing actions error (issue #341) — 2026-10-23

Resolved review findings from PR #244:
1. **Template validation error specificity**: In `src/server/flows.ts` (`createFlow`), when template validation detects missing app actions that are not registered in the provider registry, the error message now lists the missing action IDs explicitly (`That template needs app actions that aren't available yet: action_one, action_two`) instead of a generic opaque rejection.
2. **Template action inspection helpers**: In `src/engine/design-templates.ts`, added `templateActionIds`, `missingTemplateActions`, `availableDesignTemplates`, and `heldBackDesignTemplates` helpers to inspect action requirements and filter available vs held-back design templates.
Covered by unit tests in `tests/unit/template-actions.test.ts` (6/6 passing) and integration tests in `tests/integration/flows.test.ts` (13/13 passing). Regression demonstrated against base failure. Follow-up from #244. Evidence in `docs/evidence/341/EVIDENCE.md`.

## Integrations catalog stable gate fix (issue #313, closes #252, supersedes #263) — 2026-10-23

Resolved `fl-integrations` stable gate failure on main:
1. Kept pre-GA Mizano out of `listProviders()` in `src/integrations/registry.ts` via `PRE_GA` set filter while retaining internal registration in `allProviders()`, `getProvider()` and `getAction()`.
2. Verified `GET /api/integrations/catalog` returns exactly 12 supported providers in pinned order with `count: 12`.
3. Added unit tests in `tests/unit/integrations-catalog.test.ts` (5/5 passing, demonstrating base failure vs head pass).
4. Updated `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` to assert 12 providers and verify Arabic RTL layout without Mizano, keeping top-level e2e-army files capped at ≤8.
5. All 53 contract tests in `tests/contract/mizano*.test.ts` continue to pass.



