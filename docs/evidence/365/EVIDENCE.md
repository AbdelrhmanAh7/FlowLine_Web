# Evidence for Issue #365: fix: qa finding: Arabic translation for mizano.create_customer (split from #325)

## Originating Issues & Context
- Split from PR: [#325](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/325)
- Parent Issue: #302
- Supersedes part of PR #325
- Sentry Issue: N/A (i18n translation accuracy QA finding, not an exception runtime bug)

## Acceptance Criteria

| AC | Requirement | Implementation & Verification |
|---|---|---|
| **AC1** | The Arabic description for `mizano.create_customer` in `src/i18n/messages/ar.json` explicitly includes customer name (`الاسم`) alongside company (`الشركة`), email (`البريد الإلكتروني`), phone (`رقم الهاتف`), and optional tax ID (`معرف الضريبة الاختياري`), correcting "باسم الشركة" | `src/i18n/messages/ar.json:1345`: `"ينشئ عميلاً جديدًا في Mizano بالاسم والشركة والبريد الإلكتروني ورقم الهاتف ومعرف الضريبة الاختياري."` |
| **AC2** | The Arabic description for `mizano.list_overdue_invoices` in `src/i18n/messages/ar.json` has a terminating period to match English and other action descriptions | `src/i18n/messages/ar.json:1341`: `"يعرض الفواتير غير المسددة التي تجاوزت تاريخ استحقاقها في التاريخ الذي تختاره، بعملة مساحة العمل."` |
| **AC3** | Unit test verifies `mizano.create_customer` and `mizano.list_overdue_invoices` Arabic descriptions meet AC1 and AC2 | `tests/unit/i18n-content-text.test.ts`: test `"the Mizano provider description and action descriptions are properly localized in Arabic (#365)"` |
| **AC4** | Regression demonstration: test fails on base before fix and passes on head | On base: `FAIL |unit| tests/unit/i18n-content-text.test.ts > the Mizano provider description and action descriptions are properly localized in Arabic (#365)` with `AssertionError: expected '...باسم الشركة...' to contain 'الاسم'` (exit code 1). On head: PASS (exit code 0) |
| **AC5** | E2E test covers Arabic RTL layout and Mizano action titles with proper locale teardown | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`: test `@issue-365 AC1` with tags `feat:fl-integrations`, `feat:fl-integration-actions`, `feat:fl-i18n-rtl` including clean `fl_locale=en` teardown |
| **AC6** | Documentation updated in `docs/implementation/PROGRESS.md` and `docs/integrations/SUPPORTED-ACTIONS.md` | `docs/implementation/PROGRESS.md` ledger and `docs/integrations/SUPPORTED-ACTIONS.md` reflect changes |
| **AC7** | Pre-push checks (`pnpm typecheck`, `pnpm lint`, unit tests) pass cleanly | Verified locally with exit code 0 |

## Verification Report

| Test / Command | AC Covered | Result | Exit Code |
|---|---|---|---|
| `pnpm exec vitest run --project unit tests/unit/i18n-content-text.test.ts` (against base) | AC4 (regression) | `FAIL: expected '...باسم الشركة...' to contain 'الاسم'` (1 failed, 42 passed) | 1 |
| `pnpm exec vitest run --project unit tests/unit/i18n-content-text.test.ts` (on head) | AC1, AC2, AC3, AC4 | `PASS: 43 passed (0 failed)` | 0 |
| `pnpm exec vitest run --project unit tests/unit/i18n.test.ts` | AC1, AC2 (key parity) | `PASS: 16 passed (0 failed)` | 0 |
| `pnpm typecheck` | AC7 | `PASS: tsc --noEmit clean` | 0 |
| `pnpm lint` | AC7 | `PASS: eslint clean` | 0 |

## Changed Covering Tests
- `tests/unit/i18n-content-text.test.ts`: Added test `"the Mizano provider description and action descriptions are properly localized in Arabic (#365)"` asserting exact Arabic translations for Mizano provider description, `create_customer` (containing customer name "الاسم" and all required fields), and `list_overdue_invoices` (terminating period).
- `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`: Added scenario `@issue-365 AC1: Mizano integration in Arabic shows localized provider and action details with RTL layout and clean locale teardown` with tags `feat:fl-integrations`, `feat:fl-integration-actions`, `feat:fl-i18n-rtl` and cleanup in a `finally` block restoring `fl_locale=en`.
