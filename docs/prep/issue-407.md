# Prep for #407: fix: qa finding: tests/integration/account-delete-sso-lock-order.test.ts lines ~27-28 … (split from #321)

> Offline floor prep (2026-10-24T09:14Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#321 item=finding:2542d26bf494 -->
Split from PR #321 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/321), which reached the fix-round cap (6/6) without going green. Parent issue: #315.

### Scope (one item)
- qa finding: tests/integration/account-delete-sso-lock-order.test.ts lines ~27-28 …

tests/integration/account-delete-sso-lock-order.test.ts lines ~27-28 still say 'Against the old deletion order the SSO-first case fails: deletion is seen waiting at `delete from "user"` holding W, and on release the SSO audit insert deadlocks with it'. The new PHASE4_BETA_REPORT.md #108 entry says 'No execution against the pre-#65 commit is recorded here'. This parent finding, bundled into this task, is unresolved: either record a pre-#65 run that fails (commit, command, observed `40P01`), or reword the header as expected rather than observed behaviour.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/321#issuecomment-6278206709

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #321". Keep the change small; do not reuse the parent branch `ai/315`.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `.github/workflows/claude.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`

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

## Test Plan: Account Delete SSO Lock Order

**Issue:** Resolve failing integration test related to SSO lock order during account deletion.

**Goal:** Verify correct deletion order with SSO handling, specifically addressing the deadlock issue.

**Test Cases:**

1.  **Name:** SSO Deletion - Basic Success
    *   **Setup:** Standard account creation, SSO enabled.
    *   **Action:** Delete account via UI.
    *   **Assertion:** Account deleted successfully, SSO audit records correct deletion order.
    *   **File:** `tests/integration/account-delete-sso-lock-order.test.ts`
2.  **Name:** SSO Deletion - Long Delay
    *   **Setup:** Same as above.
    *   **Action:** Trigger a longer delay during the deletion process.
    *   **Assertion:**  Ensure the system doesn't hang indefinitely. Monitor for timeouts.
    *   **File:** `tests/integration/account-delete-sso-lock-order.test.ts`
3.  **Name:** SSO Deletion - Concurrent Operations
    *   **Setup:** Two accounts, one with SSO.
    *   **Action:** Initiate deletion of both accounts simultaneously.
    *   **Assertion:** Verify that the system handles concurrent operations without deadlocks.
    *   **File:** `tests/integration/account-delete-sso-lock-order.test.ts`
4.  **Name:** Account Deletion - No SSO
    *   **Setup:** Standard account creation, SSO disabled.
    *   **Action:** Delete account via UI.
    *   **Assertion:** Account deleted successfully, no SSO-related issues.
    *   **File:** `tests/integration/account-delete-sso-lock-order.test.ts`
5.  **Name:** Edge Case - Large Dataset
    *   **Setup:** Account with a large amount of data.
    *   **Action:** Delete the account.
    *   **Assertion:** Verify deletion completes successfully, performance is acceptable.
    *   **File:** `tests/integration/account-delete-sso-lock-order.test.ts`

**Additional Considerations:**

*   **Environment:** Test in a controlled environment mimicking production.
*   **Monitoring:** Implement robust monitoring to capture any errors or deadlocks.
*   **Rollback:** Have a rollback plan in case of unexpected failures.
