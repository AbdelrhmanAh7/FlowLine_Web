# Evidence for Issue #460: GITHUB_WORKFLOW.md gate verification procedures

## Acceptance Criteria

| AC | Description | Verification Method | Command | Exit Code | Result |
|----|-------------|---------------------|---------|-----------|--------|
| AC1 | GITHUB_WORKFLOW.md contains explicit procedures for checking the `gate` status | Unit test reads the file and asserts the section exists | `nice -n 10 pnpm exec vitest run tests/unit/github-workflow-gate.test.ts --maxWorkers=2` | 0 | PASS (9/9 tests) |
| AC2 | Procedures cover the three specific PRs (#360, #330, #308) | Unit test asserts all three PR numbers are mentioned | `nice -n 10 pnpm exec vitest run tests/unit/github-workflow-gate.test.ts --maxWorkers=2` | 0 | PASS (9/9 tests) |
| AC3 | Four verification commands are documented: quick status, detailed rollup, Actions run lookup, full-tier | Unit test asserts each command pattern appears in the doc | `nice -n 10 pnpm exec vitest run tests/unit/github-workflow-gate.test.ts --maxWorkers=2` | 0 | PASS (9/9 tests) |
| AC4 | Document states what to do when `gate` is red | Unit test asserts the "do not merge" instruction exists | `nice -n 10 pnpm exec vitest run tests/unit/github-workflow-gate.test.ts --maxWorkers=2` | 0 | PASS (9/9 tests) |
| AC5 | Verified PRs table/status line shows all three PRs as initially unverified | Unit test asserts the status line with "unverified" for each PR | `nice -n 10 pnpm exec vitest run tests/unit/github-workflow-gate.test.ts --maxWorkers=2` | 0 | PASS (9/9 tests) |
| AC6 | Section references AC1 | Unit test asserts "AC1" appears in the section | `nice -n 10 pnpm exec vitest run tests/unit/github-workflow-gate.test.ts --maxWorkers=2` | 0 | PASS (9/9 tests) |

## Test Run Evidence

```
 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-460

 ❯ |unit| tests/unit/github-workflow-gate.test.ts (9 tests | 1 failed) 4ms
   ❯ GITHUB_WORKFLOW.md gate verification procedures (issue #460) (9)
     × states what to do when gate is red 2ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

**First run (before regex fix):** 1 test failed due to regex not matching bold markdown `**not**`.

**After fix:**

```
 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-460


 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  04:55:32
   Duration  155ms (transform 54%, import 25%, tests 11%, worker 10%)
```

## Lint and Typecheck

```
$ pnpm lint
> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-460
> eslint . --cache --cache-location node_modules/.cache/eslint/
# Exit code: 0 (no errors)

$ pnpm typecheck
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-460
> tsc --noEmit
# Exit code: 0 (no errors)
```

## Regression Test (Demonstrating Failure on Base)

The test file `tests/unit/github-workflow-gate.test.ts` is new and did not exist on `main`. To demonstrate the regression, we verify that the base `main` branch lacks the gate verification procedures:

```bash
git show main:docs/GITHUB_WORKFLOW.md | grep -c "Verifying the \`gate\` check"
# Returns: 0 (section does not exist on main)

git show main:docs/GITHUB_WORKFLOW.md | grep -c "#360\|#330\|#308"
# Returns: 0 (PR numbers not mentioned in gate context on main)
```

On the current branch (HEAD), the procedures exist:

```bash
git show HEAD:docs/GITHUB_WORKFLOW.md | grep -c "Verifying the \`gate\` check"
# Returns: 1

git show HEAD:docs/GITHUB_WORKFLOW.md | grep -c "#360\|#330\|#308"
# Returns: 3 (all three PRs mentioned)
```

## Files Changed

- `docs/GITHUB_WORKFLOW.md` - Added "Verifying the `gate` check (AC1)" section with four commands and PR references
- `tests/unit/github-workflow-gate.test.ts` - New unit test pinning the commands and PR numbers
- `docs/evidence/460/EVIDENCE.md` - This evidence file

## Notes

- No Sentry issue is linked (this is a documentation fix, not a runtime bug)
- No UI changes (no Playwright screenshots needed)
- No e2e-army test required (pure docs change, per repo rules: `E2E: not needed — documentation update only`)
- PR body will include: `Refs #449` and `Supersedes part of #458`