# Issue #242 — EN + AR gallery strings for 'Deal won → Mizano quote' local template

Branch `ai/242`, part of #149.
Originating Sentry issue: None (delegated subtask from tech lead of #149).

## Summary
Add `localTemplates.deal-won-mizano-quote` to both `src/i18n/messages/en.json` and `src/i18n/messages/ar.json` adjacent to `lead-qualifier`, matching its structural shape (`name`, `description`, `sample`, `result`, `nodes`) with exact English strings and corresponding Arabic translations.

## Acceptance Criteria
- **AC1:** The entry `localTemplates.deal-won-mizano-quote` exists in both `src/i18n/messages/en.json` and `src/i18n/messages/ar.json`, adjacent to `localTemplates.lead-qualifier`.
- **AC2:** The English name for `localTemplates.deal-won-mizano-quote` exactly matches `"Deal won → Mizano quote"`.
- **AC3:** The entry has the same structure as the existing `lead-qualifier` entry (`name`, `description`, `sample`, `result`, and `nodes` with keys `deal`, `won`, `prepare`, `customer`, `quote`, `notify`, `skipped`), and Arabic translation contains valid Arabic text.
- **AC4:** Unit test in `tests/unit/i18n-content-text.test.ts` verifies `localTemplates.deal-won-mizano-quote` name and structure; test fails on base and passes on head. `tests/unit/i18n.test.ts` passes with full key parity between English and Arabic.
- **AC5:** The change diff across code and catalogs does not exceed 100 lines, and core parent logic is untouched.

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| AC1, AC2, AC3 | Template entry in EN and AR catalogs with exact text and matching node structure | `nice -n 10 pnpm exec vitest run tests/unit/i18n-content-text.test.ts --maxWorkers=2` | 0 | 42 passed (1 new test case) |
| AC4 (Regression on base) | Demonstrate test fails before catalogs are updated | `nice -n 10 pnpm exec vitest run tests/unit/i18n-content-text.test.ts --maxWorkers=2` (against base) | 1 | `FAIL: expected 'localTemplates.deal-won-mizano-quote.name' to be 'Deal won → Mizano quote'` |
| AC4 (Catalogue parity) | English and Arabic key parity and validation | `nice -n 10 pnpm exec vitest run tests/unit/i18n.test.ts --maxWorkers=2` | 0 | 16 passed |
| AC5 | Line count constraint (<= 100 lines) | `git diff --stat origin/main..HEAD` | 0 | 43 lines changed across 3 code/test files |
| Static | TypeScript typecheck | `pnpm typecheck` | 0 | `tsc --noEmit` clean |
| Static | ESLint on changed test file | `pnpm exec eslint tests/unit/i18n-content-text.test.ts` | 0 | clean (0 errors) |

## Changed covering tests
- `tests/unit/i18n-content-text.test.ts`: Added test case `deal-won-mizano-quote localTemplate entry matches the expected English text and structure (#242)` checking exact English name match, Arabic script presence, and matching node keys.

## E2E Gate Note
`E2E: not needed — i18n message catalog addition with no user-facing flow changed` (pure message catalog strings and unit test assertion; template workflow is part of parent issue #149 / #244).

## Skills Used
- `test-first engineering` (demonstrated failure on base before catalog addition)
- `verification-before-completion` (verified with commands, real exit codes and observed outputs)
