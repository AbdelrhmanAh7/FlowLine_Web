# Prep for #386: Follow-up from #385: non-blocking review findings

> Offline floor prep (2026-10-24T03:24Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=385 -->
Follow-up from #385 (Fresh restart of #145: Mizano connection type: base URL + scoped API key with 'Test connection' (replaces #215) (#301)).

P2/P3 findings from the reviewers. They do not block #385 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p3] src/i18n/connection-test.ts:12: In the Arabic translation for 'testAuthFailed', consider using a more natural phrasing like 'مفتاح API غير صالح - تأكد من صحة المفتاح وأنه يمنح الوصول' for better readability.
- Localization Reviewer: [p3] src/i18n/connection-test.ts:15: In the Arabic translation for 'testUnreachable', the phrase 'تحقق من الرابط وأنه يعمل' could be slightly improved to 'تحقق من الرابط وأن الخادم يعمل' for clarity.
- Localization Reviewer: [p3] src/i18n/connection-test.ts:19: In the Arabic translation for 'testEgressBlocked', the phrase 'استخدم رابط https العام للمزوّد' could be more specific as 'استخدم عنوان URL العام للمزوّد ببروتوكول https' for better clarity.

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

## Test Plan - Issue #386: Localization Review Follow-up

**Objective:** Verify localization translations in `src/i18n/connection-test.ts` based on reviewer feedback.

**1. testAuthFailed_Arabic:**
   * **Setup:**  Run the application with Arabic locale enabled.
   * **Action:** Trigger the 'testAuthFailed' flow.
   * **Assertion:** Verify translated text displays: 'مفتاح API غير صالح - تأكد من صحة المفتاح وأنه يمنح الوصول'.
   * **File:** `src/i18n/connection-test.ts:12`

**2. testUnreachable_Arabic:**
   * **Setup:**  Simulate a network unreachable state.
   * **Action:** Trigger the 'testUnreachable' flow.
   * **Assertion:** Verify translated text displays: 'تحقق من الرابط وأن الخادم يعمل'.
   * **File:** `src/i18n/connection-test.ts:15`

**3. testEgressBlocked_Arabic:**
   * **Setup:**  Simulate egress blocked.
   * **Action:** Trigger the 'testEgressBlocked' flow.
   * **Assertion:** Verify translated text displays: 'استخدم عنوان URL العام للمزوّد ببروتوكول https'.
   * **File:** `src/i18n/connection-test.ts:19`

**4.  Base URL Test (All Languages):**
   * **Setup:**  Ensure the connection type is set to base URL.
   * **Action:** Initiate a connection test.
   * **Assertion:** Verify the connection test successfully establishes a connection.
   * **File:** `src/i18n/connection-test.ts` (Regression)

**5. API Key Test (All Languages):**
   * **Setup:** Ensure the API key is correctly configured.
   * **Action:** Initiate a connection test.
   * **Assertion:** Verify the connection test successfully establishes a connection.
   * **File:** `src/i18n/connection-test.ts` (Regression)

**6. Edge Case - Invalid API Key:**
   * **Setup:** Provide an invalid API key.
   * **Action:** Initiate connection test.
   * **Assertion:** Verify appropriate error message is displayed in Arabic.
   * **File:** `src/i18n/connection-test.ts:12`

**7. Edge Case - No Network Connection:**
   * **Setup:** Simulate no network connectivity.
   * **Action:** Initiate connection test.
   * **Assertion:** Verify appropriate error message is displayed in Arabic.
   * **File:** `src/i18n/connection-test.ts:15`

**8. Edge Case - Invalid URL:**
    * **Setup:** Provide an invalid URL.
    * **Action:** Initiate connection test.
    * **Assertion:** Verify appropriate error message is displayed in Arabic.
    * **File:** `src/i18n/connection-test.ts:19`

**Files:**  `src/i18n/connection-test.ts`, `.coderabbit.yaml`,  related tests.
