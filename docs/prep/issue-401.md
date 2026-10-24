# Prep for #401: Follow-up from #397: non-blocking review findings

> Offline floor prep (2026-10-24T08:10Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=397 -->
Follow-up from #397 (fix: failing check `gate` (split from #244) (#326) [2/2]).

P2/P3 findings from the reviewers. They do not block #397 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p3] src/i18n/messages/ar.json:2362: The Arabic translation uses 'صفقة مكسوبة' for 'Deal won', which is accurate but could be more commonly phrased as 'صفقة مُنجزة' for better consistency with business terminology.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:2363: The Arabic translation uses 'طلب الموافقة' for 'ask for approval', which is correct but could be simplified to 'طلب موافقة' without the extra article for better conciseness.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:2364: The Arabic translation uses 'ينهي التشغيل' for 'ends the run', which is correct but could be more precisely 'يوقف التنفيذ' for better technical consistency.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:2370: The Arabic translation uses 'تجهيز بيانات العميل وعرض السعر' for 'Prepare customer and quote', which is accurate but could be simplified to 'تجهيز بيانات العميل والعرض' for better flow.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:2371: The Arabic translation uses 'Mizano — إنشاء العميل (يتطلب موافقة)' for 'Mizano — Create customer (needs approval)', which is correct but could use parentheses instead of spaces for better consistency with English: 'Mizano — إنشاء العميل (يتطلب الموافقة)'.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:2372: The Arabic translation uses 'Mizano — إنشاء مسودة عرض سعر' for 'Mizano — Create draft quote', which is correct but could be simplified to 'Mizano — إنشاء عرض سعر' as 'مسودة' (draft) is implied in the context.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:2373: The Arabic translation uses 'Slack — عرض السعر جاهز' for 'Slack — Quote ready', which is correct but could be more precisely 'Slack — عرض السعر مُنجز' for better consistency with the workflow terminology.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:2374: The Arabic translation uses 'لم تُكسب الصفقة' for 'Deal not won', which is accurate but could be more commonly phrased as 'الصفقة لم تُنجز' for better grammatical flow.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:2378: The Arabic translation uses 'اختر اتصالي Mizano وSlack' for 'Choose the Mizano and Slack connections', which is correct but could be more precisely 'اختر اتصالات Mizano وSlack' for better grammatical accuracy.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:2379: The Arabic translation uses 'عيّن معرف قناة المبيعات' for 'Set your sales channel ID', which is correct but could be more precisely 'عيّن معرف قناة البيع' for better consistency with the term 'المبيعات'.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:2380: The Arabic translation uses 'ينتظر كل تشغيل الموافقة قبل إنشاء أي شيء في Mizano' for 'Each run waits for approval befo

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

## Test Plan: FlowLine_Web - Issue #401 - Localization Review Follow-up

**Objective:** Verify localization changes in `ar.json` based on reviewer feedback.

**1. Mizano - Create Customer (Approval)**
* **Name:** Customer Creation - Approval Consistency
* **Setup:**  Simulate customer creation flow in Arabic.
* **Assertion:** Verify translated text in `ar.json:2371` uses parentheses: "Mizano — إنشاء العميل (يتطلب الموافقة)".
* **File:** `src/i18n/messages/ar.json`

**2. Quote Preparation - Flow**
* **Name:** Quote Flow - Simplified Text
* **Setup:** Navigate to quote preparation flow.
* **Assertion:** Verify translated text in `ar.json:2370` is simplified: "تجهيز بيانات العميل والعرض".
* **File:** `src/i18n/messages/ar.json`

**3. Slack - Quote Ready**
* **Name:** Slack - Quote Status
* **Setup:**  Navigate to the Slack integration flow.
* **Assertion:** Verify translated text in `ar.json:2373` uses "مُنجز": "Slack — عرض السعر مُنجز".
* **File:** `src/i18n/messages/ar.json`

**4. Deal Not Won - Grammatical Flow**
* **Name:** Deal Status - Grammatical Accuracy
* **Setup:**  Simulate a deal that is not won.
* **Assertion:** Verify translated text in `ar.json:2374` uses "لم تُنجز": "الصفقة لم تُنجز".
* **File:** `src/i18n/messages/ar.json`

**5. Channel Connections - Precise Terminology**
* **Name:** Channel Connections - Terminology Consistency
* **Setup:** Navigate to channel connection setup.
* **Assertion:** Verify translated text in `ar.json:2378` uses "اتصالات": "اختر اتصالات Mizano وSlack".
* **File:** `src/i18n/messages/ar.json`

**6. Sales Channel ID - Precise Terminology**
* **Name:** Sales Channel ID - Terminology Consistency
* **Setup:** Navigate to sales channel ID setup.
* **Assertion:** Verify translated text in `ar.json:2379` uses "البيع": "عيّن معرف قناة البيع".
* **File:** `src/i18n/messages/ar.json`

**7. Edge Case - Long String Consistency**
* **Name:** Long String - Consistency Check
* **Setup:**  Inspect the full translated string in `ar.json:2380` (truncated in original issue).
* **Assertion:** Verify all parts of the string maintain consistent terminology and phrasing.
* **File:** `src/i18n/messages/ar.json`

**Test Coverage:** `src/i18n/messages/ar.json`

**Note:** These tests focus on the specific feedback provided. Further localization testing should be conducted to ensure overall quality and consistency.
