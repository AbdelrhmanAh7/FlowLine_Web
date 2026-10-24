# Evidence — Issue #296: fix: mizano.ts: major: Throwing a plain Error inside a zod .transform

Tested commit: `86638098`

All checks and tests were executed locally against commit `86638098` in the workspace `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-296`.

## Acceptance Criteria and Verification

| Req / AC | Description | Verification Method | Result | Commit |
|---|---|---|---|---|
| **AC1** | `moneyInput.safeParse` on negative, invalid, or non-primitive values returns `success: false` with a `ZodError` without throwing raw errors. | Unit test `tests/unit/mizano-money-input.test.ts:7-76` covering negative numbers (`-5`), negative decimal strings (`"-5.00"`), invalid decimal strings (`"abc"`, `"12.345"`), non-finite numbers (`NaN`, `Infinity`), float noise (`0.1 + 0.2`), and non-primitive types (`null`, `undefined`, `true`, `false`, `{}`, `[]`, functions). | 10/10 unit tests pass (exit code 0) | `86638098` |
| **AC2** | `mizano.create_draft_quote` input schema `safeParse` rejects negative `qty`, `unitPrice`, or `taxRate` (both numbers and strings) without throwing; `parse` throws `ZodError`. | Unit test `tests/unit/mizano-money-input.test.ts:78-86, 102-150` and contract tests `tests/contract/mizano.test.ts:415-478` verifying `action.input.safeParse(...)` returns `{ success: false }` with `ZodError` without throwing, and `parse` throws `ZodError`. | 10/10 unit tests pass, 50/50 contract tests pass (exit code 0) | `86638098` |
| **AC3** | Valid inputs normalize to 2-decimal strings, including Arabic-Indic digits (`"١٢.٥"` -> `"12.50"`). | Unit test `tests/unit/mizano-money-input.test.ts:88-100, 152-170` directly and in `mizano.create_draft_quote` action input schema format (`"10.00"`, `"10.50"`, `"0.00"`, `"12.50"`, `"15.50"`). Also verified in `tests/unit/i18n-content-text.test.ts` (41/41 pass). | 10/10 unit tests pass, 41/41 i18n tests pass (exit code 0) | `86638098` |
| **AC4** | Regression test proves that throwing raw `Error` inside `.transform` escapes `safeParse` (PR #279 bug pattern), whereas `ctx.addIssue` + `z.NEVER` keeps errors within `ZodError`. | Unit test `tests/unit/mizano-money-input.test.ts:172-206` comparing the flawed `transform((val) => { throw new Error(...) })` pattern against the fixed `ctx.addIssue` + `return z.NEVER` implementation. | 10/10 unit tests pass (exit code 0) | `86638098` |

---

## Changed Covering Tests
- `tests/unit/mizano-money-input.test.ts`: Dedicated unit tests covering `moneyInput` schema and `mizano.create_draft_quote` action input validation, parsing, normalization of Arabic-Indic digits, and regression comparison (10 tests).
- `tests/contract/mizano.test.ts`: Contract tests verifying `mizano.create_draft_quote` rejects negative `qty`, `unitPrice`, and `taxRate` (both numbers and strings) via `safeParse` returning `{ success: false }` and `ZodError` without throwing (50 tests).
- `tests/contract/mizano-http.test.ts`: Contract tests verifying wire format normalization with fake Mizano API server (3 tests).

---

## Test Execution Evidence

### 1. Regression Test Failure on Base (`origin/main`)
On base `origin/main`, `moneyInput` is not defined in `src/integrations/providers/mizano.ts`:

```
$ pnpm vitest run tests/unit/mizano-money-input.test.ts
 FAIL  |unit| tests/unit/mizano-money-input.test.ts > mizano moneyInput zod schema > AC1: safeParse on negative numbers returns { success: false } without throwing raw Error
AssertionError: expected [Function] to not throw an error but 'TypeError: Cannot read properties of undefined (reading 'safeParse')' was thrown
...
Test Files  1 failed (1)
     Tests  10 failed (10)
Exit code: 1
```

In AC4, reproducing the PR #279 flawed pattern demonstrates that throwing a plain `Error` in `.transform` escapes `safeParse`:
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
Unit tests:
```
$ pnpm vitest run tests/unit/mizano-money-input.test.ts
 ✓ |unit| tests/unit/mizano-money-input.test.ts (10 tests) 5ms
   ✓ mizano moneyInput zod schema (10)
     ✓ AC1: safeParse on negative numbers returns { success: false } without throwing raw Error 1ms
     ✓ AC1: safeParse on negative decimal strings returns { success: false } without throwing 0ms
     ✓ AC1: safeParse on invalid decimal strings and excess precision returns { success: false } without throwing 0ms
     ✓ AC1: safeParse on NaN, Infinity, and float precision noise returns { success: false } without throwing 1ms
     ✓ AC1: safeParse on non-number, non-string types returns { success: false } without throwing 0ms
     ✓ AC2: parse on negative values throws a ZodError, not a plain Error 0ms
     ✓ AC3: normalizes valid positive numbers and decimal strings to fixed scale 2 0ms
     ✓ AC2: mizano.create_draft_quote action input schema uses moneyInput with safeParse 1ms
     ✓ AC3: mizano.create_draft_quote action input normalizes Arabic-Indic digits across qty, unitPrice, and taxRate 0ms
     ✓ AC4: proves regression where throwing raw Error in transform escapes safeParse (PR #279 bug) 0ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  342ms
Exit code: 0
```

Contract tests:
```
$ pnpm vitest run tests/contract/mizano.test.ts tests/contract/mizano-http.test.ts
 ✓ |contract| tests/contract/mizano.test.ts (50 tests) 33ms
 ✓ |contract| tests/contract/mizano-http.test.ts (3 tests) 99ms

 Test Files  2 passed (2)
      Tests  53 passed (53)
   Duration  439ms
Exit code: 0
```

i18n Content Text tests:
```
$ pnpm vitest run tests/unit/i18n-content-text.test.ts
 ✓ |unit| tests/unit/i18n-content-text.test.ts (41 tests) 11ms
 Test Files  1 passed (1)
      Tests  41 passed (41)
   Duration  355ms
Exit code: 0
```

### 3. Typecheck, Lint, and Evidence Secrets
```
$ pnpm typecheck
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-296
> tsc --noEmit
Exit code: 0

$ pnpm lint
> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-296
> eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0

$ pnpm check:evidence
> flowline@0.1.0 check:evidence /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-296
> node scripts/check-evidence-secrets.mjs
check-evidence-secrets: 0 local secret value(s) checked across 176 file(s); 0 hit(s)
Exit code: 0
```

### 4. Arabic Localization and RTL Evidence
Arabic-Indic digits normalization is verified across `qty`, `unitPrice`, and `taxRate` in `tests/unit/mizano-money-input.test.ts:152-170` (`"١٢.٥"` -> `"12.50"`, `"١٠"` -> `"10.00"`, `"١٥.٥٠"` -> `"15.50"`) and in `tests/unit/i18n-content-text.test.ts` (41/41 pass). UI components are exempt as this issue modifies backend Zod schema validation in `mizano.ts`.

---

## Originating Issue & Sentry
- **Originating review finding:** [PR #279 discussion r4278242714](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/279#discussion_r4278242714)
- **Originating Sentry issue:** None (internal review finding split from PR #279 caught during pre-merge code review)
- **E2E Waiver:** `E2E: not needed — internal zod schema transform refactor for Mizano connector input validation; contract and unit tests provide complete coverage of safeParse and parse error behavior.`
- **Linkage:** Supersedes part of #279. Refs #232.
