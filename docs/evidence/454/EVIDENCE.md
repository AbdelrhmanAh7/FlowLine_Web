# Evidence for Issue #454: Fix Arabic RTL Template Name Typography

## Issue Summary
The Arabic template name `localTemplates.deal-won-mizano-quote.name` in `src/i18n/messages/ar.json:364` used a left-pointing arrow (`←`, U+2190) which was a symptom patch. The root cause was using directional arrows at all — both `→` (English) and `←` (Arabic) have inherent directionality that causes RTL/LTR confusion. Node labels consistently use neutral em-dash (`—`, U+2014) in both languages.

## Root Cause
- **English**: `"Deal won → Mizano quote"` (right-pointing arrow)
- **Arabic (base)**: `"صفقة مكسوبة ← عرض سعر Mizano"` (left-pointing arrow — symptom patch)
- **Node labels (both languages)**: Use em-dash `—` consistently (e.g., `"Mizano — Create customer (needs approval)"`, `"Mizano — إنشاء عميل (يحتاج موافقة)"`)

The proper fix is to use em-dash (`—`) in **both** languages for the template name, matching the node label convention and avoiding directional arrow confusion in RTL layout.

## Changes Made

### Files Modified
1. **`src/i18n/messages/en.json:360`**
   - Before: `"Deal won → Mizano quote"`
   - After: `"Deal won — Mizano quote"`

2. **`src/i18n/messages/ar.json:364`**
   - Before: `"صفقة مكسوبة ← عرض سعر Mizano"`
   - After: `"صفقة مكسوبة — عرض سعر Mizano"`

3. **`src/i18n/messages/ar.json:365`** (description parenthetical)
   - Before: `"عند كسب صفقة (الصفقة فازت ← عرض ميزانو)…"`
   - After: `"عند كسب صفقة (الصفقة فازت — عرض ميزانو)…"`

4. **`tests/unit/i18n-content-text.test.ts:100-103`** — Updated assertions to expect em-dash
5. **`tests/unit/i18n.test.ts:185-202`** — Updated test suite to assert em-dash and reject both `→` and `←`

## Acceptance Criteria & Verification

| AC | Criterion | Verification | Result |
|----|-----------|--------------|--------|
| AC1 | English template name uses em-dash (`—`) instead of `→` | `tests/unit/i18n-content-text.test.ts:100` | ✅ PASS |
| AC2 | Arabic template name uses em-dash (`—`) instead of `←` | `tests/unit/i18n.test.ts:189`, `tests/unit/i18n-content-text.test.ts:101` | ✅ PASS |
| AC3 | Arabic description parenthetical uses em-dash (`—`) | `tests/unit/i18n.test.ts:200` | ✅ PASS |
| AC4 | No directional arrows (`→` or `←`) in template name | `tests/unit/i18n.test.ts:191-192`, `tests/unit/i18n-content-text.test.ts:102-103` | ✅ PASS |
| AC5 | Node labels continue to use em-dash consistently | Existing test `tests/unit/i18n.test.ts:204-216` | ✅ PASS |
| AC6 | Regression test fails on base (arrows), passes on head (em-dash) | Demonstrated below | ✅ PASS |
| AC7 | All pre-push quality checks pass (typecheck, lint, unit tests) | `pnpm typecheck`, `pnpm lint`, `vitest` | ✅ PASS |

## Regression Test Demonstration

### Base State (commit `7ac5076d` — with arrows)
```bash
# Temporarily revert JSON to base values (with ←/→ arrows)
# Run updated tests (expecting em-dash)
```
**Result: 3 tests FAIL**
- `deal-won-mizano-quote localTemplate entry matches expected English text`: Expected `"Deal won — Mizano quote"`, received `"Deal won → Mizano quote"`
- `deal-won-mizano-quote title uses em-dash`: Expected `"صفقة مكسوبة — عرض سعر Mizano"`, received `"صفقة مكسوبة ← عرض سعر Mizano"`
- `deal-won-mizano-quote description uses em-dash`: Expected parenthetical `(الصفقة فازت — عرض ميزانو)`, received `(الصفقة فازت ← عرض ميزانو)`

### Head State (commit `222a7f90` — with em-dash fix)
```bash
# Restore fixed JSON (with em-dash)
# Run tests
```
**Result: 70 tests PASS** (all i18n tests)

### Commands Run
```bash
# Regression on base
cp /tmp/ar_base.json src/i18n/messages/ar.json
cp /tmp/en_base.json src/i18n/messages/en.json
pnpm exec vitest run tests/unit/i18n.test.ts tests/unit/i18n-content-text.test.ts --maxWorkers=2
# Exit code: 1 (3 failed)

# Verification on head
cp /tmp/ar_fixed.json src/i18n/messages/ar.json
cp /tmp/en_fixed.json src/i18n/messages/en.json
pnpm exec vitest run tests/unit/i18n.test.ts tests/unit/i18n-content-text.test.ts --maxWorkers=2
# Exit code: 0 (70 passed)
```

## E2E Gate
**Not needed** — Static i18n translation catalog update for pending local template (`deal-won-mizano-quote`, part of #149); not rendered in user-facing UI flows until engine registration in #149. Excluded from runtime template rendering (`tests/unit/local-scenarios.test.ts:203`).

## PR Description Note
"Supersedes part of #445" — as required by issue scope.

## Commit
- **SHA**: `222a7f90`
- **Branch**: `ai/454`
- **Message**: `fix(i18n): use em-dash (—) in deal-won-mizano-quote template name for RTL consistency`