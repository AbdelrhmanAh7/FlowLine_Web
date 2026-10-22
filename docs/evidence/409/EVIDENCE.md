# Verification Evidence: Issue #409 (PR #410)

**Model:** Gemini 3.8 Flash · **Effort:** High · **Why:** Fix QA blocker finding on e2e-army/147-mizano-create-customer-and-quote.e2e.ts by adding the missing 'deal-won-mizano-quote' design template and localization strings, verify regression on base vs head, and document verification evidence.

- Branch: `ai/409` (based on `origin/main`)
- Supersedes part of: PR #328 (parent issue #326)
- Originating Sentry issue: None (PR review blocker finding from Claude Opus 5.5 on PR #328: https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/328#discussion_r4322732458)

## Problem Summary & Root Cause
In PR #328 (parent #326), E2E tests in `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85-138` asserted the presence of a gallery card with `data-testid="template-deal-won-mizano-quote"`, EN and AR template names, and a canvas node labelled `"Mizano — Create customer (needs approval)"`.
However, only the test was added to `ai/409` in commit `7c2574c`; the template definition in `src/engine/design-templates.ts` and the `designTemplates.deal-won-mizano-quote` localization strings in `src/i18n/messages/{en,ar}.json` were missing from the branch, causing QA review to flag finding `7f88f1847229`.

### Root Cause & Fix Locations
- **Root Cause:** Missing registration of `deal-won-mizano-quote` in `DESIGN_TEMPLATES` (`src/engine/design-templates.ts`) and missing translations under `designTemplates.deal-won-mizano-quote` in `src/i18n/messages/{en,ar}.json`.
- **Change (Fix):**
  - `src/engine/design-templates.ts:248-291` (registered `deal-won-mizano-quote` template with 7-node graph and approval step on customer creation).
  - `src/engine/design-templates.ts:22-48` (`templateActionIds`, `missingTemplateActions`, `availableDesignTemplates`, `heldBackDesignTemplates` helpers).
  - `src/i18n/messages/en.json:2280-2301` (`designTemplates.deal-won-mizano-quote` English strings).
  - `src/i18n/messages/ar.json:2362-2383` (`designTemplates.deal-won-mizano-quote` Arabic strings).
- **Covering Tests:**
  - `tests/unit/deal-won-mizano-template.test.ts:1-140` (8 unit tests covering wiring, availability filtering, and approval gate execution).
  - `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85-138` (3 natural language tests covering gallery card listing, Arabic RTL rendering, and flow creation).
  - `tests/unit/i18n-content-text.test.ts:43-60` (validates all design templates have matching Arabic step labels and exact English source text).

## Acceptance Criteria

| AC | Description | Verification Method |
|---|---|---|
| **AC1** | Template definition registered in `src/engine/design-templates.ts` with `deal-won-mizano-quote`, category `"Sales"`, goal `"sales"`, required integrations `mizano` and `slack`, and the 7-node flow graph with approval on customer creation. | `tests/unit/deal-won-mizano-template.test.ts` (8 passed) |
| **AC2** | Localization keys `designTemplates.deal-won-mizano-quote` exist in `src/i18n/messages/en.json` and `src/i18n/messages/ar.json` with matching names, descriptions, node step labels, requires, and setup steps. | `tests/unit/i18n.test.ts` (16 passed) & `tests/unit/i18n-content-text.test.ts` (43 passed) |
| **AC3** | Natural-language e2e-army tests in `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` cover gallery listing, RTL/Arabic representation, and template usage with approval node. | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` (@issue-409 AC1, AC2, AC3) |
| **AC4** | Regression test: demonstrates that without the Arabic/English translation keys, `tests/unit/i18n-content-text.test.ts` fails on base and passes on head. | Observed: 2 failures on base, 0 failures on head (43 passed) |
| **AC5** | Small reviewable diff (~300 changed lines), clean lint, clean typecheck, docs updated in `docs/evidence/409/EVIDENCE.md` and `docs/implementation/PHASE4_BETA_REPORT.md`. | `pnpm typecheck` (exit 0), `pnpm lint` (exit 0) |

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| **AC1** | Template graph wiring, availability filtering, and approval gate execution | `nice -n 10 pnpm exec vitest run tests/unit/deal-won-mizano-template.test.ts` | 0 | 8 passed (0 failed) in 16ms |
| **AC2, AC4** | Template step labels and names in Arabic and English | `nice -n 10 pnpm exec vitest run tests/unit/i18n-content-text.test.ts` | 0 | 43 passed (0 failed) in 42ms |
| **AC2** | English and Arabic message catalogue key parity | `nice -n 10 pnpm exec vitest run tests/unit/i18n.test.ts` | 0 | 16 passed (0 failed) in 125ms |
| **AC1, AC2** | Local template catalogue regression parity | `nice -n 10 pnpm exec vitest run tests/unit/local-scenarios.test.ts` | 0 | 85 passed (0 failed) in 107ms |
| **AC3** | e2e-army test file hygiene and max 8 file cap | `nice -n 10 pnpm exec vitest run tests/unit/e2e-army-tooling.test.ts` | 0 | 12 passed (0 failed) |
| **AC5** | Static TypeScript typecheck | `pnpm typecheck` | 0 | `tsc --noEmit` clean (exit 0) |
| **AC5** | ESLint code style and hygiene | `pnpm lint` | 0 | `eslint` clean (exit 0) |

## Regression Demonstration (AC4)
When `deal-won-mizano-quote` is added to `DESIGN_TEMPLATES` in `src/engine/design-templates.ts` before the message catalogues are populated, `tests/unit/i18n-content-text.test.ts` demonstrates immediate failure:
```
 FAIL  |unit| tests/unit/i18n-content-text.test.ts > template step labels and names > deal-won-mizano-quote: every step has an Arabic label; English is the template's own text
AssertionError: expected 'Deal won → Mizano quote' to match /[؀-ۿ]/
- Expected: /[؀-ۿ]/
+ Received: "Deal won → Mizano quote"
 ❯ tests/unit/i18n-content-text.test.ts:46:37

 FAIL  |unit| tests/unit/i18n-content-text.test.ts > template step labels and names > Arabic creation translates only the name and step labels, never ids, config or edges
AssertionError: expected 'Deal won → Mizano quote' to match /[؀-ۿ]/
- Expected: /[؀-ۿ]/
+ Received: "Deal won → Mizano quote"
 ❯ tests/unit/i18n-content-text.test.ts:78:25

Test Files  1 failed (1)
     Tests  2 failed | 41 passed (43)
```

Upon adding `designTemplates.deal-won-mizano-quote` to both `src/i18n/messages/en.json` and `src/i18n/messages/ar.json`:
```
 ✓ |unit| tests/unit/i18n-content-text.test.ts (43 tests) 42ms
 Test Files  1 passed (1)
      Tests  43 passed (43)
```

## UI & Arabic RTL
- Natural language e2e-army test in `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:103-119` asserts:
  - Document direction is `rtl` when `fl_locale=ar` cookie is present: `expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl")`.
  - Arabic name `"صفقة مكسوبة → عرض سعر Mizano"` is visible on `data-testid="template-deal-won-mizano-quote"`.
- Full Playwright E2E suite runs on GitHub-hosted CI fast/full tier per repo rules.

## Changed Covering Tests
- `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:85-138` (added `@issue-409 AC1`, `@issue-409 AC2`, `@issue-409 AC3`)
- `tests/unit/deal-won-mizano-template.test.ts:1-140` (new unit test suite: 8 tests covering wiring, availability, and approval gate)
- `tests/unit/i18n-content-text.test.ts` (exercised with `deal-won-mizano-quote` template)
- `tests/unit/i18n.test.ts` (exercised for EN/AR catalogue parity)
