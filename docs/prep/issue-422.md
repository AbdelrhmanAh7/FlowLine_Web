# Prep for #422: Follow-up from #418: non-blocking review findings

> Offline floor prep (2026-10-24T11:42Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=418 -->
Follow-up from #418 (Fresh restart of #252: [e2e] Integrations catalog page failing on main (replaces #263) (#313)).

P2/P3 findings from the reviewers. They do not block #418 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p2] e2e-army/147-mizano-create-customer-and-quote.e2e.ts:36: The test explicitly checks RTL layout by verifying document.documentElement.dir is 'rtl' when Arabic locale is set, which is correct for Arabic UI rendering.
- Localization Reviewer: [p3] e2e-army/147-mizano-create-customer-and-quote.e2e.ts:55: The test checks that Mizano is not shown in the catalog when in Arabic locale, which is consistent with the English locale test.

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

## Test Plan - Issue #422: Non-Blocking Review Findings

**Objective:** Verify localization and UI rendering behavior as identified in review feedback.

**1. Mizano Arabic Locale Test (e2e-army/147-mizano-create-customer-and-quote.e2e.ts:55)**
* **Name:** Mizano Visibility - Arabic Locale
* **Setup:**  Navigate to catalog page, select Arabic locale.
* **Assertion:** Mizano *should not* be displayed in the catalog.
* **File:** e2e-army/147-mizano-create-customer-and-quote.e2e.ts
* **Edge Case:** Verify locale switching doesn't affect Mizano visibility.

**2. RTL Layout Verification (e2e-army/147-mizano-create-customer-and-quote.e2e.ts:36)**
* **Name:** RTL Layout - Arabic Locale
* **Setup:** Navigate to catalog page, select Arabic locale.
* **Assertion:** `document.documentElement.dir` should be 'rtl'.
* **File:** e2e-army/147-mizano-create-customer-and-quote.e2e.ts
* **Edge Case:** Verify RTL layout adapts correctly across different screen sizes.

**3.  Locale Switch Test (Generic)**
* **Name:** Locale Switch - English to Arabic
* **Setup:** Start with English locale, switch to Arabic.
* **Assertion:** Catalog displays correctly in Arabic, Mizano is hidden.
* **File:**  Create new e2e test file.
* **Edge Case:** Verify no data loss or unexpected behavior during locale switch.

**4.  Arabic Locale - Empty Catalog**
* **Name:** Empty Catalog - Arabic
* **Setup:** Select Arabic locale, navigate to empty catalog page.
* **Assertion:** Catalog renders correctly in Arabic.
* **File:** e2e-army/147-mizano-create-customer-and-quote.e2e.ts
* **Edge Case:** Verify correct handling of empty catalog state.

**5.  Arabic Locale - Large Catalog**
* **Name:** Large Catalog - Arabic
* **Setup:** Select Arabic locale, navigate to a large catalog page.
* **Assertion:** Catalog renders correctly in Arabic, no performance issues.
* **File:** e2e-army/147-mizano-create-customer-and-quote.e2e.ts
* **Edge Case:** Verify performance with a large dataset.

**Notes:**  Focus on thoroughness and clear reporting of any discrepancies.  Utilize existing tests as a baseline.
