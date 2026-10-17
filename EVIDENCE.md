# Evidence — Issue #226: chore(code-quality): resolve CodeRabbit review backlog (2026-10-12)

Tested commit: `0d7c1459fdfc38db8c7090e25840356f25f986ed`

All checks and tests were executed locally against commit `0d7c1459fdfc38db8c7090e25840356f25f986ed` in the repo workspace `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-226`.

## Acceptance Criteria and Verification

| Req / AC | Description | Verification Method | Result | Commit |
|---|---|---|---|---|
| AC1 | `scoreNoPromise` in `tests/helpers/field-scoring.ts` ignores empty or whitespace-only strings in `approvedInformation` before splitting or matching; blank entries do not cause refund promises to pass scoring. | Regression test in `tests/unit/flowline-field-scoring.test.ts:28-29` (`expect(scoreNoPromise("We will refund you today.", "we will refund", [""])).toBe(false)`). Tested on base (FAILED with `AssertionError: expected true to be false`) and on head (PASSED). | 8/8 unit tests pass (`tests/unit/flowline-field-scoring.test.ts`) | `0d7c1459` |
| AC2 | In `src/ai/hub/protocols/shared.ts:22`, `badToolArgs` uses conditional language ("may have been billed") rather than asserting unverified billing ("was still billed"). | Inspected source code JSDoc and verified via unit test `tests/unit/ai-hub-shared-protocols.test.ts:9-17` checking `possibleCharge: true`. | 13/13 unit tests pass (`tests/unit/ai-hub-shared-protocols.test.ts`) | `0d7c1459` |
| AC3 | Complete JSDoc contracts for exports in `src/ai/hub/protocols/shared.ts` (`num`, `badToolArgs`, `parseArgs`, `structuredOutputMode`, `validateRequest`, `scrubProviderMessage`, `createSseParser`, `streamJson`, `errorTokens`, `mapProviderError`, `mapInBandError`, `safetyRefusal`, `scrubHubError`, `parseBody`, `errorBody`, `pathModel`). `parseArgs` documents parameter/return semantics and thrown `HubError` (`AI_BAD_RESPONSE`); `mapInBandError` documents input/return semantics and possible mapped codes. | Dedicated unit test suite `tests/unit/ai-hub-shared-protocols.test.ts` covering `parseArgs` (valid objects, JSON strings, empty strings, invalid JSON error, non-object JSON error) and `mapInBandError` (overloaded, 4xx/5xx codes, fallback 502, non-object bodies). | 13/13 unit tests pass (`tests/unit/ai-hub-shared-protocols.test.ts`) | `0d7c1459` |
| AC4 | `docs/ai/ADDING_A_PROVIDER.md` accurately describes helper JSDoc contracts in `src/ai/hub/protocols/shared.ts`. | Docs checked and verified against implementation in `shared.ts`. CI docs check verified via `node scripts/ci/docs-check.mjs` and `tests/unit/docs-check-script.test.ts`. | 95/95 docs-check tests pass | `0d7c1459` |
| AC5 | `docs/engineering/lock-order.md` accurately scopes the password reset recovery lock sequence and documents both #45 (user-first) and #41 commit `66cc2799` (`delete session` before `account` write), citing `tests/unit/password-reset-lock-order.test.ts`. | Inspected `docs/engineering/lock-order.md:33-38` and verified with `tests/unit/password-reset-lock-order.test.ts`. | 6/6 unit tests pass (`tests/unit/password-reset-lock-order.test.ts`) | `0d7c1459` |

## Test Execution Evidence

### 1. Regression Test Failure on Base (before fix)
```
$ pnpm vitest run tests/unit/flowline-field-scoring.test.ts
 FAIL  |unit| tests/unit/flowline-field-scoring.test.ts > flowline-field scoring gaps (#141) > :117 approved policy text is not a cancellation promise
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ tests/unit/flowline-field-scoring.test.ts:28:81
     27|     // Finding 3 (issue #226): an empty approvedInformation entry alon…
     28|     expect(scoreNoPromise("We will refund you today.", "we will refund…
       |                                                                                 ^
```

### 2. Unit Tests Passing on Head
```
$ pnpm vitest run tests/unit/flowline-field-scoring.test.ts tests/unit/ai-hub-shared-protocols.test.ts tests/unit/password-reset-lock-order.test.ts
 ✓ |unit| tests/unit/flowline-field-scoring.test.ts (8 tests) 17ms
 ✓ |unit| tests/unit/ai-hub-shared-protocols.test.ts (13 tests) 3ms
 ✓ |unit| tests/unit/password-reset-lock-order.test.ts (6 tests) 4ms

 Test Files  3 passed (3)
      Tests  27 passed (27)
   Duration  406ms
```

### 3. Typecheck and Lint
```
$ pnpm typecheck && pnpm lint
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-226
> tsc --noEmit

> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-226
> eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0
```

### 4. Docs Check
```
$ pnpm vitest run tests/unit/docs-check-script.test.ts tests/unit/docs-index.test.ts
 Test Files  2 passed (2)
      Tests  99 passed (99)
   Duration  4.42s
```
