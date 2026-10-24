# Prep for #424: Follow-up from #423: non-blocking review findings

> Offline floor prep (2026-10-24T12:02Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=423 -->
Follow-up from #423 (fix: 147-mizano-create-customer-and-quote.e2e.ts: e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85: The test exp… (#420)).

P2/P3 findings from the reviewers. They do not block #423 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p3] e2e-army/147-mizano-create-customer-and-quote.e2e.ts:125: The Arabic translation 'صفقة مكسوبة → عرض سعر Mizano' uses the regular hyphen (-) instead of an em-dash (—) for better typography consistency with the English version.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`

## Existing tests nearby

- `tests/unit/demo-docs-commands.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan - Issue #424: Localization Review Follow-up

**Objective:** Verify the Arabic translation fix in `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` related to em-dash usage.

**1. Em-Dash Consistency Test**
   * **Name:** Em-Dash Verification
   * **Setup:** Run the test case that utilizes the translated text.
   * **Assertion:** Verify the Arabic translation uses an em-dash (—) instead of a regular hyphen (-) in the specified location (line 125).
   * **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`
   * **Edge Case:** Ensure the test runs across different browsers and screen resolutions.

**2. Regression Test - Quote Creation**
   * **Name:** Quote Creation Regression
   * **Setup:** Create a new customer and quote using the flow.
   * **Assertion:** Verify the translated text appears correctly within the quote display.
   * **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`

**3.  Localization - Empty State Test**
   * **Name:** Empty State Localization
   * **Setup:**  Simulate an empty state scenario.
   * **Assertion:** Verify the Arabic translation is correctly displayed in the empty state message.
   * **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`

**4.  Localization - Different Quote Types**
   * **Name:** Quote Type Localization
   * **Setup:** Create quotes with different types (e.g., standard, discount).
   * **Assertion:** Verify the Arabic translation adapts correctly to the quote type.
   * **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`

**5.  UI Rendering Test**
   * **Name:** UI Rendering Test
   * **Setup:**  Inspect the rendered UI.
   * **Assertion:** Visually confirm the em-dash is rendered correctly and consistently with the English version.
   * **File:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`

**Notes:**  These tests should be executed alongside existing tests for regression.  Focus on thorough visual inspection of the translated text.
