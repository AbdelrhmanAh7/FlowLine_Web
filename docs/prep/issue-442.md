# Prep for #442: Follow-up from #441: non-blocking review findings

> Offline floor prep (2026-10-24T16:05Z): capacity 0 — agy: agy fails its canary: binary /opt/homebrew/bin/agy; agy-med: agy-med fails its canary: binary /opt/homebrew/bin; agy-low: agy-low fails its canary: binary /opt/homebrew/bin; agy-pro: agy-pro fails its canary: binary /opt/homebrew/bin. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=441 -->
Follow-up from #441 (Fresh restart of #180: Improve client-side error display for /admin/copy (replaces #186) (#322)).

P2/P3 findings from the reviewers. They do not block #441 and do not start a fix round; they are tracked here, one issue per PR.

- QA Second Opinion: [p2] e2e-army/200-route-error-headers.e2e.ts:171: The test name promises 'Arabic RTL', but the body only checks that the Arabic string is present; it never asserts dir="rtl"/RTL markup or layout. An LTR rendering of the Arabic 404 page would still pass, so the RTL part of the title is untested.
- QA Second Opinion: [p2] e2e-army/200-route-error-headers.e2e.ts:185: The 'without leaking server internals' assertions are limited to checking for the translation key and '<pre>'. A 404 page that leaks a stack trace, file path, or SQL/internal error in another element would still pass, so the test does not actually prove the non-leak requirement it claims to cover.
- Localization Reviewer: [p2] e2e-army/200-route-error-headers.e2e.ts:172: The Arabic error message 'لم نعثر على هذه الصفحة' is correct Modern Standard Arabic and properly handles RTL layout.
- Localization Reviewer: [p2] e2e-army/200-route-error-headers.e2e.ts:179: The English error message 'find that page' is appropriate and consistent with other error messages in the application.
- Localization Reviewer: [p3] e2e-army/200-route-error-headers.e2e.ts:171: The test correctly verifies that server internals are not leaked in both Arabic and English responses by checking absence of 'platformAdmin.copyEditor' and '<pre>' tags.

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

## Test Plan - Issue #442: Non-Blocking Review Findings

**Objective:** Verify findings from NQL review regarding `e2e-army/200-route-error-headers.e2e.ts`.

**1. RTL Arabic 404 Test:**
   * **Name:** RTL Arabic 404 Rendering
   * **Setup:** Navigate to a 404 page in RTL Arabic.
   * **Assertion:** Verify the page renders correctly with RTL layout using `dir="rtl"` or equivalent markup.
   * **File:** `e2e-army/200-route-error-headers.e2e.ts:171`
   * **Edge Case:** Simulate different browser/OS RTL settings.

**2. Server Leak Test (Enhanced):**
   * **Name:** Server Leak Detection - Comprehensive
   * **Setup:** Trigger a 404 error.
   * **Assertion:** Verify *no* server internals (stack traces, file paths, SQL, internal errors) are present in the response.
   * **File:** `e2e-army/200-route-error-headers.e2e.ts:185`
   * **Edge Case:** Simulate a complex error scenario (e.g., database connection failure).

**3. Arabic Error Message Validation:**
   * **Name:** Arabic Error Message - Modern Standard
   * **Setup:** Navigate to a 404 page in Arabic.
   * **Assertion:** Verify the Arabic error message "لم نعثر على هذه الصفحة" is displayed correctly.
   * **File:** `e2e-army/200-route-error-headers.e2e.ts:172`

**4. English Error Message Validation:**
   * **Name:** English Error Message - Consistency
   * **Setup:** Navigate to a 404 page in English.
   * **Assertion:** Verify the English error message "find that page" is displayed correctly.
   * **File:** `e2e-army/200-route-error-headers.e2e.ts:179`

**5. Server Leak Test (Minimal):**
   * **Name:** Server Leak - Absence of Pre
   * **Setup:** Trigger a 404 error.
   * **Assertion:** Verify the absence of `<pre>` tags in the response.
   * **File:** `e2e-army/200-route-error-headers.e2e.ts:171`
   * **Edge Case:**  Test with different HTTP client libraries.
