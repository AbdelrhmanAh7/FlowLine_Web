# Evidence — Issue #296: fix(mizano): use ctx.addIssue in moneyInput transform to prevent raw Error escape

Tested commit: `f19ca8a29a0090ff913a033d25acbe3e549d4dd3`

All checks and tests were executed locally against commit `f19ca8a29a0090ff913a033d25acbe3e549d4dd3` in the workspace `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-296`.

## Acceptance Criteria and Verification

| Req / AC | Description | Verification Method | Result | Commit |
|---|---|---|---|---|
| **AC1** | `moneyInput.safeParse` of a negative, invalid, or non-primitive value returns `success: false` with a `ZodError` and does not throw. | Unit test `tests/unit/mizano-money-input.test.ts:7-66` covering negative numbers (`-5`), negative decimal strings (`"-5.00"`), invalid strings (`"abc"`, `"12.345"`), `NaN`, `Infinity`, float noise (`0.1 + 0.2`), and non-primitive types (`null`, `undefined`, `true`, `false`, `{}`, `[]`, functions). | 10/10 unit tests pass | `f19ca8a2` |
| **AC2** | `mizano.create_draft_quote` input `safeParse` rejects a negative qty, unitPrice, or taxRate without throwing. | Unit test `tests/unit/mizano-money-input.test.ts:92-140` (covering negative numbers and negative strings for `qty`, `unitPrice`, and `taxRate` individually) and contract tests `tests/contract/mizano.test.ts:404-455` verifying `action.input.safeParse(...)` returns `{ success: false }` without throwing, and `parse` rejects with `ZodError`. | 43/43 contract tests pass, 10/10 unit tests pass | `f19ca8a2` |
| **AC3** | Valid inputs normalise to 2-decimal strings, including Arabic-Indic digits. | Unit test `tests/unit/mizano-money-input.test.ts:80-90, 142-160` verifying numbers (`10`, `10.5`, `0`), decimal strings (`"10"`, `"10.5"`, `"10.50"`, `"0.00"`), and Arabic-Indic digits (`"١٢.٥"`, `"١٠"`, `"١٥.٥٠"`) directly and in `mizano.create_draft_quote` action input schema format to `"10.00"`, `"10.50"`, `"0.00"`, `"12.50"`, `"15.50"`. Also verified in `tests/unit/i18n-content-text.test.ts` (41/41 pass). | 10/10 unit tests pass | `f19ca8a2` |
| **AC4** | Regression test demonstrates the PR #279 bug pattern escaping `safeParse` as an unhandled raw `Error`. | Unit test `tests/unit/mizano-money-input.test.ts:162-196` comparing the flawed `transform((val) => { throw new Error(...) })` pattern against the fixed `ctx.addIssue` implementation. | 10/10 unit tests pass | `f19ca8a2` |

---

## Test Execution Evidence

### 1. Regression Test Failure on Base (`origin/main`)
On base `origin/main`, `moneyInput` is not defined in `src/integrations/providers/mizano.ts`:

```
$ nice -n 10 pnpm vitest run tests/unit/mizano-money-input.test.ts --maxWorkers=2
 FAIL  |unit| tests/unit/mizano-money-input.test.ts > mizano moneyInput zod schema > AC1 & AC2: safeParse on negative numbers returns { success: false } without throwing raw Error
AssertionError: expected [Function] to not throw an error but 'TypeError: Cannot read properties of undefined (reading 'safeParse')' was thrown
...
Test Files  1 failed (1)
     Tests  10 failed (10)
Exit code: 1
```

Furthermore, in test case `AC4`, executing the flawed pattern from PR #279 proves that throwing a plain `Error` escapes `safeParse`:
```typescript
const buggyTransformSchema = z.union([z.number(), z.string()]).transform((val) => {
  const result = toDecimalString(val, 2);
  if (result.startsWith("-")) {
    throw new Error("must be a positive decimal string with up to 2 decimal places");
  }
  return result;
});

// Throws raw Error escaping safeParse boundary:
expect(() => buggyTransformSchema.safeParse(-5)).toThrowError(
  "must be a positive decimal string with up to 2 decimal places"
);
```

### 2. Unit and Contract Tests Passing on Head
```
$ nice -n 10 pnpm vitest run tests/unit/mizano-money-input.test.ts --maxWorkers=2
 ✓ |unit| tests/unit/mizano-money-input.test.ts (10 tests) 10ms
   ✓ mizano moneyInput zod schema (10)
     ✓ AC1 & AC2: safeParse on negative numbers returns { success: false } without throwing raw Error 3ms
     ✓ AC1 & AC2: safeParse on negative decimal strings returns { success: false } without throwing 0ms
     ✓ AC1 & AC2: safeParse on invalid decimal strings and excess precision returns { success: false } without throwing 0ms
     ✓ AC1 & AC2: safeParse on NaN, Infinity, and float precision noise returns { success: false } without throwing 1ms
     ✓ AC1 & AC2: safeParse on non-number, non-string types returns { success: false } without throwing 0ms
     ✓ AC2: parse on negative values throws a ZodError, not a plain Error 0ms
     ✓ AC3: normalizes valid positive numbers and decimal strings to fixed scale 2 0ms
     ✓ AC2: mizano.create_draft_quote action input schema uses moneyInput with safeParse 2ms
     ✓ AC3: mizano.create_draft_quote action input normalizes Arabic-Indic digits across qty, unitPrice, and taxRate 1ms
     ✓ AC4: proves regression where throwing raw Error in transform escapes safeParse (PR #279 bug) 1ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  996ms
Exit code: 0
```

Contract tests:
```
$ npx vitest run tests/contract/mizano.test.ts tests/contract/mizano-http.test.ts tests/contract/mizano-fake.test.ts
 ✓ |contract| tests/contract/mizano-fake.test.ts (8 tests) 75ms
 ✓ |contract| tests/contract/mizano-http.test.ts (3 tests) 92ms
 ✓ |contract| tests/contract/mizano.test.ts (43 tests) 31ms

 Test Files  3 passed (3)
      Tests  54 passed (54)
Exit code: 0
```

### 3. Typecheck and Lint
```
$ pnpm typecheck
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-296
> tsc --noEmit
Exit code: 0

$ pnpm lint
> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-296
> eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0
```

---

## Originating Issue & Sentry
- **Originating review finding:** [PR #279 discussion r4278242714](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/279#discussion_r4278242714)
- **Originating Sentry issue:** None (internal review finding split from PR #279)
- **E2E Waiver:** `E2E: not needed — internal schema validation in mizano.ts; contract and unit tests cover safeParse/parse behavior`
- **Linkage:** Supersedes part of #279. Refs #232.
