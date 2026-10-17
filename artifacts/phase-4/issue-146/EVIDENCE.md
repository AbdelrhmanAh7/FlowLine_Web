# Issue #146: Money helper — convert flow numbers to Mizano decimal strings

Part of #144 (FlowLine G5 · Mizano connector v1).

## Summary

Adds `toDecimalString(value, scale = 2)` in `src/server/money.ts` (re-exporting the canonical implementation in `src/lib/format.ts` to avoid code duplication across client and server modules) to convert flow numbers and numeric strings to fixed-scale decimal strings for Mizano request bodies. It operates purely on string and digit representations, performing zero float arithmetic or rounding. Inputs with more decimals than the specified scale (including float precision drift like `0.1 + 0.2`), invalid characters (Extended Arabic-Indic digits U+06F0–U+06F9, Arabic decimal separator U+066B, grouping separators like `,` and `١٬٠٠٠`), NaN, Infinity, and empty strings are rejected. Arabic-Indic digits (U+0660–U+0669) are normalised to ASCII 0–9.

## Acceptance Criteria & Verification Mapping

| AC | Requirement | Covering Test(s) & Location | Command & Result |
|---|---|---|---|
| **AC1** | Float-drift rejection: `toDecimalString(0.1 + 0.2)` throws an error with excess decimal places message; no float rounding to `"0.30"` occurs. | `tests/unit/money.test.ts:16-19`<br>`tests/unit/lib-format.test.ts:251-253, 497-498` | `pnpm exec vitest run --project unit tests/unit/money.test.ts tests/unit/lib-format.test.ts -t "0.1 + 0.2"` → **PASS (exit code 0)** |
| **AC2** | Number and string inputs format to exact fixed scale: `toDecimalString('12.50')` and `toDecimalString(12.5)` return `"12.50"`; `toDecimalString(12)` returns `"12.00"`. | `tests/unit/money.test.ts:5-10`<br>`tests/unit/lib-format.test.ts:103-108, 434-436` | `pnpm exec vitest run --project unit tests/unit/money.test.ts -t "formats decimal strings"` → **PASS (exit code 0)** |
| **AC3** | Scientific notation exact expansion: `toDecimalString(1e21)` returns `"1000000000000000000000.00"` without `e`/`+` notation and without precision loss. | `tests/unit/money.test.ts:12-14`<br>`tests/unit/lib-format.test.ts:111-112, 502-506` | `pnpm exec vitest run --project unit tests/unit/money.test.ts -t "1e21"` → **PASS (exit code 0)** |
| **AC4** | Negatives and zero normalization: `toDecimalString(-12.5)` returns `"-12.50"`; `toDecimalString('-0.00')` and `toDecimalString(-0)` return `"0.00"` (negative zero collapses). | `tests/unit/money.test.ts:21-26`<br>`tests/unit/lib-format.test.ts:193-210, 484-486` | `pnpm exec vitest run --project unit tests/unit/money.test.ts -t "negative"` → **PASS (exit code 0)** |
| **AC5** | Digit and separator validation: Arabic-Indic digits (U+0660–U+0669) normalise to ASCII 0–9 (`"١٢.٥"` → `"12.50"`). Extended Arabic-Indic (Persian/Urdu) digits (U+06F0–U+06F9), Arabic decimal separator (U+066B), grouping commas (`"1,000"`), Arabic thousands separator U+066C (`"١٬٠٠٠"`), `NaN`, `Infinity`, and empty strings are rejected. | `tests/unit/money.test.ts:28-44`<br>`tests/unit/lib-format.test.ts:219-249, 513-535` | `pnpm exec vitest run --project unit tests/unit/money.test.ts tests/unit/lib-format.test.ts -t "Arabic-Indic|grouping"` → **PASS (exit code 0)** |
| **AC6** | Scale parameter handling: `toDecimalString('12.5', 0)` throws; `toDecimalString('12', 0)` returns `"12"`; `toDecimalString('12.5', 4)` returns `"12.5000"`. Invalid scales (< 0, > 20, non-integer) throw. | `tests/unit/money.test.ts:46-59`<br>`tests/unit/lib-format.test.ts:123-146, 395-433, 442-446` | `pnpm exec vitest run --project unit tests/unit/money.test.ts -t "scale"` → **PASS (exit code 0)** |
| **AC7** | No float arithmetic / pure string-digit based representation. | `src/server/money.ts:22-24`<br>`src/lib/format.ts:53-98` | Verified by code inspection and test suite (all assertions test exact digit strings without float roundoff). |

## Verification Commands and Evidence

### 1. Unit Tests
```
$ pnpm exec vitest run --project unit tests/unit/lib-format.test.ts tests/unit/latin-digits.test.ts tests/unit/money.test.ts
 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-146

 ✓ |unit| tests/unit/latin-digits.test.ts (3 tests)
 ✓ |unit| tests/unit/lib-format.test.ts (105 tests)
 ✓ |unit| tests/unit/money.test.ts (9 tests)

 Test Files  3 passed (3)
      Tests  117 passed (117)
```
Exit code: 0.

### 2. TypeScript Type Check
```
$ pnpm typecheck
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-146
> tsc --noEmit
```
Exit code: 0 (clean).

### 3. ESLint Check
```
$ pnpm lint
> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-146
> eslint . --cache --cache-location node_modules/.cache/eslint/
```
Exit code: 0 (clean).

### 4. Product Guard (Latin Digits Everywhere)
```
$ pnpm exec vitest run --project unit tests/unit/latin-digits.test.ts
 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-146

 ✓ |unit| tests/unit/latin-digits.test.ts (3 tests)
```
Exit code: 0 (no unescaped non-Latin digits in `src/`).

## E2E Gate Note
Internal money formatting utility for server and connector modules; no user-facing UI route or flow changed. Exempt under `E2E: not needed — internal money-format helper`.
