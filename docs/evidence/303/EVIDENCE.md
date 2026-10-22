# Verification Evidence: PR #308 (Issue #303)

**Model:** Gemini 3.8 Flash · **Effort:** High · **Why:** Resolve merge conflicts against main, reconcile email-token-lock-order test execution status across docs without contradictory unexecuted phrasing, eliminate duplicate H3 paragraphs, update unit regression assertions, and verify before commit.

Supersedes part of #214. Parent issue: #108.

## Acceptance Criteria

- **AC1:** Explicit numbered Acceptance Criteria defined and mapped to verification results, test commands, and observed exit codes.
- **AC2:** In `docs/implementation/PHASE4_BETA_REPORT.md`, the #108 section, H3 review section, and Reconciliation paragraph all consistently describe `tests/integration/email-token-lock-order.test.ts` as having passed locally on 2026-10-08 against PostgreSQL (issue #45) and verified against throwaway databases for #109 (`flowline_test_109`) and #108 (`flowline_test_i108`), with CI as the gate.
- **AC3:** In `docs/security/FEDERATED_MFA.md`, the Email-token lock order checks match this status (passed locally on 2026-10-08 against PostgreSQL).
- **AC4:** No conflicting claims: neither `docs/implementation/PHASE4_BETA_REPORT.md` nor `docs/security/FEDERATED_MFA.md` marks `tests/integration/email-token-lock-order.test.ts` as "not executed locally" or "unexecuted".
- **AC5:** The Reconciliation paragraph in `docs/implementation/PHASE4_BETA_REPORT.md` contains no contradictory "unexecuted" statements, and the H3 security readiness review section contains exactly one unified paragraph without duplicate blocks.
- **AC6:** Unit regression test `tests/unit/email-token-lock-order-docs.test.ts` demonstrates failure on base branch (`main`) and passes cleanly on head branch (`ai/303`).
- **AC7:** Pre-push checks (`pnpm typecheck`, `pnpm exec eslint`, and unit test suite) run clean with zero errors (exit code 0).
- **AC8:** Non-user-facing change (documentation consistency and unit regression test only; E2E not needed).

## Verification Report

| AC | Verification Target / Command | Observed Exit Code / Result |
|---|---|---|
| AC1 | This verification report and acceptance criteria mapping. | Verified (exit code 0) |
| AC2 | `pnpm exec vitest run tests/unit/email-token-lock-order-docs.test.ts` (`consistently records email-token-lock-order.test.ts passed locally against PostgreSQL across docs`) | Exit code 0 (passed) |
| AC3 | `pnpm exec vitest run tests/unit/email-token-lock-order-docs.test.ts` (`docs/security/FEDERATED_MFA.md records the 2026-10-08 local pass`) | Exit code 0 (passed) |
| AC4 | `pnpm exec vitest run tests/unit/email-token-lock-order-docs.test.ts` (`never marks tests/integration/email-token-lock-order.test.ts as unexecuted or not executed`) | Exit code 0 (passed) |
| AC5 | `pnpm exec vitest run tests/unit/email-token-lock-order-docs.test.ts` (`never contains unexecuted or not executed phrasing in the #108 Reconciliation paragraph`, `has exactly one H3 security readiness review paragraph without duplication or unexecuted statements`) | Exit code 0 (passed) |
| AC6 | Regression check on base (`origin/main`) vs head (`ai/303`): `tests/unit/email-token-lock-order-docs.test.ts` fails on base (exit code 1, 2 failed tests) and passes on head (exit code 0, 4 passed tests). | RED on base, GREEN on head |
| AC7 | `pnpm typecheck` && `pnpm exec eslint tests/unit/email-token-lock-order-docs.test.ts` && `pnpm exec vitest run tests/unit/email-token-lock-order-docs.test.ts tests/unit/email-token-lock-order.test.ts tests/unit/lock-order-doc.test.ts` | Exit code 0 (all clean, 18 tests passed) |
| AC8 | Non-user-facing change verification (no UI/browser flow modified; Playwright / RTL / LTR exempt). | Complete |

## Changed Covering Tests
- `tests/unit/email-token-lock-order-docs.test.ts`: Added unit regression test verifying doc consistency, absence of unexecuted phrasing in Reconciliation, and single non-duplicate H3 paragraph.
- `tests/integration/federated-lock-order.test.ts`: Reused `routeTransactions` export from `tests/integration/pg-lock-helpers.ts`.
- `tests/integration/account-delete-sso-lock-order.test.ts`: Documented #108 acceptance criteria and history in header comments.
- `tests/integration/pg-lock-helpers.ts`: Documented #108 authoring and #37 reuse in header comments.

## Originating Sentry Issue & PR Linkage
- **Originating Sentry issue:** None (QA / documentation consistency finding split from PR #214 / parent issue #108; not a runtime exception or crash).
- **PR Linkage:** Supersedes part of #214. Resolves QA recurring findings and CTO rework instructions on PR #308.
