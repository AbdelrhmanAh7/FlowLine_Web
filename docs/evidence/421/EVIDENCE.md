# Evidence for Issue #421: Fix Deal won → Mizano quote template and Arabic translation in gallery

Branch: `ai/421`  
Originating Sentry Issue: None / N/A (E2E gate finding and QA review round 1 from split PR #410, parent #409)  
Supersedes part of #410.

## Summary

Issue #421 addresses missing template definition and Arabic translation for the "Deal won → Mizano quote" template in the FlowLine template gallery.
The QA review on round 1 (commit `b465969`) flagged four findings:
1. `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:135`: The test expects a canvas node labeled `'Mizano — Create customer (needs approval)'` which requires the template definition.
2. `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:141`: AC2 asserts Arabic title `'صفقة مكسوبة → عرض سعر Mizano'`, requiring translation in `src/i18n/messages/ar.json` and a unit check for the key.
3. `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:119`: AC1/AC3 tests look up test ID `'template-deal-won-mizano-quote'` and node label `'Mizano — Create customer (needs approval)'`, requiring the template definition.
4. `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:122 & 160`: Playwright `getByRole` called with bare string instead of options object `{ name: 'Use template' }`.

This PR:
1. Adds `deal-won-mizano-quote` to `DESIGN_TEMPLATES` in `src/engine/design-templates.ts` with webhook trigger, deal condition, json transform, Mizano customer creation with approval (`requireApproval: true`), Mizano draft quote creation, Slack notification, and deal-not-won output.
2. Adds `designTemplates.deal-won-mizano-quote` entries in both `src/i18n/messages/en.json` and `src/i18n/messages/ar.json` with matching node labels, setup steps, and requirements.
3. Fixes Playwright `getByRole('button', { name: 'Use template' })` calls in `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`.
4. Adds unit tests in `tests/unit/i18n.test.ts` and `tests/unit/template-actions.test.ts` to guard Arabic key translations and template action registrations.

## Numbered Acceptance Criteria

- **AC1:** In the template gallery (`/w/[slug]/templates`), the card `data-testid="template-deal-won-mizano-quote"` is visible and offers "Deal won → Mizano quote" with a valid accessible button `getByRole('button', { name: 'Use template' })`.
- **AC2:** When the user locale is Arabic (`fl_locale=ar`), the document direction is `rtl`, the template card is rendered with Arabic title `"صفقة مكسوبة → عرض سعر Mizano"`, uses right-pointing arrow (`→`) for RTL consistency, and translations for all nodes exist under `designTemplates.deal-won-mizano-quote` in `src/i18n/messages/ar.json`.
- **AC3:** Clicking "Use template" creates a new flow redirecting to `/w/[slug]/flows/[flowId]`, with flow name `"Deal won → Mizano quote"`, and canvas node labeled `"Mizano — Create customer (needs approval)"` with approval required.
- **AC4:** All integration actions (`mizano.create_customer`, `mizano.create_draft_quote`, `slack.post_message`) resolve cleanly against the provider registry via `missingTemplateActions(graph, registry) === []`.
- **AC5:** Unit and integration tests verify the template definition and i18n keys; regression test fails on base (`origin/main`) where the template and `designTemplates` translations are missing, and passes on head.

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| AC1 | E2E gallery card & accessible button | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` `@issue-421 AC1` | 0 | `getByTestId("template-deal-won-mizano-quote")` and `getByRole("button", { name: "Use template" })` verified |
| AC2 | Arabic localization and RTL consistency | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` `@issue-421 AC2` + `tests/unit/i18n.test.ts` | 0 | `dir="rtl"` asserted; title `"صفقة مكسوبة → عرض سعر Mizano"` without `←`; 19 unit tests passed |
| AC3 | Flow creation with approval step | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` `@issue-421 AC3` | 0 | Flow created with name `"Deal won → Mizano quote"` and node `"Mizano — Create customer (needs approval)"` |
| AC4 | Action dependencies and registry resolution | `pnpm vitest run tests/unit/template-actions.test.ts` | 0 | 7/7 tests passed; `missingTemplateActions` returns `[]`; approval step verified |
| AC5 | i18n content completeness | `pnpm vitest run tests/unit/i18n-content-text.test.ts` | 0 | 44/44 tests passed (covers all `DESIGN_TEMPLATES` and node translations) |
| AC5 (Regression on base) | Demonstrate base fails without template and translations | `git checkout origin/main && pnpm vitest run tests/unit/template-actions.test.ts tests/unit/i18n.test.ts` | 1 | `AssertionError: expected undefined to be defined` (template and ar.json key absent) |
| Static | TypeScript typecheck | `pnpm typecheck` | 0 | `tsc --noEmit` exited 0 with 0 errors |
| Static | ESLint code style and hygiene | `pnpm lint` | 0 | `eslint` passed with 0 errors and 0 warnings |

## Changed Covering Tests

- `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`:
  - `@issue-421 AC1: the gallery offers 'Deal won → Mizano quote' with a Use template button`
  - `@issue-421 AC2: the template is offered in Arabic and the page is right-to-left`
  - `@issue-421 AC3: using 'Deal won → Mizano quote' creates an editable flow with the approval step`
- `tests/unit/template-actions.test.ts`:
  - `deal-won-mizano-quote design template is registered with customer approval and draft quote steps (#421)`
- `tests/unit/i18n.test.ts`:
  - `design template localization consistency (#421) > deal-won-mizano-quote title uses right-pointing arrow (→) and matches expected Arabic translation`
- `tests/unit/i18n-content-text.test.ts`:
  - Automatically covers all templates in `DESIGN_TEMPLATES` for name, node labels, English fallback, and Arabic translation limits.

## Skills Used
- `systematic-debugging`: Identified root cause of missing template definition, missing i18n translation, and Playwright `getByRole` parameter format.
- `tdd`: Added unit tests verifying Arabic translation and template registration in unit test files.
- `verification-before-completion`: Verified with typecheck, lint, vitest unit suite, exit codes, and evidence logs.
