# Prep for #421: fix: 147-mizano-create-customer-and-quote.e2e.ts: e2e-army/147-mizano-create-customer-and-quote.e2e.ts:96: The test exp…

> Offline floor prep (2026-10-24T11:20Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#410 item=finding:a92221d3e947 -->
Split from PR #410 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/410), which carries ai-stuck without going green. Parent issue: #409.

### Scope (one item)
- 147-mizano-create-customer-and-quote.e2e.ts: e2e-army/147-mizano-create-customer-and-quote.e2e.ts:96: The test exp…

e2e-army/147-mizano-create-customer-and-quote.e2e.ts:96: The test expects Arabic text 'صفقة مكسوبة → عرض سعر Mizano' which requires translation in src/i18n/messages/ar.json that is not included in this PR

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/410#issuecomment-6342555610

**1 more item(s) from the parent, for the same task:**
- 147-mizano-create-customer-and-quote.e2e.ts: e2e-army/147-mizano-create-customer-and-quote.e2e.ts:108: The test ex…: e2e-army/147-mizano-create-customer-and-quote.e2e.ts:108: The test expects a canvas node labeled 'Mizano — Create customer (needs approval)' which requires the template definition that is not included in this PR

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

## Test Plan: FlowLine_Web - Issue #421

**Objective:** Verify the inclusion of translated strings and template definitions related to the "Mizano - Create Customer & Quote" flow.

**1. Translation Verification:**
   * **Test Case:** Verify Arabic translation in `ar.json`.
      * **Setup:** Navigate to `src/i18n/messages/ar.json`.
      * **Assertion:**  Ensure the string 'صفقة مكسوبة → عرض سعر Mizano' exists and is correctly translated.
      * **File:** `src/i18n/messages/ar.json`
      * **Edge Case:** Verify correct character encoding (UTF-8).

**2. Canvas Node Verification:**
   * **Test Case:** Verify the presence of the canvas node.
      * **Setup:** Navigate to the relevant e2e test file.
      * **Assertion:**  The canvas node labeled 'Mizano — Create customer (needs approval)' is present.
      * **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`
      * **Edge Case:** Test with different browser zoom levels.

**3. Template Definition Verification (Related to Canvas Node):**
   * **Test Case:** Verify the existence of the template definition.
      * **Setup:**  Locate the required template definition.
      * **Assertion:** The template definition referenced in the canvas node label is present.
      * **File:** (Dependent on template location - investigate PR)
      * **Edge Case:** Template definition is updated, test for correct rendering.

**4. Regression Test (Basic Flow):**
   * **Test Case:**  Execute the full "Create Customer & Quote" flow.
      * **Setup:** Start the flow from the beginning.
      * **Assertion:**  All steps complete successfully, including the creation of the customer and quote.
      * **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`
      * **Edge Case:** Simulate network interruptions during the flow.

**5.  Localization Test (Alternative Language):**
    * **Test Case:** Run the flow in a different language (e.g., English).
       * **Setup:** Change the UI language setting.
       * **Assertion:**  The translated strings are displayed correctly, and the canvas node label is also translated.
       * **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`
       * **Edge Case:** Verify the localization mechanism handles different character sets correctly.
