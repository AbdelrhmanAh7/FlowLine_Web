# Prep for #409: fix: 147-mizano-create-customer-and-quote.e2e.ts: blocker (Claude Opus 5.5·high): These tests depend on a gallery card …

> Offline floor prep (2026-10-24T09:56Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#328 item=finding:86a319081a09 -->
Split from PR #328 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/328), which carries ai-stuck without going green. Parent issue: #326.

### Scope (one item)
- 147-mizano-create-customer-and-quote.e2e.ts: blocker (Claude Opus 5.5·high): These tests depend on a gallery card …

**blocker** (Claude Opus 5.5·high): These tests depend on a gallery card with `data-testid="template-deal-won-mizano-quote"`, the EN/AR names, and a canvas node labelled "Mizano — Create customer (needs approval)". The template definition (`src/engine/design-templates.ts`) and the `designTemplates.deal-won-mizano-quote` strings in `src/i18n/messages/{en,ar}.json` are not in this PR. That template work was in #244, which was not merged. If it is not on main, all three tests fail and `gate` stays red. Either add the template and i18n changes to this PR, or link the commit on main that already contains them.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/328#discussion_r4322732458

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #328". Keep the change small; do not reuse the parent branch `ai/326`.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/workflows/claude.yml`
- `.gitignore`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `CLAUDE.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`

## Existing tests nearby

- none found

## Test plan (ollama:gemma3:4b)

## Test Plan: Issue #409 - FlowLine_Web - Mizano Quote Template

**Objective:** Verify functionality of tests dependent on the Mizano quote template (originally in #244) which are currently failing due to missing template definition and i18n strings.

**Test Cases:**

1.  **Test Case:** Template Inclusion & I18N Verification
    *   **Setup:** Create a fresh branch from `main`.
    *   **Action:** Merge PR #328 (which contains the Mizano template and i18n strings).
    *   **Assertion:** All three failing tests pass. Gallery card displays correctly with all required data.
    *   **File:** 147-mizano-create-customer-and-quote.e2e.ts
    *   **Edge Case:** Verify correct EN/AR translations for all labels and names.

2.  **Test Case:** Canvas Node Verification
    *   **Setup:** Branch from `main`.
    *   **Action:** Ensure the "Mizano — Create customer (needs approval)" canvas node exists.
    *   **Assertion:** The canvas node is present and correctly labeled.
    *   **File:** 147-mizano-create-customer-and-quote.e2e.ts
    *   **Edge Case:** Verify the node’s label is accurate across different languages.

3.  **Test Case:** Gallery Card Data Test
    *   **Setup:** Branch from `main`.
    *   **Action:** Verify the gallery card has the correct `data-testid` attribute.
    *   **Assertion:** `data-testid="template-deal-won-mizano-quote"` is present.
    *   **File:** 147-mizano-create-customer-and-quote.e2e.ts
    *   **Edge Case:**  Inspect the HTML source code to confirm the attribute is correctly set.

4.  **Test Case:** Template Definition Verification (Manual)
    *   **Setup:** Branch from `main`.
    *   **Action:** Inspect `src/engine/design-templates.ts` to confirm the template definition exists.
    *   **Assertion:** The `designTemplates.deal-won-mizano-quote` definition is present.
    *   **File:** src/engine/design-templates.ts

5.  **Test Case:** I18N String Verification (Manual)
    *   **Setup:** Branch from `main`.
    *   **Action:** Inspect `src/i18n/messages/{en,ar}.json` to confirm the i18n strings are present.
    *   **Assertion:** The required strings are present and correctly formatted.
    *   **File:** src/i18n/messages/{en,ar}.json

**Overall Strategy:**  The primary test is to merge the changes from PR #328.  Secondary verification involves manual inspection of the relevant files to confirm the template and i18n strings are correctly included.
