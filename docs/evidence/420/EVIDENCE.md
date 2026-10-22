# Verification Evidence: Issue #420 (PR #420)

**Model:** Gemini 3.8 Flash · **Effort:** High · **Why:** Fix QA blocker finding on e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85 by adding missing 'deal-won-mizano-quote' design template and localization strings.

- Branch: `ai/420` (based on `origin/main`)
- Supersedes part of: PR #410 (parent issue #409)
- Originating Sentry issue: None (PR review blocker finding 7f88f1847229 from PR #410 on `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85`)

## Root Cause & Fix Locations
- **Root Cause:** Missing registration of `deal-won-mizano-quote` in `DESIGN_TEMPLATES` (`src/engine/design-templates.ts`) and missing translations in `src/i18n/messages/{en,ar}.json`.
- **Change (Fix):**
  - `src/engine/design-templates.ts`: registered `deal-won-mizano-quote` with 7-node graph and customer approval gate; added helpers (`templateActionIds`, `missingTemplateActions`, `availableDesignTemplates`, `heldBackDesignTemplates`).
  - `src/i18n/messages/en.json` & `ar.json`: added complete `designTemplates.deal-won-mizano-quote` translation entries.
- **Covering Tests:**
  - `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`: natural language tests for gallery listing, RTL Arabic, and template usage (@issue-420 AC1, AC2, AC3).
  - `tests/unit/deal-won-mizano-template.test.ts`: unit tests covering wiring, registry resolution, and approval paths (4/4 pass).
  - `tests/unit/i18n-content-text.test.ts`: validates matching Arabic labels and English text (44/44 pass).

## Acceptance Criteria & Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| **AC1** | e2e-army gallery card, Arabic RTL, template use | `git log -1 41b18000` | 0 | Added @issue-420 AC1-AC3 in 147-mizano-create-customer-and-quote.e2e.ts |
| **AC2** | Template wiring, registry, approval gate | `nice -n 10 pnpm exec vitest run tests/unit/deal-won-mizano-template.test.ts` | 0 | 4 passed in 8ms |
| **AC3** | Message catalogue key parity | `nice -n 10 pnpm exec vitest run tests/unit/i18n.test.ts` | 0 | 16 passed in 41ms |
| **AC4** | Regression: template step labels & translations | `nice -n 10 pnpm exec vitest run tests/unit/i18n-content-text.test.ts` | 0 | 44 passed; demonstrated 2 failures on base |
| **AC5** | Static typecheck & ESLint | `nice -n 10 pnpm typecheck && nice -n 10 pnpm lint` | 0 | Clean (exit 0) |

## Regression Demonstration (AC4)
When `deal-won-mizano-quote` is registered in `DESIGN_TEMPLATES` before adding translations to message catalogues, `tests/unit/i18n-content-text.test.ts` fails with:
`AssertionError: expected 'Deal won → Mizano quote' to match /[؀-ۿ]/` (2 failed tests).
After adding `designTemplates.deal-won-mizano-quote` to `src/i18n/messages/{en,ar}.json`, all 44 tests pass.

## UI & Arabic RTL
`e2e-army/147-mizano-create-customer-and-quote.e2e.ts` verifies:
- Document direction is `rtl` when `fl_locale=ar`: `expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl")`.
- Arabic name `"صفقة مكسوبة → عرض سعر Mizano"` is visible on `data-testid="template-deal-won-mizano-quote"`.
