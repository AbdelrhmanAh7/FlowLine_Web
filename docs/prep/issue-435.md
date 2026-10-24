# Prep for #435: fix: node-config.tsx: src/components/builder/node-config.tsx:1: Consider adding explicit di… (split from #383)

> Offline floor prep (2026-10-24T14:08Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#383 item=finding:19a23e7351ce -->
Split from PR #383 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/383), which reached the fix-round cap (6/6) without going green. Parent issue: #165.

### Scope (one item)
- node-config.tsx: src/components/builder/node-config.tsx:1: Consider adding explicit di…

src/components/builder/node-config.tsx:1: Consider adding explicit dir='ltr' attributes for TOTP secret and backup codes to ensure correct display in Arabic/RTL contexts.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/383#issuecomment-6321637405

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #383". Keep the change small; do not reuse the parent branch `ai/165`.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/ci/env.test.template`
- `.github/workflows/nightly.yml`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/RETEST.md`
- `artifacts/ai-hub/research/providers-2026-09-29.md`

## Existing tests nearby

- `e2e/tools/webkit-env.mjs`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: node-config.tsx - RTL Support

**Issue:** Add `dir='ltr'` to TOTP secret and backup code display.

**Goal:** Verify correct rendering of these elements in RTL locales.

**1. Test Case: Arabic Locale - Basic Display**
   * **Name:** RTL Basic Display
   * **Setup:**  Deploy to a test environment configured for Arabic (e.g., using a browser with RTL layout).
   * **Assertion:** TOTP secret and backup codes are displayed correctly from right to left.
   * **File:** node-config.tsx

**2. Test Case: RTL Locale - Complex Layout**
   * **Name:** RTL Complex Layout
   * **Setup:** Same as #1.
   * **Assertion:**  The entire node configuration section, including the secret and backup codes, renders correctly in RTL.
   * **File:** node-config.tsx

**3. Test Case:  Browser Compatibility - Chrome RTL**
   * **Name:** Chrome RTL Compatibility
   * **Setup:** Test in Chrome with RTL layout enabled.
   * **Assertion:**  Correct RTL rendering is observed.
   * **File:** node-config.tsx

**4. Test Case:  Edge Case - Long Secret/Codes**
   * **Name:** Long Secret/Code Rendering
   * **Setup:**  Generate a long TOTP secret and backup code string.
   * **Assertion:**  The long strings are rendered correctly without breaking the layout.
   * **File:** node-config.tsx

**5. Test Case:  Edge Case - Character Encoding**
   * **Name:** Character Encoding Validation
   * **Setup:**  Ensure the environment uses UTF-8 encoding.
   * **Assertion:**  Arabic characters are displayed correctly without corruption.
   * **File:** node-config.tsx

**6. Test Case:  Visual Inspection - Manual Review**
   * **Name:** Visual RTL Verification
   * **Setup:**  Manually inspect the rendered configuration in a RTL locale.
   * **Assertion:**  No visual artifacts or incorrect text direction are observed.
   * **File:** node-config.tsx

**7. Test Case:  Test Integration Env - RTL Configuration**
    * **Name:** RTL Configuration in Test Env
    * **Setup:** Run existing integration tests with RTL locale configured.
    * **Assertion:** Integration tests pass with RTL layout.
    * **File:** tests/unit/test-integration-env.test.ts

**Notes:**  Focus on visual correctness.  Leverage browser developer tools for layout inspection.  Consider using a dedicated RTL testing tool if available.
