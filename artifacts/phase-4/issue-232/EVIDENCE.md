# Issue #232: Integrate money helper with Mizano connector — Verification Evidence

Part 4/4 of #146 (FL G5 · Mizano connector v1).

## Summary

Integrates `toDecimalString` with the Mizano connector (`mizano.create_draft_quote`) to ensure numbers and decimal strings passed to money/quantity fields (`qty`, `unitPrice`, `taxRate`) are validated and formatted to exact 2-decimal strings in request bodies (e.g., `12.5` → `"12.50"`). Validation guarantees zero silent rounding, converts all invalid inputs into clean zod validation issues without throwing raw exceptions, and handles large numbers without float-drift false rejections.

**HEAD SHA verified: `7dd6d50a`** (Mizano quote: validate number inputs via canonical string check)  
**Branch:** `ai/232` → PR #279  
**Evidence last refreshed:** 2026-10-19T19:31:26+03:00

## Acceptance Criteria & Verification Mapping

| AC | Requirement | Covering Test(s) & Location | Command & Result |
|---|---|---|---|
| **AC1** | Numbers and decimal strings format to fixed 2-decimal strings: Passing `12.5` formats to `"12.50"`; integer strings like `"10"` format to `"10.00"`; pre-formatted strings (`"12.50"`, `"5.00"`) are preserved. | `tests/contract/mizano.test.ts:456-469`<br>`e2e-army/232-mizano-decimal-string.e2e.ts:40-54` | `pnpm exec vitest run tests/contract/mizano.test.ts` → **62 tests PASS (exit code 0)** |
| **AC2** | Zero silent rounding: Over-precise numbers and strings (e.g. `"1.005"`, `0.001`, `0.004`, `10.505`, `0.1 + 0.2`) are rejected with `ZodError` (`code: 'custom'`, message `'must be a non-negative decimal with up to 2 decimal places'`), and no HTTP request is made. | `tests/contract/mizano.test.ts:494-521`<br>`e2e-army/232-mizano-decimal-string.e2e.ts:56-64` | Same run — "rejects %j as a validation error without rounding or calling Mizano" covers all 13 rejection cases |
| **AC3** | Malformed and negative input rejection: Negative values (`-5`, `"-5"`, `"-100.00"`), exponent forms (`"1e3"`, `1e21`, `1e-7`), non-numeric strings (`"abc"`, `" 5 "`, `""`), `NaN`, and `Infinity` are rejected as validation errors; no raw exceptions escape zod transforms. | `tests/contract/mizano.test.ts:405-454, 494-521` | Same run — "rejects invalid input (invalid qty - negative)" + it.each rejection tests |
| **AC4** | Large numeric bounds & float precision handling: Large legitimate amounts up to `MAX_SAFE_INTEGER / 100` (e.g., `1234567.89` → `"1234567.89"`, `99999999.99` → `"99999999.99"`, `0.07` → `"0.07"`, `0` → `"0.00"`) are accepted and correctly formatted without false rejections from float error. | `tests/contract/mizano.test.ts:471-492` | Same run — "normalizes number %j to exact string %j for qty, unitPrice and taxRate" |
| **AC5** | E2E-army path testing: `e2e-army/232-mizano-decimal-string.e2e.ts` tests actions through `action.input.safeParse` before `action.run`, asserting request payload matches fixed 2-decimal format and malformed amounts (`"1.005"`) make 0 requests. | `e2e-army/232-mizano-decimal-string.e2e.ts:1-65` | TypeScript type check passes (exit code 0) |
| **AC6** | Documentation sync: `docs/integrations/SUPPORTED-ACTIONS.md` updated to document `mizano.create_draft_quote` input normalization behavior, and action description verified by contract test. | `docs/integrations/SUPPORTED-ACTIONS.md:129`<br>`tests/contract/mizano.test.ts:313` | docs-check passes (exit code 0); contract test passes |

## Verification Commands and Evidence (session 2026-10-19T20:24+03:00)

### 1. Contract Tests (`tests/contract/mizano.test.ts`)
```
$ pnpm exec vitest run tests/contract/mizano.test.ts
 RUN  v5.0.2

 ✓ |contract| tests/contract/mizano.test.ts (62 tests) 95ms

 Test Files  1 passed (1)
      Tests  62 passed (62)
```
Exit code: **0**. Run at 2026-10-19T20:24:14+03:00.

Key tests from this run:
- ✓ normalizes qty to a 2-decimal string whether it arrives as '10', 10 or 12.5
- ✓ normalizes number 1234567.89 to exact string "1234567.89" for qty, unitPrice and taxRate
- ✓ normalizes number 99999999.99 to exact string "99999999.99" for qty, unitPrice and taxRate
- ✓ normalizes number 0.07 to exact string "0.07" for qty, unitPrice and taxRate
- ✓ normalizes number 0 to exact string "0.00" for qty, unitPrice and taxRate
- ✓ rejects "1.005" as a validation error without rounding or calling Mizano
- ✓ rejects 0.30000000000000004 (0.1+0.2) as a validation error without rounding or calling Mizano
- ✓ rejects 1e-7 as a validation error without rounding or calling Mizano
- ✓ rejects 1e+21 as a validation error without rounding or calling Mizano
- ✓ rejects a negative number for qty, unitPrice and taxRate
- ✓ rejects invalid input (invalid qty - negative string "-5")
- ✓ rejects invalid input (invalid unitPrice - negative string "-100.00")
- ✓ rejects invalid input (invalid taxRate - negative string "-5.00")
- ✓ mizano create steps against a stateful fake that dedupes on Idempotency-Key (1)
- ✓ mizano create steps error handling (4)

### 2. TypeScript Type Check (HEAD sha=7dd6d50a)
```
$ pnpm typecheck
> flowline@0.1.0 typecheck
> tsc --noEmit
```
Exit code: **0** (clean). Run at 2026-10-19T19:31:30+03:00.

### 3. ESLint Check
```
$ pnpm lint
> flowline@0.1.0 lint
> eslint . --cache --cache-location node_modules/.cache/eslint/
```
Exit code: **0** (clean).

### 4. Evidence Secrets Check
```
$ pnpm check:evidence
> flowline@0.1.0 check:evidence
> node scripts/check-evidence-secrets.mjs
check-evidence-secrets: 0 local secret value(s) checked across 174 file(s); 0 hit(s)
```
Exit code: **0**.

## Regression Demonstration (Bug Fix: Float Epsilon → Canonical String)

The second CTO rework (`7dd6d50a`) fixed a correctness bug in `moneyInput` for large valid amounts:

**Root cause (before fix):** `Math.abs(val*100 - Math.round(val*100)) < 1e-9` — the float error grows proportionally to the magnitude (~1.5e-8 at 1.2e8), so valid amounts like `1234567.89` were wrongly rejected with a validation error.

**Fix (after):** `STRING_MONEY.test(String(val))` — JavaScript's `String()` gives the shortest round-trip representation (base 10, no exponents for values in normal range), which correctly:
- **Accepts** `1234567.89` → `String(1234567.89)` = `"1234567.89"` → matches `/^\d+(\.\d{1,2})?$/` ✓
- **Rejects** `0.1+0.2` → `String(0.30000000000000004)` = `"0.30000000000000004"` → does not match regex ✓
- **Rejects** `1e21` → `String(1e21)` = `"1e+21"` → does not match regex ✓
- **Rejects** `1e-7` → `String(1e-7)` = `"1e-7"` → does not match regex ✓

**Regression test on HEAD `7dd6d50a` (AC4):**
```
✓ normalizes number 1234567.89 to exact string "1234567.89" for qty, unitPrice and taxRate  PASS
✓ normalizes number 99999999.99 to exact string "99999999.99" for qty, unitPrice and taxRate  PASS
✓ rejects 0.30000000000000004 (0.1+0.2) as a validation error  PASS
✓ rejects 1e-7 as a validation error  PASS
```

All 62 tests pass. No pre-existing failures on `main` are affected by this change.
