# Prep for #428: Follow-up from #413: non-blocking review findings

> Offline floor prep (2026-10-24T13:05Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=413 -->
Follow-up from #413 (Fresh restart of #145: Mizano connection type: base URL + scoped API key with 'Test connection' (replaces #215) (#301) [2/2]).

P2/P3 findings from the reviewers. They do not block #413 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p2] src/i18n/connection-test.ts:11: Arabic translation for 'testAuthFailed' uses formal Arabic (مفتاح API غير صالح — تحقق من المفتاح وأنه يمنح الوصول) which is appropriate for this context.
- Localization Reviewer: [p2] src/i18n/connection-test.ts:12: Arabic translation for 'testUnreachable' uses appropriate formal Arabic (تعذّر الوصول إلى المزوّد — تحقق من الرابط وأنه يعمل) with correct diacritics.
- Localization Reviewer: [p2] src/i18n/connection-test.ts:13: Arabic translation for 'testProviderError' uses correct Modern Standard Arabic (أعاد المزوّد خطأً غير متوقع).
- Localization Reviewer: [p2] src/i18n/connection-test.ts:14: Arabic translation for 'testEgressBlocked' uses appropriate formal Arabic (هذا العنوان غير مسموح به — استخدم رابط https العام للمزوّد).
- Localization Reviewer: [p2] src/i18n/connection-test.ts:15: Arabic translation for 'testNotOwner' uses correct Modern Standard Arabic with proper grammar (لا يمكن أن يختبر هذا الاتصال الخاص إلا العضو الذي أنشأه).
- Localization Reviewer: [p2] src/i18n/connection-test.ts:16: Arabic translation for 'testGone' uses appropriate formal Arabic (لم يعد هذا الاتصال موجودًا — حدّث الصفحة) with correct diacritics.
- Localization Reviewer: [p2] src/i18n/connection-test.ts:17: Arabic translation for 'testUnavailable' uses correct Modern Standard Arabic (اختبار الاتصال غير متاح لهذا الاتصال).
- Localization Reviewer: [p2] src/i18n/connection-test.ts:10: Arabic translation for 'test' uses correct Modern Standard Arabic (اختبار الاتصال).
- Localization Reviewer: [p2] src/i18n/connection-test.ts:9: Arabic translation for 'testOk' uses correct Modern Standard Arabic with proper formatting (الاتصال سليم — {account}).

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

## Test Plan - Issue #428: Localization Review Follow-up

**Objective:** Verify Arabic translations in `src/i18n/connection-test.ts` as per reviewer feedback.

**1. Test Case: 'test' Translation Verification**
   * **File:** `src/i18n/connection-test.ts` (Line 10)
   * **Setup:** Run the application with the 'test' string present.
   * **Assertion:** The translated string is "اختبار الاتصال" (Modern Standard Arabic).
   * **Edge Case:** Verify the translation remains consistent across different environments.

**2. Test Case: 'testOk' Translation Verification**
   * **File:** `src/i18n/connection-test.ts` (Line 9)
   * **Setup:** Run the application with the 'testOk' string present.
   * **Assertion:** The translated string is "الاتصال سليم — {account}" (Modern Standard Arabic).
   * **Edge Case:** Verify the `{account}` placeholder is correctly rendered.

**3. Test Case: 'testAuthFailed' Translation Verification**
   * **File:** `src/i18n/connection-test.ts` (Line 11)
   * **Setup:** Run the application with the 'testAuthFailed' string present.
   * **Assertion:** The translated string is "مفتاح API غير صالح — تحقق من المفتاح وأنه يمنح الوصول" (Formal Arabic).

**4. Test Case: 'testUnreachable' Translation Verification**
   * **File:** `src/i18n/connection-test.ts` (Line 12)
   * **Setup:** Run the application with the 'testUnreachable' string present.
   * **Assertion:** The translated string is "تعذّر الوصول إلى المزوّد — تحقق من الرابط وأنه يعمل" (Formal Arabic).

**5. Test Case: 'testProviderError' Translation Verification**
   * **File:** `src/i18n/connection-test.ts` (Line 13)
   * **Setup:** Run the application with the 'testProviderError' string present.
   * **Assertion:** The translated string is "أعاد المزوّد خطأً غير متوقع" (Modern Standard Arabic).

**6. Test Case: 'testEgressBlocked' Translation Verification**
   * **File:** `src/i18n/connection-test.ts` (Line 14)
   * **Setup:** Run the application with the 'testEgressBlocked' string present.
   * **Assertion:** The translated string is "هذا العنوان غير مسموح به — استخدم رابط https العام للمزوّد" (Formal Arabic).

**7. Test Case: 'testNotOwner' Translation Verification**
   * **File:** `src/i18n/connection-test.ts` (Line 15)
   * **Setup:** Run the application with the 'testNotOwner' string present.
   * **Assertion:** The translated string is "لا يمكن أن يختبر هذا الاتصال الخاص إلا العضو الذي أنشأه" (Modern Standard Arabic).

**8. Test Case: 'testGone' Translation Verification**
   * **File:** `src/i18n/connection-test.ts` (Line 16)
   * **Setup:** Run the application with the 'testGone' string present.
   * **Assertion:** The translated string is "لم يعد هذا الاتصال موجودًا — حدّث الصفحة" (Formal Arabic).

**9. Test Case: 'testUnavailable' Translation Verification**
   * **File:** `src/i18n/connection-test.ts` (Line 17)
   * **Setup:** Run the application with the 'testUnavailable' string present.
   * **Assertion:** The translated string is "اختبار الاتصال غير متاح لهذا الاتصال" (Modern Standard Arabic).

**10. Regression Test: All 'test' Strings**
    * **File:** `src/i18n/connection-test.ts`
