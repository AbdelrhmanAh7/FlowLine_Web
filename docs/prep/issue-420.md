# Prep for #420: fix: 147-mizano-create-customer-and-quote.e2e.ts: e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85: The test exp…

> Offline floor prep (2026-10-24T10:58Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#410 item=finding:7f88f1847229 -->
Split from PR #410 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/410), which carries ai-stuck without going green. Parent issue: #409.

### Scope (one item)
- 147-mizano-create-customer-and-quote.e2e.ts: e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85: The test exp…

e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85: The test expects a template with data-testid='template-deal-won-mizano-quote' which requires template definition in src/engine/design-templates.ts that is not included in this PR

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/410#issuecomment-6342555610

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #410". Keep the change small; do not reuse the parent branch `ai/409`.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `AGENTS.md`
- `AI_QUESTIONS.md`
- `NEXT_ACTION.md`
- `README.md`
- `artifacts/issue-161/EVIDENCE.md`
- `artifacts/issue-72/EVIDENCE.md`
- `artifacts/issue-74/EVIDENCE.md`
- `artifacts/issue-90/EVIDENCE.md`
- `artifacts/phase-4/issue-147/EVIDENCE.md`
- `artifacts/phase-4/issue-192/EVIDENCE.md`
- `artifacts/phase-4/issue-204/EVIDENCE.md`
- `artifacts/phase-4/issue-223/EVIDENCE.md`
- `artifacts/phase-4/issue-241/EVIDENCE.md`
- `artifacts/phase-4/issue-251/EVIDENCE.md`
- `artifacts/phase-4/issue-62/EVIDENCE.md`

## Existing tests nearby

- none found

## Test plan (ollama:gemma3:4b)

## Test Plan: FlowLine_Web - Issue #420

**Issue:** Missing template definition for “template-deal-won-mizano-quote”

**Goal:** Verify the correct template is rendered when creating a customer and quote.

**Test Cases:**

1.  **Test Case:** Create Customer & Quote - Basic Flow
    *   **Setup:**  New customer, new quote.
    *   **Action:** Initiate quote creation.
    *   **Assertion:** Verify the “template-deal-won-mizano-quote” template is displayed in the quote details.
    *   **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85`
    *   **Edge Case:**  Different customer data (e.g., different industry).

2.  **Test Case:** Quote Creation - No Template Defined
    *   **Setup:**  New customer, new quote.
    *   **Action:** Initiate quote creation.
    *   **Assertion:**  Test fails with the expected error message (template missing).
    *   **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85`

3.  **Test Case:** Template Definition Verification
    *   **Setup:**  New customer, new quote.
    *   **Action:**  Ensure `src/engine/design-templates.ts` contains the “template-deal-won-mizano-quote” definition.
    *   **Assertion:** Template definition exists and is valid.
    *   **File:** `src/engine/design-templates.ts`

4.  **Test Case:** Quote Creation - Data Variation
    *   **Setup:** New customer, new quote.
    *   **Action:** Initiate quote creation with varying customer data.
    *   **Assertion:** Verify the correct template is rendered consistently across different data sets.
    *   **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85`

5.  **Test Case:** Regression - Existing Quote Creation
    *   **Setup:** Existing customer, existing quote.
    *   **Action:** Attempt to create a new quote with the same template.
    *   **Assertion:** Verify the new quote renders the template correctly.
    *   **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85`

**Notes:**  This issue is tightly coupled to PR #410.  Focus on verifying the template definition and the rendering of the template within the quote creation flow.
