# Evidence for Issue #364: fix: qa finding: i18n content tests for Mizano integration catalog

## Acceptance Criteria

| AC | Description | Verification |
|----|-------------|--------------|
| AC1 | The E2E test verifies that the Mizano integration catalog shows Arabic text for action titles when the UI language is Arabic | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` - test "@issue-364 AC1" with tags `feat:fl-integrations`, `feat:fl-integration-actions`, `feat:fl-i18n-rtl` |
| AC2 | The E2E test verifies RTL layout (`dir="rtl"`) on the integrations page when language is Arabic | Same test - asserts `document.documentElement.dir === "rtl"` |
| AC3 | The E2E test verifies that English text still works when the UI language is English (regression check) | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` - test "@issue-364 AC2" with tags `feat:fl-integrations`, `feat:fl-integration-actions`, `feat:fl-i18n-rtl` |

## Changes Made

### 1. E2E Test Extension (`e2e-army/147-mizano-create-customer-and-quote.e2e.ts`)

Added two new tests to the existing E2E test file:

- **Test "@issue-364 AC1"**: Sets `fl_locale=ar` cookie, verifies RTL layout, navigates to integrations page, opens Mizano integration, and asserts Arabic action titles:
  - "إنشاء عميل" (Create customer)
  - "إنشاء عرض أسعار مسودة" (Create draft quote)
  - "عرض الفواتير المتأخرة" (List overdue invoices)
  - Category: "أدوات المحاسبة" (Finance)
  - Description: "موصل المحاسبة Mizano" (Mizano accounting connector)

- **Test "@issue-364 AC2"**: Sets `fl_locale=en` cookie, verifies LTR layout, navigates to integrations page, opens Mizano integration, and asserts English action titles (regression check):
  - "Create customer"
  - "Create draft quote"
  - "List overdue invoices"
  - Category: "Finance"
  - Description: "Mizano accounting connector"

Both tests tagged with `feat:fl-integrations`, `feat:fl-integration-actions`, `feat:fl-i18n-rtl` per the hub's feature map.

### 2. Unit Tests (Pre-existing, Verified Passing)

The unit tests in `tests/unit/i18n-content-text.test.ts` already cover the Mizano integration Arabic translations:
- Integration catalog text tests verify Arabic translations for all providers including Mizano
- Tests pass: 42 tests in `i18n-content-text.test.ts`

## Verification Commands

```bash
# Unit tests (all pass)
pnpm vitest run --project unit tests/unit/i18n-content-text.test.ts
# Result: 42 tests passed

# Typecheck (passes)
pnpm typecheck

# Lint (passes)
pnpm lint
```

## E2E Test Execution

The e2e-army tests require the full test stack (PostgreSQL, Next.js app, worker, fake providers) which runs in CI. Local execution requires:
1. `.env.test` with test database credentials
2. PostgreSQL 17 on port 5433 with `flowline_test` database
3. `pnpm e2e:army -- --tag feat:fl-integrations`

CI will run these tests on the `e2e-army` gate (tester-army/e2e).

## Related Files

- `src/i18n/messages/ar.json` - Arabic translations for Mizano (lines 1336-1360)
- `src/i18n/messages/en.json` - English translations for Mizano (lines 1288-1312)
- `src/integrations/providers/mizano.ts` - Mizano provider definition
- `src/i18n/integration-text.ts` - Translation functions for integration catalog
- `src/app/w/[slug]/integrations/page.tsx` - Integrations catalog page (uses translation functions)

## Commit

- `0096e83b` - test(e2e): add Arabic/RTL verification for Mizano integration catalog (issue #364)

## Supersedes

Part of PR #325 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/325#issuecomment-6280447733)