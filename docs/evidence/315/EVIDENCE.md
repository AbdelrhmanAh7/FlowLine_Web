# Evidence — Issue #315: fix: qa finding: docs/implementation/PHASE4_BETA_REPORT.md, new #108 section: deadlock fix attribution

Tested commit: `cfdfbd1d7658cfca1154039b702a6fd83abcca70`
Branch `ai/315`. Split from PR #214 (parent issue #108).
Originating report: QA review on PR #214 (`https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/214#issuecomment-6121061574`).
Originating Sentry issue: None (internal QA review finding split from PR #214; parent issue #108).
UI: No UI changes; Playwright screenshots and Arabic RTL/LTR checks exempt.
Linkage: Supersedes part of #214. Refs #108.

## Context and Root Cause

In PR #214, the section added for issue #108 in `docs/implementation/PHASE4_BETA_REPORT.md` and the header in `tests/integration/account-delete-sso-lock-order.test.ts` contained an attribution ambiguity flagged during QA review:
1. One sentence credited the deadlock removal to issue #45 (PR #65) which established user-first locking in `consumeAccountToken("delete")`.
2. A later sentence referred to issue #109 (PR #216) as having implemented "the lock-reordering fix in `src/server/email/flows.ts`".
3. The header comment in `account-delete-sso-lock-order.test.ts` line 30 stated PR #216 (#109) incorporated the test "to verify the fix in flows.ts", while line 33 termed the hazard "the pre-#65 deadlock hazard".

### Resolution

- **Deadlock removal:** The circular wait between account deletion (`consumeAccountToken("delete")`) and the user's SSO sign-in (`completeSso`) was removed by **issue #45 (PR #65)**. Before PR #65, deletion locked workspaces first and only locked the user row on `DELETE FROM "user"`, creating a deadlock cycle with SSO (which locked user `FOR SHARE` first and workspace `KEY SHARE` on audit insert last). PR #65 locked the user row before workspaces, eliminating the circular wait.
- **Audit reordering:** Issue #109 (PR #216) implemented the subsequent audit-before-workspace reordering in `src/server/email/flows.ts` (part 2 of #47) to align deletion's statement order with SSO and prevent the co-member deletion upgrade hazard (serialized by `lockRetainedFileAccounting`). PR #216 also brought `account-delete-sso-lock-order.test.ts` into `main` as enduring regression coverage.
- **Consistent terminology:** The deadlock hazard guarded by `account-delete-sso-lock-order.test.ts` is consistently identified as **pre-#65**.

## Acceptance Criteria

- **AC1:** `docs/implementation/PHASE4_BETA_REPORT.md` contains the #108 section with a preceding blank line (preventing markdownlint MD022), explicitly states that issue #45 (PR #65) removed the deadlock between deletion and SSO by locking the user row before workspaces, clarifies that issue #109 (PR #216) implemented the subsequent audit-before-workspace reordering, and consistently names the deadlock hazard as pre-#65. In the Reconciliation 2026-10-14 note, it states status agreement rather than false "exact wording", and `docs/security/FEDERATED_MFA.md` consistently states in both Lock order and Validation limits that `tests/integration/federated-lock-order.test.ts` ran locally on 2026-10-12 against a throwaway PostgreSQL database for #108.
- **AC2:** `tests/integration/account-delete-sso-lock-order.test.ts` header comments consistently attribute the deadlock removal to issue #45 (PR #65), describe PR #216 (#109) as the audit-before-workspace reordering, name the hazard as pre-#65, and describe expected rather than observed failure against the old deletion order.
- **AC3:** Dedicated unit test `tests/unit/account-delete-lock-order-docs.test.ts` validates that both files consistently credit issue #45 (PR #65), describe #109 (PR #216) as audit reordering, use `pre-#65` consistently, that `FEDERATED_MFA.md` consistently states the local run status in both Lock order and Validation limits without claiming it was unexecuted, that `account-delete-sso-lock-order.test.ts` uses expected-failure phrasing, and that `EVIDENCE.md` lists AC5 linking the CTO decision.
- **AC4:** All repo checks pass cleanly: `pnpm typecheck`, `eslint` on touched files, and vitest unit tests.
- **AC5:** The issue #108 criterion ("the test reliably fails due to the lock ordering") is explicitly tracked as skipped/superseded on `main`. Because PR #65 (#45) and PR #216 (#109) are already merged to `main`, `tests/integration/account-delete-sso-lock-order.test.ts` passes 2/2 as a regression guard. Per CTO decision on PR #214 (`https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/214#issuecomment-6121061574`, head `b9ae3ee`), pre-fix failure execution is skipped on `main` and the test is delivered as an enduring regression baseline.

## Verification Report

| AC | Description | Evidence / Command | Exit Code | Observed Result |
|---|---|---|---|---|
| AC1, AC2, AC3 | Docs & header consistency | `npx vitest run --project unit tests/unit/account-delete-lock-order-docs.test.ts` | 0 | 5 passed (5/5 tests pass) |
| Regression on base | Fails on base branch | `npx vitest run --project unit tests/unit/account-delete-lock-order-docs.test.ts` against base `origin/main` | 1 | Failed on base (test did not exist, docs in base attributed deadlock to #109 instead of #45) |
| AC4: Types | TypeScript check | `pnpm typecheck` (`tsc --noEmit`) | 0 | Clean (exit code 0) |
| AC4: Lint | ESLint check | `pnpm exec eslint tests/integration/account-delete-sso-lock-order.test.ts tests/integration/federated-lock-order.test.ts tests/integration/pg-lock-helpers.ts tests/unit/account-delete-lock-order-docs.test.ts` | 0 | Clean (0 errors, 0 warnings) |
| AC4: Evidence Secrets | Secret scanner | `node scripts/check-evidence-secrets.mjs` | 0 | Clean (0 hits across repository files) |
| AC4: Unit Suite | Unit tests | `npx vitest run --project unit tests/unit/account-delete-lock-order-docs.test.ts tests/unit/email-token-lock-order.test.ts` | 0 | 16 passed (16/16 tests pass) |
| AC5: #108 criterion deviation | Tracked as skipped/superseded | CTO decision on PR #214 (`https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/214#issuecomment-6121061574`, head `b9ae3ee`) | N/A | Skipped/superseded on `main` (fix already on main); 2/2 pass as regression guard |

## Changed Covering Tests

- `tests/unit/account-delete-lock-order-docs.test.ts` (new covering unit test for AC1, AC2, AC3).
