# Evidence for Issue #454: Proper RTL Arrow in Arabic Template Name

Supersedes part of [#445](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/445) (finding `9c8bf91e0489`, parent issue #421).
Addresses Review Findings on PR #455:
- `Finding 08bddb2f551f` (QA Reviewer on `b89ea6c`):
  `src/i18n/messages/ar.json:364: Changed Arabic text 'صفقة مكسوبة → عرض سعر Mizano' to 'صفقة مكسوبة ← عرض سعر Mizano' to use proper RTL arrow (←) instead of right-pointing arrow (→) which is inappropriate for RTL layout.`
- Parent Finding `9c8bf91e0489` (PR #445 comment 6358144681):
  `src/i18n/messages/ar.json:2370: Arabic text 'صفقة مكسوبة → عرض سعر Mizano' uses a right-pointing arrow (→) U+2192 which is not appropriate for RTL layout. Should use a proper RTL arrow or dash.`

## Originating Issues & Context
- PR: [#455](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/455)
- Issue: #454 (split from #445)
- Parent Issue: #421
- Originating Sentry issue: None (Localization QA & Review Board findings)
- Review finding: [PR #445 comment](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/445#issuecomment-6358144681) & [PR #455 comment](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/455#issuecomment-6374391401)

## Root Cause Analysis
- **Root Cause:** In PR #340 (commit `3fecec3c`), `localTemplates.deal-won-mizano-quote.name` was changed from `صفقة مكسوبة ← عرض سعر Mizano` to `صفقة مكسوبة → عرض سعر Mizano` under the misconception that `→` was RTL. However, Arabic is an RTL (right-to-left) language where text flow progresses from right to left. An arrow indicating flow from step 1 (on the right: `صفقة مكسوبة`) to step 2 (on the left: `عرض سعر Mizano`) must point leftwards (`←`, U+2190). A right-pointing arrow (`→`, U+2192) points backwards towards the starting step in RTL layout.
- **Review Finding on PR #445 / PR #455:** CodeRabbit and the review board flagged: `The Arabic text 'صفقة مكسوبة → عرض سعر Mizano' uses a right-pointing arrow (→) which is not appropriate for RTL layout. Should use a proper RTL arrow or dash.`
- **Fix:**
  - In `src/i18n/messages/ar.json` (line 364), set `localTemplates.deal-won-mizano-quote.name` to `"صفقة مكسوبة ← عرض سعر Mizano"` using the canonical leftwards arrow (`←`, U+2190).
  - In `src/i18n/messages/ar.json` (line 365), set the parenthetical arrow in `description` to `(الصفقة فازت ← عرض ميزانو)`.
  - In `src/i18n/messages/ar.json` (lines 369-373), verified all template node labels consistently use em-dash (`—`, U+2014) instead of regular hyphen (`-`).
  - In `tests/unit/i18n-content-text.test.ts`, verified exact equality to `"صفقة مكسوبة ← عرض سعر Mizano"`, presence of `←`, and absence of `→`.
  - In `tests/unit/i18n.test.ts`, implemented suite `template localization consistency and RTL typography (findings 08bddb2f551f, 9c8bf91e0489, #340, #454)` to verify the leftwards arrow `←` for `deal-won-mizano-quote`, ensure node label em-dash consistency, and guard all template titles against misplaced rightwards arrows (`→`) in Arabic.

## Acceptance Criteria

| AC | Requirement | Implementation & Verification |
|---|---|---|
| **AC1** | In `src/i18n/messages/ar.json`, `localTemplates.deal-won-mizano-quote.name` uses the proper RTL arrow (`←`, U+2190) instead of right-pointing arrow (`→`, U+2192), reading exactly `"صفقة مكسوبة ← عرض سعر Mizano"` | `src/i18n/messages/ar.json:364`: updated `name` to `"صفقة مكسوبة ← عرض سعر Mizano"` |
| **AC2** | In `src/i18n/messages/ar.json`, `localTemplates.deal-won-mizano-quote.name` and all other local template titles do not contain right-pointing arrows (`→`) | Verified by unit tests in `tests/unit/i18n.test.ts` and `tests/unit/i18n-content-text.test.ts` |
| **AC3** | In `src/i18n/messages/ar.json`, `localTemplates.deal-won-mizano-quote.description` has the inline parenthetical arrow updated from `→` to `←`, reading `(الصفقة فازت ← عرض ميزانو)` | `src/i18n/messages/ar.json:365`: updated description with proper RTL arrow `←` |
| **AC4** | In `src/i18n/messages/ar.json`, `localTemplates.deal-won-mizano-quote.nodes` consistently use em-dash (`—`, U+2014) and no regular hyphen (`-`) | `src/i18n/messages/ar.json:369-373`: verified em-dash in customer, quote, and notify node labels |
| **AC5** | Automated regression test in `tests/unit/i18n-content-text.test.ts` and `tests/unit/i18n.test.ts` demonstrates failure on base branch before fix and passes on head | Demonstrated failure on base state (`rc=1`, 3 failed tests) and pass on head state (`rc=0`, 67 passed tests) |
| **AC6** | Unit test suite in `tests/unit/i18n.test.ts` under `template localization consistency and RTL typography (findings 08bddb2f551f, 9c8bf91e0489, #340, #454)` asserts the RTL arrow `←` for `deal-won-mizano-quote`, verifies node em-dashes, and guards all Arabic template titles against misplaced right-pointing arrows (`→`) | Added comprehensive suite in `tests/unit/i18n.test.ts` |
| **AC7** | Valid UTF-8 encoding without BOM, valid JSON formatting, key parity maintained between `ar.json` and `en.json`, and pre-push quality checks (`pnpm typecheck`, `pnpm lint`, `vitest`) pass with exit code 0 | `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), `vitest` (exit 0) |

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| AC5 (Regression on base) | Demonstrate regression failure on base branch before fix | `nice -n 10 pnpm exec vitest run tests/unit/i18n.test.ts tests/unit/i18n-content-text.test.ts --maxWorkers=2` (against base ar.json) | 1 | `3 failed \| 64 passed (67)`:<br>• `FAIL tests/unit/i18n-content-text.test.ts`: `expected 'صفقة مكسوبة → عرض سعر Mizano' to be 'صفقة مكسوبة ← عرض سعر Mizano'`<br>• `FAIL tests/unit/i18n.test.ts`: `deal-won-mizano-quote title uses left-pointing arrow (←) for RTL layout consistency (#454)`<br>• `FAIL tests/unit/i18n.test.ts`: `no local template titles contain misplaced right-pointing arrows (→) in Arabic (#454)` |
| AC1, AC2, AC3, AC4, AC6 (Head verification) | Verify `deal-won-mizano-quote` RTL arrow `←`, absence of `→`, node em-dashes, and template localization consistency | `nice -n 10 pnpm exec vitest run tests/unit/i18n.test.ts tests/unit/i18n-content-text.test.ts --maxWorkers=2` | 0 | `✓ 67 passed (67)` across 2 test files in 1.35s (exit 0) |
| AC7 (Key Parity) | Verify exact parity between English and Arabic message catalogues | `nice -n 10 pnpm exec vitest run tests/unit/i18n.test.ts -t "i18n catalogues"` | 0 | `✓ 4 passed (4)` in 43ms (exit 0) |
| AC7 (Types) | Full TypeScript compilation check | `pnpm typecheck` | 0 | `tsc --noEmit` clean, exit code 0 |
| AC7 (Lint) | ESLint check across repository | `pnpm lint` | 0 | `eslint .` clean, exit code 0 |

## UI & Playwright Screenshot Note
- UI Screenshot: Not applicable (UI exempt). `deal-won-mizano-quote` is an i18n translation catalog entry pending engine registration in #149 and is currently excluded from runtime template rendering (`tests/unit/local-scenarios.test.ts:203`). No UI screen displays this entry yet. Full RTL arrow consistency is verified via automated behavior assertions in `tests/unit/i18n.test.ts` and `tests/unit/i18n-content-text.test.ts`.

## Changed Covering Tests
- `tests/unit/i18n-content-text.test.ts`:
  - Updated `deal-won-mizano-quote localTemplate entry matches the expected English text and structure (#242, #340, #454)`: asserts exact Arabic title equality to `"صفقة مكسوبة ← عرض سعر Mizano"`, presence of `←`, absence of `→`, and Arabic script match.
- `tests/unit/i18n.test.ts`:
  - Extended suite `template localization consistency and RTL typography (findings 08bddb2f551f, 9c8bf91e0489, #340, #454)`:
    1. `src/i18n/messages/ar.json:364: deal-won-mizano-quote title uses left-pointing arrow (←, \u2190) and strictly no right-pointing arrow (→, \u2192) for RTL layout consistency (findings 08bddb2f551f, 9c8bf91e0489, #454)`
    2. `src/i18n/messages/ar.json:365: deal-won-mizano-quote description uses left-pointing arrow (←) in RTL parenthetical and strictly no right-pointing arrow (→) (#454)`
    3. `src/i18n/messages/ar.json:369-373: deal-won-mizano-quote nodes consistently use em-dash (—) and strictly no regular hyphen (-) in Arabic labels (#454)`
    4. `no local template titles contain misplaced right-pointing arrows (→) in Arabic (#454)`

## E2E Gate Note
`E2E: not needed — static i18n translation catalog update for pending local template (id: deal-won-mizano-quote, part of #149); not rendered in user-facing UI flows until engine registration in #149.`

## Skills Used
- `systematic-debugging`: Identified root cause in PR #340 where LTR arrow `→` was mistakenly applied to Arabic RTL title, analyzed RTL directional reading flow where progression from right to left requires leftwards arrow `←` (U+2190).
- `tdd`: Wrote regression assertions first, demonstrated 3 test failures on base branch with exit code 1, implemented fix, and verified 67/67 passed with exit code 0.
- `rtl-arabic-qa`: Applied Arabic typography standards and bidi arrow mirroring principles for RTL layouts.
- `verification-before-completion`: Executed all verification checks (`typecheck`, `lint`, `vitest`), recorded observed exit codes and stdout.
- `model-effort-routing`: Gemini 3.8 Flash · Medium · RTL localization fix, test coverage, and verification evidence.
