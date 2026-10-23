# Prep for #379: Follow-up from #376: non-blocking review findings

> Offline floor prep (2026-10-23T21:28Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=376 -->
Follow-up from #376 (Fresh restart of #181: Add comprehensive error handling tests (replaces #184) (#323)).

P2/P3 findings from the reviewers. They do not block #376 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p3] e2e-army/200-route-error-headers.e2e.ts:43: The Arabic text 'لم نعثر على هذه الصفحة' is correctly translated and uses Modern Standard Arabic with consistent terminology.
- Localization Reviewer: [p3] e2e-army/200-route-error-headers.e2e.ts:48: The Arabic text 'تحرير النصوص' is correctly translated and uses Modern Standard Arabic with consistent terminology.
- Localization Reviewer: [p3] e2e-army/200-route-error-headers.e2e.ts:52: The code correctly checks for both RTL (Arabic) and LTR (English) layout attributes in the HTML.

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

## Test Plan - Issue #379: Localization Review Follow-up

**Objective:** Verify Localization Review findings in `e2e-army/200-route-error-headers.e2e.ts`.

**1. Arabic Text Accuracy (e2e-army/200-route-error-headers.e2e.ts:43, 48, 52)**
   * **Name:** Arabic Text Verification - Page Error
   * **Setup:**  Load page with Arabic error message.
   * **Assertion:** Verify the displayed text matches "لم نعثر على هذه الصفحة", "تحرير النصوص", and correct RTL/LTR layout.
   * **File:** `e2e-army/200-route-error-headers.e2e.ts`

**2. RTL/LTR Layout Test (e2e-army/200-route-error-headers.e2e.ts:52)**
   * **Name:** Layout Direction Test
   * **Setup:**  Simulate different browser layouts (RTL/LTR).
   * **Assertion:** Verify the Arabic text renders correctly in both RTL and LTR environments.
   * **File:** `e2e-army/200-route-error-headers.e2e.ts`

**3.  Edge Case - Empty String (All Files)**
   * **Name:** Empty String Handling
   * **Setup:**  Simulate a scenario where the error message string is empty.
   * **Assertion:** Verify the application handles the empty string gracefully (no errors, appropriate fallback).
   * **File:**  All files.

**4.  Localization - Modern Standard Arabic (All Files)**
    * **Name:** MSA Consistency
    * **Setup:**  Inspect the code and translated strings.
    * **Assertion:**  Verify the use of Modern Standard Arabic and consistent terminology.
    * **File:** `e2e-army/200-route-error-headers.e2e.ts`

**5.  Review Template Verification ( .github/pull_request_template.md)**
    * **Name:** PR Template Validation
    * **Setup:**  Review the PR template.
    * **Assertion:** Ensure the template contains all necessary information.
    * **File:** `.github/pull_request_template.md`

**Notes:**  These tests primarily focus on verifying the localization review findings.  Additional tests for broader functionality should be considered.
