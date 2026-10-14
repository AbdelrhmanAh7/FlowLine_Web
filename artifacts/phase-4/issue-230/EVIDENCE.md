# Issue #230 — Implement `toDecimalString` helper function

Part 2/4 of #146. This branch completes the `toDecimalString` helper implementation in `src/lib/format.ts` and resolves all round-1 QA findings.

## Changes

| File | Change |
|---|---|
| `src/lib/format.ts` | Unified canonical implementation of `toDecimalString(value, scale = 2)` (lines 53–98) without literal Arabic-Indic digits to preserve the Latin digits product rule. |
| `tests/unit/lib-format.test.ts` | Resolved merge conflict with `origin/main`; added explicit tests for `-3.1` / `"-3.1"` formatting to prove no double dot. |
| `docs/DEVELOPER_GUIDE.md` | Documented `toDecimalString` helper contract and error behavior. |
| `docs/implementation/PROGRESS.md` | Recorded progress entry for #230 / PR #249. |

## QA Round-1 Findings & Root-Cause Resolutions

1. **Fractional part leading dot stripping (`be77440c53a9`)**:
   - **Symptom**: `toDecimalString("12.5")` produced `"12..5"` and `toDecimalString(-3.1)` returned `"-3..1"`.
   - **Root cause**: Regex included leading `.` in fractional capture group.
   - **Fix**: Separated fractional digits from decimal point via `/^([+-]?)(\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/` in `src/lib/format.ts:67`, ensuring `m[3]` contains only digits. Formatted output via `return scale === 0 ? `${sign}${integer}` : `${sign}${integer}.${fraction}`;` in `src/lib/format.ts:97`.
   - **Test evidence**: `tests/unit/lib-format.test.ts:200-204` proves `toDecimalString(-3.1)` and `toDecimalString("-3.1")` return `"-3.10"`.

2. **Zero fraction formatting with scale > 0 (`84ba92e54d38`)**:
   - **Symptom**: `toDecimalString(0)` gave `"0"` instead of `"0.00"`, `toDecimalString(1e21)` gave integer with no decimals.
   - **Root cause**: Trimming returned bare integer part when padded fraction was all zeros.
   - **Fix**: Always emit `${sign}${integer}.${fraction}` when `scale > 0` (`src/lib/format.ts:97`).
   - **Test evidence**: `tests/unit/lib-format.test.ts:130-132, 438, 497-500`.

3. **Empty strings and bare signs (`9a798112132a`)**:
   - **Symptom**: `toDecimalString("")` returned `"0"` and `toDecimalString("-")` returned `"-"`.
   - **Root cause**: Regex matched empty string and bare sign without requiring digits.
   - **Fix**: Added validation `if (!m || (m[2] === "" && m[3] === undefined)) throw new Error(...)` (`src/lib/format.ts:68-70`).
   - **Test evidence**: `tests/unit/lib-format.test.ts:332-338`.

4. **Negative zero normalisation (`72-75`)**:
   - **Symptom**: `toDecimalString("-0")` returned `"-0"`.
   - **Root cause**: Lookahead failed to strip sign on negative zero.
   - **Fix**: `const isZero = /^0*$/.test(integer + fraction); const sign = m[1] === "-" && !isZero ? "-" : "";` (`src/lib/format.ts:95-96`).
   - **Test evidence**: `tests/unit/lib-format.test.ts:210-215, 489-494`.

## Local Verification Commands & Output

```
$ nice -n 10 pnpm exec vitest run --project unit tests/unit/lib-format.test.ts tests/unit/latin-digits.test.ts
 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-230

 ✓ |unit| tests/unit/lib-format.test.ts (105 tests)
 ✓ |unit| tests/unit/latin-digits.test.ts (3 tests)

 Test Files  2 passed (2)
      Tests  108 passed (108)

$ pnpm typecheck
> tsc --noEmit
# exit 0, clean

$ pnpm exec eslint src/lib/format.ts tests/unit/lib-format.test.ts tests/unit/latin-digits.test.ts
# exit 0, clean
```
