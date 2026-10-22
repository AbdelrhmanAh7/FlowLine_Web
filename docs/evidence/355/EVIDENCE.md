# Evidence — Issue #355: fix: qa finding: AC2 verified: moneyInput.safeParse correctly rejects negative qty, un… (split from #309)

**Model:** Gemini 3.8 Flash · **Effort:** High · **Why:** Verify and rescue issue #355 / PR #360, proving moneyInput.safeParse correctly rejects negative values without throwing, with full test and evidence coverage.

## Overview & Scope
- **Issue**: #355 (`fix: qa finding: AC2 verified: moneyInput.safeParse correctly rejects negative qty, un… (split from #309)`)
- **Parent Issues**: #309 (reached fix-round cap), #296 (`fix: mizano.ts: major: Throwing a plain Error inside a zod .transform`)
- **Supersedes**: part of PR #309
- **Branch**: `ai/355` (clean branch merged with `origin/main` at `a5e267c2`)
- **Tested Commit SHA**: `7e9898e629fa4ed4805b5330bacbf080ecabeb70`
- **Originating Sentry Issue**: None (internal provider schema validation issue originating in PR #279 / issue #296 / PR #309)
- **User-Facing UI**: No (internal provider schema validation and error-handling fix; exempt from E2E UI tests — `E2E: not needed — internal provider input schema validation and error-handling fix (unit and contract tests cover safeParse/parse and negative money input handling; no user-facing UI flow changed)`)

## Acceptance Criteria & Verification Matrix

| ID | Description | Verification Method | Observed Result | Exit Code |
|---|---|---|---|---|
| **AC1** | `moneyInput.safeParse` on negative numbers, negative decimal strings, invalid strings, non-finite numbers, and non-primitive values returns `{ success: false, error: ZodError }` without throwing raw errors escaping `safeParse`. | `pnpm vitest run tests/unit/mizano-money-input.test.ts` (tests 1-5) | 5/5 sub-cases pass; `error` is `ZodError` with informative messages | 0 |
| **AC2** | `mizano.create_draft_quote` action input schema uses `moneyInput` for `qty`, `unitPrice`, and `taxRate`. `safeParse` rejects negative values (both numbers and strings) without throwing, returning `{ success: false, error: ZodError }`, and `parse` throws `ZodError`. | Unit test `tests/unit/mizano-money-input.test.ts` (tests 6 & 8) and contract tests `tests/contract/mizano.test.ts` (tests 412-475) | 10/10 unit tests pass, 50/50 contract tests pass | 0 |
| **AC3** | Valid inputs normalize to 2-decimal strings, including numbers, decimal strings, and Arabic-Indic digits (e.g. `"١٢.٥"` -> `"12.50"`). | Unit test `tests/unit/mizano-money-input.test.ts` (tests 7 & 9) directly and in `mizano.create_draft_quote` action input | Both direct parsing and action input normalize to 2-decimal strings | 0 |
| **AC4** | Regression test proves that throwing a raw `Error` inside `.transform` escapes `safeParse` as an unhandled exception (the PR #279 bug pattern), whereas `ctx.addIssue` + `z.NEVER` keeps validation errors within `ZodError`. | Unit test `tests/unit/mizano-money-input.test.ts` (test 10) reproducing buggy transform vs fixed `moneyInput` | Regression demonstrates raw `Error` throw on buggy pattern and clean `ZodError` handling on `moneyInput` | 0 |

---

## Changed Covering Tests
- `tests/unit/mizano-money-input.test.ts` (new): 10 dedicated unit tests covering:
  - `AC1`: Negative numbers (`-5`), negative decimal strings (`"-5.00"`), invalid strings (`"abc"`, `"12.345"`), non-finite numbers (`NaN`, `Infinity`, `0.1 + 0.2`), and non-primitive types (`null`, `undefined`, boolean, object, array, function).
  - `AC2`: Negative value rejection in `moneyInput.parse` throwing `ZodError`, and `mizano.create_draft_quote` action input schema safeParse rejection without throwing.
  - `AC3`: Positive number, string, and Arabic-Indic digit string normalization (`10` -> `"10.00"`, `"١٢.٥"` -> `"12.50"`).
  - `AC4`: Regression test demonstrating unhandled error escape with raw `throw new Error` inside `.transform` vs clean `ZodError` handling with `ctx.addIssue`.
- `tests/contract/mizano.test.ts` (modified): Updated `mizano.create_draft_quote` test cases:
  - Wire payload expectation updated to 2-decimal string normalization (`"10.00"`, `"1.00"`).
  - Negative `qty`, `unitPrice`, and `taxRate` contract tests updated to test both numbers and strings with assertions that `action.input.safeParse` does not throw and returns `{ success: false, error: ZodError }`.
- `tests/contract/mizano-http.test.ts` (modified): Updated wire payload assertion for quote line `qty: "10.00"` against the fake Mizano HTTP API.

---

## Test Execution Evidence

### 1. Regression Test Failure on Base (`origin/main`)
On base `origin/main` (`116935affd3c23aaebf586337df0f4084a13dac7`), `moneyInput` was not exported in `src/integrations/providers/mizano.ts`, `mizano.create_draft_quote` did not accept numeric or Arabic-Indic inputs, and throwing raw `Error` in transform escaped `safeParse`:

```bash
nice -n 10 pnpm vitest run tests/unit/mizano-money-input.test.ts --maxWorkers=2
```
Output:
```
 ❯ |unit| tests/unit/mizano-money-input.test.ts (10 tests | 10 failed) 178ms
   ❯ mizano moneyInput zod schema (10)
     × AC1: safeParse on negative numbers returns { success: false } without throwing raw Error 8ms
     × AC1: safeParse on negative decimal strings returns { success: false } without throwing 1ms
     × AC1: safeParse on invalid decimal strings and excess precision returns { success: false } without throwing 0ms
     × AC1: safeParse on NaN, Infinity, and float precision noise returns { success: false } without throwing 0ms
     × AC1: safeParse on non-number, non-string types returns { success: false } without throwing 0ms
     × AC2: parse on negative values throws a ZodError, not a plain Error 2ms
     × AC3: normalizes valid positive numbers and decimal strings to fixed scale 2 0ms
     × AC2: mizano.create_draft_quote action input schema uses moneyInput with safeParse 5ms
     × AC3: mizano.create_draft_quote action input normalizes Arabic-Indic digits across qty, unitPrice, and taxRate 0ms
     × AC4: proves regression where throwing raw Error in transform escapes safeParse (PR #279 bug) 159ms

 Test Files  1 failed (1)
      Tests  10 failed (10)
```
Exit code: 1

### 2. Unit and Contract Tests Passing on Head
```bash
nice -n 10 pnpm vitest run tests/contract/mizano.test.ts tests/contract/mizano-http.test.ts tests/unit/mizano-money-input.test.ts --maxWorkers=2
```
Output:
```
 ✓ |contract| tests/contract/mizano.test.ts (50 tests) 30ms
 ✓ |contract| tests/contract/mizano-http.test.ts (3 tests) 62ms
 ✓ |unit| tests/unit/mizano-money-input.test.ts (10 tests) 5ms

 Test Files  3 passed (3)
      Tests  63 passed (63)
```
Exit code: 0

### 3. Typecheck
```bash
nice -n 10 pnpm typecheck
```
Output:
```
> flowline@0.1.0 typecheck
> tsc --noEmit
```
Exit code: 0

### 4. Linter
```bash
nice -n 10 pnpm lint
```
Output:
```
> flowline@0.1.0 lint
> eslint . --cache --cache-location node_modules/.cache/eslint/
```
Exit code: 0

### 5. Evidence Secrets Check
```bash
nice -n 10 pnpm check:evidence
```
Output:
```
check-evidence-secrets: 0 local secret value(s) checked across 176 file(s); 0 hit(s)
```
Exit code: 0
