# Prep for #391: fix: email-token-lock-order-docs.test.ts: tests/unit/email-token-lock-order-docs.test.ts:25-27: the H3 assertio… (split…

> Offline floor prep (2026-10-24T05:19Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#308 item=finding:494f1c201fd5 -->
Split from PR #308 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/308), which reached the fix-round cap (6/6) without going green. Parent issue: #303.

### Scope (one item)
- email-token-lock-order-docs.test.ts: tests/unit/email-token-lock-order-docs.test.ts:25-27: the H3 assertio…

tests/unit/email-token-lock-order-docs.test.ts:25-27: the H3 assertion `/tests\/integration\/email-token-lock-order\.test\.ts.*passed locally on 2026-10-08 against PostgreSQL/` is also satisfied by the Reconciliation paragraph ('The `tests/integration/email-token-lock-order.test.ts` suite also passed locally on 2026-10-08 against PostgreSQL'). It therefore does not pin the H3 paragraph, despite the comment saying it does. Anchor it to the H3 text, e.g. include 'two-connection PostgreSQL test' in the pattern, or scope the match to the '## H3 security readiness review' section.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/308#issuecomment-6276967932

**17 more item(s) from the parent, for the same task:**
- qa finding: (non-blocking) [minor] docs/implementation/PHASE4BETAREPORT.md, new '…: (non-blocking) [minor] docs/implementation/PHASE4_BETA_REPORT.md, new 'Reconciliation 2026-10-14' paragraph (last sentence): it says 'No test code, test assertions or CI configuration changed.' The same PR changes test code: tests/integration/federated-lock-order.test.ts drops its local `routeTrans…
- qa finding: (non-blocking) [minor] tests/integration/account-delete-sso-lock-orde…: (non-blocking) [minor] tests/integration/account-delete-sso-lock-order.test.ts, new header comment (~line 31): 'PR #216 (#109) incorporated this test and helper verbatim to verify the fix in flows.ts before PR #214 landed' implies PR #214 merged. PR #214 hit the fix-round cap and was split, and is …
- qa finding: (non-blocking) [minor] Scope: the issue asks to 'Keep the change smal…: (non-blocking) [minor] Scope: the issue asks to 'Keep the change small' for one finding, the email-token-lock-order status. This PR also moves `routeTransactions` usage in tests/integration/federated-lock-order.test.ts, adds history comments to pg-lock-helpers.ts and account-delete-sso-lock-order.t…
- qa finding: (non-blocking) [nit] EVIDENCE.md section 3: the command runs 6 test f…: (non-blocking) [nit] EVIDENCE.md section 3: the command runs 6 test files and reports '6 passed (6) / 162 passed', but output is shown only for 4 files (owner-tracking-keyword and dependency-advisories are missing). Include the full output so the evidence is not truncated.

https://github.com/Abdel…
- qa finding: (non-blocking) [nit] EVIDENCE.md AC2 cites the H3 section at '~line 1…: (non-blocking) [nit] EVIDENCE.md AC2 cites the H3 section at '~line 132'. In the diff the H3 paragraph is at ~line 140 (hunk `@@ -129,7 +137,7 @@`). Update the line reference.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/308#issuecomment-6276967932
- qa finding: In

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.github/actions/gate-report/action.yml`
- `.github/ci/env.test.template`
- `.github/workflows/gate.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/gate-cceeb5d/GATE.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/template-actions.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:gemma3:4b)

**Test Plan: Email Token Lock Order Docs - H3 Assertion Issue**

**Issue:** H3 assertion in `tests/unit/email-token-lock-order-docs.test.ts` is incorrectly pinning due to reconciliation paragraph.

**Goal:** Verify the H3 assertion is correctly scoped to avoid false positives.

**Test Cases:**

1.  **Name:** H3 Scope Verification - PostgreSQL
    *   **Setup:** Run `tests/unit/email-token-lock-order-docs.test.ts` against PostgreSQL.
    *   **Assertion:** Verify the H3 assertion passes, confirming the scope is correctly applied.
    *   **File:** `tests/unit/email-token-lock-order-docs.test.ts`
    *   **Edge Case:** Verify the assertion doesn't fail due to the reconciliation paragraph.

2.  **Name:** H3 Scope Verification - Alternative Text
    *   **Setup:** Modify the H3 assertion to include "two-connection PostgreSQL test" in the pattern.
    *   **Assertion:** Verify the H3 assertion passes.
    *   **File:** `tests/unit/email-token-lock-order-docs.test.ts`
    *   **Edge Case:** Ensure the change doesn't affect the overall test suite functionality.

3.  **Name:** Section Scope Verification
    *   **Setup:** Ensure the H3 assertion is scoped to the "## H3 security readiness review" section.
    *   **Assertion:** Verify the H3 assertion passes.
    *   **File:** `tests/unit/email-token-lock-order-docs.test.ts`
    *   **Edge Case:** Confirm the scope remains consistent across different test runs.

4.  **Name:** Full Test Suite Run
    *   **Setup:** Run the entire test suite.
    *   **Assertion:** Verify all tests pass, including the email token lock order tests.
    *   **File:** All test files.
    *   **Edge Case:**  Ensure no regressions are introduced.

5.  **Name:** Regression Test - PostgreSQL Failure
    *   **Setup:**  Manually trigger a failure in the email token lock order test against PostgreSQL.
    *   **Assertion:** Verify the test fails as expected.
    *   **File:** `tests/unit/email-token-lock-order-docs.test.ts`
    *   **Edge Case:** Confirm the failure is correctly reported and reproducible.

**Additional Notes:**  This issue primarily focuses on the H3 assertion scope.  Ensure the fix doesn't introduce new issues or regressions.  Verify the full test suite passes after the change.
