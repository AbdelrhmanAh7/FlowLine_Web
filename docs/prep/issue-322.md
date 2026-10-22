# Prep for #322: Fresh restart of #180: Improve client-side error display for /admin/copy (replaces #186)

> Offline floor prep (2026-10-22T19:36Z): capacity 0 — agy: agy daily code budget (300) used; agy-med: agy daily code budget (300) used; agy-low: agy daily code budget (300) used; agy-pro: agy daily code budget (300) used. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-restart pr=AbdelrhmanAh7/FlowLine_Web#186 issue=180 -->
PR #186 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/186) for issue #180 reached the fix-round cap without going green: 42 open finding(s), 8 day(s) old, fix rounds 4/3. Splitting it would not help, so the task starts again.

### Scope
Implement issue #180 as written, from the current default branch, on a NEW branch (never `ai/180`; do not cherry-pick it wholesale).

What the reviewers flagged on the old attempt (avoid repeating it):
- qa finding: e2e-army/180-admin-copy-errors.e2e.ts (first test): expect(pageBody).…
- qa finding: e2e-army/180-admin-copy-errors.e2e.ts (first test): expect(patchBody)…
- qa finding: e2e-army/180-admin-copy-errors.e2e.ts (second test): the title says a…
- qa finding: src/app/admin/copy/copy-editor.tsx (handleWriteError): state.refetch(…
- qa finding: Missing tests for the new UI behaviour: nothing covers the meLoadErro…
- qa finding: Arabic translations in src/i18n/messages/ar.json are accurate and use…

### Done when
- the acceptance criteria of #180 pass on the new branch, with tests;
- the PR body says "Closes #180" and "Supersedes #186"; keep the change as small as the issue allows.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/ci/env.test.template`
- `.github/workflows/claude.yml`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Issue #322 - /admin/copy Error Display

**Goal:** Verify the fix for improved client-side error display for /admin/copy, replacing #186.

**1. Copy Error - Successful Copy:**
   * **Name:** Successful Copy Validation
   * **Setup:** Initiate a successful copy operation via the /admin/copy UI.
   * **Assertion:** Verify the UI displays a success message, no error indicators.
   * **File:** `e2e-army/180-admin-copy-errors.e2e.ts` (Test Case 1)

**2. Copy Error - Invalid Data:**
   * **Name:** Invalid Data Error Handling
   * **Setup:** Attempt to copy data with invalid input (e.g., incorrect format).
   * **Assertion:** Verify the UI displays the appropriate error message, clearly indicating the issue.
   * **File:** `e2e-army/180-admin-copy-errors.e2e.ts` (Test Case 2)

**3. Copy Error - Network Failure Simulation:**
   * **Name:** Network Error Simulation
   * **Setup:** Simulate a network failure during the copy operation.
   * **Assertion:** Verify the UI displays a network error message, providing guidance to the user.
   * **File:** `e2e-army/180-admin-copy-errors.e2e.ts` (Test Case 3)

**4. Copy Error - UI State Update:**
   * **Name:** `copy-editor.tsx` State Update
   * **Setup:** Trigger the `handleWriteError` function in `copy-editor.tsx`.
   * **Assertion:** Verify the state is updated correctly (e.g., `refetch` called) and the UI reflects the error state.
   * **File:** `src/app/admin/copy/copy-editor.tsx`

**5. Missing Test - UI Behavior (MeLoadError):**
   * **Name:** MeLoadError UI Test
   * **Setup:** Trigger a `MeLoadError` scenario (simulated).
   * **Assertion:** Verify the new UI element for displaying the error is present and correctly populated.
   * **File:** `e2e-army/180-admin-copy-errors.e2e.ts` (Test Case 4)

**6. Edge Case - Large Data Volume:**
   * **Name:** Large Data Copy
   * **Setup:** Attempt to copy a large dataset.
   * **Assertion:** Verify error handling remains robust and doesn’t crash the application.
   * **File:** `e2e-army/180-admin-copy-errors.e2e.ts` (Test Case 5)

**7. Arabic Translation Verification:**
    * **Name:** Arabic Translation Accuracy
    * **Setup:** Copy data with Arabic characters.
    * **Assertion:** Verify the error messages are correctly translated and displayed in Arabic.
    * **File:** `src/i18n/messages/ar.json`
