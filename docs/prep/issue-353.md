# Prep for #353: Follow-up from #262: non-blocking review findings

> Offline floor prep (2026-10-23T11:34Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=262 -->
Follow-up from #262 (Account security page (4/4): disable MFA, sign-in journey test and Arabic/RTL check (#199) [1/3] (#199)).

P2/P3 findings from the reviewers. They do not block #262 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p2] src/i18n/messages/ar.json:249: The Arabic translation for 'backupCodes' uses a long dash (—) which could be replaced with a regular hyphen (-) for consistency with typical Arabic text formatting.

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

## Test Plan: FlowLine_Web - Issue #353 - Backup Codes Arabic Localization

**Objective:** Verify localization fix for ‘backupCodes’ in `ar.json`.

**Priority:** Medium

**Test Cases:**

1.  **Case Name:** Hyphen Consistency - Arabic
    *   **Setup:**  Navigate to Account Security page.
    *   **Assertion:** Verify ‘backupCodes’ text in `ar.json` uses a hyphen (-) instead of a dash (—).
    *   **File:** `src/i18n/messages/ar.json`
    *   **Edge Case:**  Ensure RTL layout remains unaffected.

2.  **Case Name:** RTL Layout Verification
    *   **Setup:**  Account Security page, Arabic locale selected.
    *   **Assertion:** Verify the entire page renders correctly in RTL (Right-to-Left) layout.
    *   **File:** `src/i18n/messages/ar.json`
    *   **Edge Case:** Test with different screen sizes.

3.  **Case Name:**  Text Length - Arabic
    *   **Setup:** Account Security page.
    *   **Assertion:** Verify the translated text length doesn’t cause layout issues.
    *   **File:** `src/i18n/messages/ar.json`
    *   **Edge Case:**  Test with extremely long Arabic words (if any).

4.  **Case Name:**  Existing Test Coverage
    *   **Setup:** Run existing tests: `tests/unit/demo-docs-commands.test.ts`, `tests/unit/docs-check-script.test.ts`, `tests/unit/docs-index.test.ts`, `tests/unit/gate-groups.test.ts`, `tests/unit/gate-selection.test.ts`
    *   **Assertion:**  All tests pass.
    *   **File:** All Unit Tests

5.  **Case Name:**  Locale Switch - Arabic
    *   **Setup:**  Switch to Arabic locale.
    *   **Assertion:** Verify the fix is consistently applied across the Arabic locale.
    *   **File:** `src/i18n/messages/ar.json`
    *   **Edge Case:** Test with different browsers and operating systems.
