# Evidence — Issue #408: fix: qa finding: Acceptance-criterion deviation from #108 (split from #321)

Tested commit: `d7d5922c23e4253be2693340c4dc037390925c5d`
Branch `ai/408`. Split from PR #321 (parent issue #315, originating from #108 / PR #214).
Originating report: QA review on PR #321 (`https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/321#issuecomment-6278206709`).
Originating Sentry issue: None (internal QA finding split from PR #321; parent issue #315 / #108).
UI: No UI changes; Playwright screenshots and Arabic RTL/LTR checks exempt.
Linkage: Supersedes part of #321. Refs #108, #315.

## Context and Root Cause

Issue #408 addresses the QA review finding on PR #321 regarding the acceptance-criterion deviation from #108:
1. Issue #108 originally called for an integration test that "reliably fails due to the lock ordering".
2. On `main`, the deadlock between account deletion confirmation (`consumeAccountToken("delete")`) and SSO sign-in (`completeSso`) was already eliminated by **issue #45 (PR #65)**, which established user-first locking. Subsequently, issue #109 (PR #216) implemented the audit-before-workspace reordering.
3. Because PR #65 and PR #216 are already part of `main`, `tests/integration/account-delete-sso-lock-order.test.ts` passes 2/2 as an enduring regression guard and cannot fail on `main` without altering production code.
4. In PR #214 and PR #321, this deviation was justified only by citing an unrecorded "CTO decision 2026-10-13 on PR #214 / head b9ae3ee" or "Per CTO instructions".
5. QA flagged that a permanent report and test headers must not assert an authorization that is unrecorded; instead, the git history and technical reality must be accurately explained without claiming an unrecorded executive decision. Furthermore, `tests/integration/account-delete-sso-lock-order.test.ts` header contained point-in-time references (`(2/2 pass)` and `head b9ae3ee`), and `docs/security/FEDERATED_MFA.md` in Validation limits referred to `tests/integration/federated-lock-order.test.ts` vaguely as "the latter".

## Acceptance Criteria

- **AC1:** `docs/implementation/PHASE4_BETA_REPORT.md` contains the #108 section with a preceding blank line (preventing markdownlint MD022), explicitly states that issue #45 (PR #65) removed the deadlock between deletion and SSO by locking the user row before workspaces, clarifies that issue #109 (PR #216) implemented the subsequent audit-before-workspace reordering, explains git history (parent commit `83c7bb8e:src/server/email/flows.ts` already contained the user-first locking from PR #65), avoids unbacked CTO claims (`As confirmed by the CTO`, `Per CTO instructions`), consistently uses `pre-#65` terminology, and in the Reconciliation note asserts status agreement rather than "exact wording".
- **AC2:** `docs/security/FEDERATED_MFA.md` in Validation limits explicitly names `tests/integration/federated-lock-order.test.ts` (resolving "the latter") and consistently states its local execution status against a throwaway PostgreSQL database for #108.
- **AC3:** `tests/integration/account-delete-sso-lock-order.test.ts` header comments consistently attribute deadlock removal to issue #45 (PR #65), describe PR #216 (#109) as audit-before-workspace reordering, identify the hazard as `pre-#65`, use expected failure phrasing against the old deletion order, and remove point-in-time results `(2/2 pass)` and `head b9ae3ee` and unbacked CTO directives (`Per CTO directive`).
- **AC4:** The acceptance-criterion deviation from #108 ("the test reliably fails due to the lock ordering") is explicitly tracked as skipped/superseded on `main`: because PR #65 (#45) and PR #216 (#109) are already merged to `main`, `tests/integration/account-delete-sso-lock-order.test.ts` passes 2/2 as a regression guard. Pre-fix failure execution on `main` is skipped based on technical reality and git history (the fix was already in `83c7bb8e` before the test merged), without claiming an unrecorded executive decision. Furthermore, unit test `tests/unit/account-delete-lock-order-docs.test.ts` provides formal lock-conflict modeling proving the pre-#65 circular wait (40P01) and head deadlock-free serializability.
- **AC5:** Dedicated unit test `tests/unit/account-delete-lock-order-docs.test.ts` validates AC1, AC2, AC3, AC4, and AC5: verifying doc/header consistency, git history attribution, absence of stale point-in-time results or unbacked CTO assertions, and lock order dependency cycle in pre-#65 vs acyclic ordering in head.
- **AC6:** All repo checks pass cleanly: `pnpm typecheck` (`tsc --noEmit`), `pnpm exec eslint` on changed files, `node scripts/check-evidence-secrets.mjs`, and vitest unit tests.

## Verification Report

| AC | Description | Evidence / Command | Exit Code | Observed Result |
|---|---|---|---|---|
| AC1, AC2, AC3, AC4, AC5 | Docs & header consistency + lock-order conflict analysis | `pnpm exec vitest run tests/unit/account-delete-lock-order-docs.test.ts --maxWorkers=2` | 0 | 6 passed (6/6 tests pass) |
| Regression on base | Fails on base branch | `pnpm exec vitest run tests/unit/account-delete-lock-order-docs.test.ts --maxWorkers=2` against base `origin/main` | 1 | Failed on base (test did not exist, docs in base attributed deadlock to #109 instead of #45) |
| AC for #108 criterion deviation | Tracked as skipped/superseded on main | Fix already in git history (PR #65 / #45); pre-fix failure on main is skipped/superseded | N/A | Skipped/superseded on main; verified by regression guard and AC4 unit test |
| AC6: Types | TypeScript check | `pnpm typecheck` (`tsc --noEmit`) | 0 | Clean (exit code 0) |
| AC6: Lint | ESLint check | `pnpm exec eslint tests/integration/account-delete-sso-lock-order.test.ts tests/unit/account-delete-lock-order-docs.test.ts` | 0 | Clean (0 errors, 0 warnings) |
| AC6: Evidence Secrets | Secret scanner | `node scripts/check-evidence-secrets.mjs` | 0 | Clean (0 hits across repository files) |
| AC6: Unit Suite | Unit tests | `pnpm exec vitest run tests/unit/account-delete-lock-order-docs.test.ts tests/unit/email-token-lock-order.test.ts --maxWorkers=2` | 0 | 17 passed (17/17 tests pass) |

## Changed Covering Tests

- `tests/unit/account-delete-lock-order-docs.test.ts` (new covering unit test for AC1 through AC5).
