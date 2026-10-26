# Evidence — Issue #217: Type-check e2e-army/ now that e2e and @e2e-dev/web are devDependencies (part of #85)

Tested commit: `8b4479ba`
Branch: `ai/217`

All checks and tests were executed locally in the workspace `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-217`.

## Acceptance Criteria and Verification

| Req / AC | Description | Verification Method | Result | Exit Code |
|---|---|---|---|---|
| **AC1** | `tsconfig.json` `exclude` array contains no `"e2e-army"` entry while preserving standard excludes (`node_modules`, `.next-test`, `artifacts`, `playwright-report`, `test-results`, `tools/demo-video`). | Unit test `tests/unit/tsconfig-e2e-army-include.test.ts` and inspect `tsconfig.json`. | Passed | 0 |
| **AC2** | `pnpm typecheck` (`tsc --noEmit`) covers `e2e-army/**/*.ts` files and passes with zero errors without requiring runtime changes. | Run `pnpm typecheck`. Confirmed negative control: introducing intentional type error into `e2e-army/lib.ts` causes `tsc --noEmit` to fail with TS2322. (Fixed e2e matcher type mismatches in 147, 166, 200). | Passed (0 errors) | 0 |
| **AC3** | `pnpm lint e2e-army tsconfig.json` passes without errors. | Run `pnpm lint e2e-army tsconfig.json`. | Passed (0 errors, 1 warning for ignored tsconfig.json) | 0 |
| **AC4** | `docs/DEVELOPER_GUIDE.md` line 65 replaces the stale exclusion sentence with one stating `e2e` (0.18.0) and `@e2e-dev/web` are devDependencies and `e2e-army/` is type-checked by `pnpm typecheck`, with no remaining `"excludes e2e-army"` substring. | Unit test `tests/unit/tsconfig-e2e-army-include.test.ts` and `node ./scripts/ci/docs-check.mjs`. | Passed | 0 |
| **AC5** | Unit test `tests/unit/tsconfig-e2e-army-include.test.ts` passes under `pnpm test` and fails if `"e2e-army"` is re-added to `tsconfig.json`'s `exclude` list. Existing test `tests/unit/docs-check-script.test.ts` continues to pass. | Run `pnpm test tests/unit/tsconfig-e2e-army-include.test.ts tests/unit/docs-check-script.test.ts` and verify negative control. | 98/98 tests passed | 0 |

---

## Test Execution Evidence

### 1. Regression / Negative Control Verification (TDD Red-Green)

#### A. Negative Control on `tsconfig.json` Exclude List
When `e2e-army` is present in `tsconfig.json` `exclude`:
```
$ nice -n 10 pnpm exec vitest run --project unit tests/unit/tsconfig-e2e-army-include.test.ts
 FAIL  |unit| tests/unit/tsconfig-e2e-army-include.test.ts > tsconfig e2e-army inclusion and documentation > does not exclude e2e-army from tsconfig.json while preserving other excludes
AssertionError: expected [ 'node_modules', 'e2e-army', …(5) ] to not include 'e2e-army'
 ❯ tests/unit/tsconfig-e2e-army-include.test.ts:12:29
     10|     const excludeList = content.exclude ?? [];
     11|
     12|     expect(excludeList).not.toContain("e2e-army");
       |                             ^
     13|     expect(excludeList).toContain("node_modules");
     14|     expect(excludeList).toContain(".next-test");

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
Exit code: 1
```

With `e2e-army` removed from `tsconfig.json` `exclude`:
```
$ nice -n 10 pnpm exec vitest run --project unit tests/unit/tsconfig-e2e-army-include.test.ts
 ✓ |unit| tests/unit/tsconfig-e2e-army-include.test.ts (3 tests) 2ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
Exit code: 0
```

#### B. Negative Control on TypeScript Checking of `e2e-army/`
When an intentional type error (`const testTypeError: number = "string";`) is introduced in `e2e-army/lib.ts`:
```
$ pnpm typecheck
e2e-army/lib.ts(13,7): error TS2322: Type 'string' is not assignable to type 'number'.
 ELIFECYCLE  Command failed with exit code 2.
```
With valid code:
```
$ pnpm typecheck
> flowline@0.1.0 typecheck
> tsc --noEmit
Exit code: 0
```

### 2. Full Focused Test Runs

#### A. Unit Tests
```
$ nice -n 10 pnpm test tests/unit/tsconfig-e2e-army-include.test.ts tests/unit/docs-check-script.test.ts
 ✓ |unit| tests/unit/tsconfig-e2e-army-include.test.ts (3 tests) 2ms
 ✓ |unit| tests/unit/docs-check-script.test.ts (95 tests) 4170ms

 Test Files  2 passed (2)
      Tests  98 passed (98)
   Start at  20:38:44
   Duration  4.32s (tests 99%, transform 1%)
Exit code: 0
```

#### B. Typecheck
```
$ nice -n 10 pnpm typecheck
> flowline@0.1.0 typecheck
> tsc --noEmit
Exit code: 0
```

#### C. Lint
```
$ nice -n 10 pnpm lint e2e-army tsconfig.json
> flowline@0.1.0 lint
> eslint . --cache --cache-location node_modules/.cache/eslint/ e2e-army tsconfig.json

/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-217/tsconfig.json
  0:0  warning  File ignored because no matching configuration was supplied

✖ 1 problem (0 errors, 1 warning)
Exit code: 0
```

#### D. Docs Gate Check
```
$ node -e 'import("./scripts/ci/docs-check.mjs").then(({ checkDocs }) => console.log(checkDocs(["tsconfig.json", "docs/DEVELOPER_GUIDE.md", "tests/unit/tsconfig-e2e-army-include.test.ts"])))'
{
  passed: true,
  summary: '## Docs check\n\nCode files changed: 2\nDocs changed: 1\n- "docs/DEVELOPER_GUIDE.md"\n',
  truncated: false
}
Exit code: 0
```

---

## Changed Covering Tests
- `tests/unit/tsconfig-e2e-army-include.test.ts`: 3 unit tests covering tsconfig exclusion removal, developer guide wording, and e2e-army/lib.ts existence.
- `tests/unit/docs-check-script.test.ts`: regression verification for docs check script (95 tests passing).

## Non-Applicability Notes
- **UI Changes**: None. This issue modifies developer tooling configuration, docs, and unit tests. No Playwright screenshots or RTL/LTR UI views are applicable.
- **Sentry Issue**: None. Originated as a delegated subtask of GitHub issue #85.
- **E2E Army Test**: E2E not needed — internal developer tooling, tsconfig, docs, and unit test only.
