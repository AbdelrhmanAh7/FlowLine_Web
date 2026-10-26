# Verification Evidence: Issue #421 (PR #440)

**Model:** Gemini 3.8 Flash · **Effort:** Medium · **Why:** Add template registration, localization dictionaries, fix Playwright getByRole format, ensure em-dash on Arabic node labels, and verify with comprehensive unit tests and typecheck.

- Branch: `ai/421` (PR #440 superseding part of #410, parent #409)
- Originating Sentry issue: None / N/A (E2E gate finding and QA review rounds 1 & 2 from split PR #410, parent #409: https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/410#issuecomment-6342555610)
- Supersedes part of #410.

> **ar.json discrepancy note (issue #463):** The issue #463 brief specified the Arabic label as `'صفقة مكسوبة ← عرض سعر Mizano'` (U+2190, leftwards arrow). However, commit cd7bad12 (issue #454, part 1/2) went through multiple iterations and settled on `'صفقة مكسوبة — عرض سعر Mizano'` (U+2014, em-dash) as the canonical value in `src/i18n/messages/ar.json`. Per the spec, ar.json is the source of truth; this document quotes the em-dash value throughout. See also: state/rnd.json.

---

## Problem Summary & Root Cause

In PR #410 (parent #409), E2E test scenarios in `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` asserted the presence of a gallery card with `data-testid="template-deal-won-mizano-quote"`, Arabic template title `"صفقة مكسوبة — عرض سعر Mizano"`, and canvas node labelled `"Mizano — Create customer (needs approval)"`.
However:
1. The template definition in `src/engine/design-templates.ts` was missing, causing `getByTestId("template-deal-won-mizano-quote")` and node retrieval to fail.
2. The `designTemplates.deal-won-mizano-quote` localization dictionary in `src/i18n/messages/{en,ar}.json` was missing, causing Arabic text checks to fail.
3. Playwright `getByRole` calls in the E2E test used bare strings instead of options objects (`{ name: 'Use template' }`).
4. QA Review Round 2 flagged: `src/i18n/messages/ar.json:2371`: Ensure the Arabic translation for the Mizano template consistently uses an em-dash (`—`, U+2014) instead of a regular hyphen (`-`, U+002D) in node labels (`customer`, `quote`, `notify`).

> **Bidi note:** U+2192 (→) is not bidi-mirrored (Unicode property Bidi_Mirrored=No), so in RTL text it still points right, against the reading direction. That is why directional arrows were eliminated from the Arabic template name; the em-dash (`—`, U+2014) is direction-neutral and reads correctly in both LTR and RTL contexts.

> **Brand-name convention:** 'Mizano' and 'Slack' are intentionally kept in Latin script by convention; they are not translated or transliterated into Arabic.

### Root Cause & Fix Locations
- **`src/engine/design-templates.ts`**:
  - Registered `deal-won-mizano-quote` in `DESIGN_TEMPLATES` with manual trigger sample payload, condition `deal.stage = "won"`, transform node formatting 2-decimal numbers, `mizano.create_customer` with `{ requireApproval: true }`, `mizano.create_draft_quote`, `slack.post_message`, and skipped output.
  - Exported availability helpers `templateActionIds`, `missingTemplateActions`, `availableDesignTemplates`, and `heldBackDesignTemplates`.
- **`src/i18n/messages/ar.json` & `src/i18n/messages/en.json`**:
  - Added full `designTemplates.deal-won-mizano-quote` entries in both `en.json` and `ar.json`.
  - In `ar.json:2369`, set `"customer": "Mizano — إنشاء عميل (يحتاج موافقة)"`, `"quote": "Mizano — إنشاء مسودة عرض سعر"`, and `"notify": "Slack — عرض السعر جاهز"`, all using em-dash (`—`, U+2014) and no regular hyphen (`-`, U+002D).
- **`e2e-army/147-mizano-create-customer-and-quote.e2e.ts`**:
  - Fixed `getByRole('button', { name: 'Use template' })` calls to use options object syntax.
- **`tests/unit/i18n.test.ts:203-220`**:
  - Added unit test asserting `designTemplates["deal-won-mizano-quote"]` Arabic title using em-dash (`—`), exact node translation `"Mizano — إنشاء عميل (يحتاج موافقة)"`, and explicit assertions verifying `toContain("—")` and `not.toContain("-")`.
- **`tests/unit/deal-won-mizano-template.test.ts` & `tests/unit/template-actions.test.ts`**:
  - Added unit test suites verifying full graph execution, approval gate pause/reject/approve behavior, and action requirements resolution.

---

## Numbered Acceptance Criteria

- **AC1:** In the template gallery (`/w/[slug]/templates`), the card `data-testid="template-deal-won-mizano-quote"` is visible and offers "Deal won — Mizano quote" with a valid accessible button `getByRole('button', { name: 'Use template' })`.
- **AC2:** When the user locale is Arabic (`fl_locale=ar`), document direction is `rtl`, the template card renders Arabic title `"صفقة مكسوبة — عرض سعر Mizano"` using an em-dash (`—`, U+2014), with translations for all nodes under `designTemplates.deal-won-mizano-quote` in `src/i18n/messages/ar.json`.
- **AC3:** In `src/i18n/messages/ar.json`, the node label for `customer` uses an em-dash (`—`, U+2014) rather than a regular hyphen (`-`, U+002D), matching `"Mizano — إنشاء عميل (يحتاج موافقة)"`, with `quote` and `notify` labels also adhering to this standard (no ASCII hyphen).
- **AC4:** Clicking "Use template" creates a new flow redirecting to `/w/[slug]/flows/[flowId]`, with flow name `"Deal won — Mizano quote"`, and canvas node labeled `"Mizano — Create customer (needs approval)"` with approval required (`requireApproval: true`).
- **AC5:** All integration actions (`mizano.create_customer`, `mizano.create_draft_quote`, `slack.post_message`) resolve cleanly against the provider registry via `missingTemplateActions(graph, registry) === []`.
- **AC6:** Unit and integration tests verify the template definition and i18n keys; regression test demonstrates failure on base where the template and `designTemplates` translations are missing, and passes on head.

---

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| **AC1** | E2E gallery card & accessible button | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` `@issue-421 AC1` | 0 | `getByTestId("template-deal-won-mizano-quote")` and `getByRole("button", { name: "Use template" })` verified |
| **AC2** | Arabic localization and RTL consistency | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` `@issue-421 AC2` + `tests/unit/i18n.test.ts` | 0 | `dir="rtl"` asserted; title `"صفقة مكسوبة — عرض سعر Mizano"` with em-dash; no directional arrow |
| **AC3** | Arabic em-dash vs hyphen in node labels | `pnpm vitest run tests/unit/i18n.test.ts` | 0 | 19/19 passed; verifies `customer`, `quote`, `notify` contain `—` and not `-` |
| **AC4** | Flow creation with approval step | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` `@issue-421 AC3` | 0 | Flow created with name `"Deal won — Mizano quote"` and node `"Mizano — Create customer (needs approval)"` |
| **AC5** | Action dependencies and registry resolution | `pnpm vitest run tests/unit/template-actions.test.ts` | 0 | 7/7 tests passed; `missingTemplateActions` returns `[]`; approval step verified |
| **AC1, AC4, AC5** | Graph wiring, availability filtering, and approval gate execution | `pnpm vitest run tests/unit/deal-won-mizano-template.test.ts` | 0 | 8/8 tests passed in 9ms |
| **AC2, AC6** | Template step labels and names in Arabic and English | `pnpm vitest run tests/unit/i18n-content-text.test.ts` | 0 | 44/44 tests passed (covers all `DESIGN_TEMPLATES` and node translations) |
| **AC6 (Regression on base)** | Demonstrate base fails without template and translations | `pnpm vitest run tests/unit/template-actions.test.ts tests/unit/i18n.test.ts` on base | 1 | Failed with `AssertionError: expected undefined to be defined` (template and ar.json key absent) |
| **Static** | TypeScript typecheck | `pnpm typecheck` | 0 | `tsc --noEmit` clean (exit code 0) |
| **Static** | ESLint code style and hygiene | `pnpm lint` | 0 | `eslint` clean (exit code 0) |

---

## Regression Demonstration (AC6)

When `deal-won-mizano-quote` was registered in `DESIGN_TEMPLATES` in `src/engine/design-templates.ts` before the message catalogues were populated with `designTemplates.deal-won-mizano-quote`, `pnpm vitest run tests/unit/i18n-content-text.test.ts` failed with exit code 1:
```
 FAIL  |unit| tests/unit/i18n-content-text.test.ts > template step labels and names > deal-won-mizano-quote: every step has an Arabic label; English is the template's own text
AssertionError: expected 'Deal won — Mizano quote' to match /[؀-ۿ]/
- Expected: /[؀-ۿ]/
+ Received: "Deal won — Mizano quote"
 ❯ tests/unit/i18n-content-text.test.ts:46:37

 FAIL  |unit| tests/unit/i18n-content-text.test.ts > template step labels and names > Arabic creation translates only the name and step labels, never ids, config or edges
AssertionError: expected 'Deal won — Mizano quote' to match /[؀-ۿ]/
- Expected: /[؀-ۿ]/
+ Received: "Deal won — Mizano quote"
 ❯ tests/unit/i18n-content-text.test.ts:78:25

Test Files  1 failed (1)
     Tests  2 failed | 42 passed (44)
```

Similarly, testing on base where the template and `designTemplates` translations are missing failed `tests/unit/template-actions.test.ts` with `expected undefined to be defined`.

Upon adding `deal-won-mizano-quote` to `DESIGN_TEMPLATES` and `designTemplates.deal-won-mizano-quote` to `src/i18n/messages/{en,ar}.json`, all test suites passed cleanly with exit code 0:
```
 ✓ |unit| tests/unit/i18n-content-text.test.ts (44 tests) 12ms
 ✓ |unit| tests/unit/deal-won-mizano-template.test.ts (8 tests) 9ms
 ✓ |unit| tests/unit/template-actions.test.ts (7 tests) 4ms
 ✓ |unit| tests/unit/i18n.test.ts (19 tests) 61ms
 Test Files  4 passed (4)
      Tests  78 passed (78)
```

---

## Changed Covering Tests

- `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`:
  - `@issue-421 AC1: the gallery offers 'Deal won — Mizano quote' with a Use template button`
  - `@issue-421 AC2: the template is offered in Arabic and the page is right-to-left`
  - `@issue-421 AC3: using 'Deal won — Mizano quote' creates an editable flow with the approval step`
- `tests/unit/deal-won-mizano-template.test.ts`:
  - 8 unit tests covering real provider registry action resolution, availability helpers, missing connections validation, approval requirement on customer step, waiting_approval pause, rejection abort, approved execution with two-decimal numbers, and non-won deal handling.
- `tests/unit/template-actions.test.ts`:
  - `deal-won-mizano-quote design template is registered with customer approval and draft quote steps (#421)`
- `tests/unit/i18n.test.ts`:
  - `design template localization consistency (#421) > deal-won-mizano-quote title uses em-dash (—) and matches expected Arabic translation` (verifying em-dash and no hyphen on `customer`, `quote`, `notify`).
- `tests/unit/i18n-content-text.test.ts`:
  - Covers all templates in `DESIGN_TEMPLATES` for name, node labels, English fallback, and Arabic translation limits (44 tests pass).

---

## Skills Used

- `systematic-debugging`: Identified root cause of missing template definition, missing i18n translation, Playwright `getByRole` parameter format, and em-dash vs hyphen distinction in Arabic translations.
- `tdd`: Added regression unit tests verifying Arabic translation, em-dash character presence, and template registration in unit test files.
- `verification-before-completion`: Verified with typecheck, lint, vitest unit suite, exit codes, and evidence logs.
- `model-effort-routing`: Model and effort stated at the top of this document.
