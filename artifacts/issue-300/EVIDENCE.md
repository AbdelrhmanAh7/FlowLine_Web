# Evidence — Issue #300: fix failing check `gate` (split from #268)

## Overview & Scope
- **Issue**: #300 (`fix: failing check gate (split from #268)`)
- **Parent Issue**: #199
- **Supersedes**: part of PR #268
- **Branch**: `ai/300` (clean branch off `origin/main` at `264336fb`)
- **Originating Sentry Issue**: None (internal CI / QA finding split)
- **User-Facing**: No (internal docs/questions QA finding and gate check repair; exempt from E2E test)

## Acceptance Criteria

| ID | Acceptance Criterion | Verification Method | Observed Result | Exit Code |
|---|---|---|---|---|
| **AC1** | Stale reference to #196 (prerequisite #196 not on main, branch 196 unmerged, conflict with #197) is resolved and barred from `AI_QUESTIONS.md` and repository docs. | Verified `AI_QUESTIONS.md` on `main`; unit regression assertions in `tests/unit/stale-questions-guard.test.ts`. | 0 violations found in active repository files | 0 |
| **AC2** | Regression unit test covers and rejects historical offending texts that caused QA findings on PR #268 / parent #199 (red on offending text, green on clean head). | `pnpm vitest run tests/unit/stale-questions-guard.test.ts` | 5 passed, 0 failed | 0 |
| **AC3** | Fresh branch off `main` (`ai/300`) is used instead of broken parent branch `ai/199-p2`, clearing the root causes of the `gate` failure (e.g. 11 e2e-army files exceeding the 8-file cap, unmerged branch conflicts). | `pnpm typecheck` && `pnpm lint` | Clean output (tsc exit 0, eslint exit 0) | 0 |
| **AC4** | Verification evidence and documentation updated (`artifacts/issue-300/EVIDENCE.md`, `docs/implementation/PROGRESS.md`, `NEXT_ACTION.md`). | `git status` and test inspection | Docs updated, CI docs check satisfied | 0 |

## Root Cause Analysis
1. PR #268 attempted to delete `AI_QUESTIONS.md` to resolve QA findings about stale #196 notes.
2. However, PR #268 was opened on `ai/199-p2`, a branch diverged from `main` with unmerged code from #196/#197/#199 and 11 top-level `e2e-army/*.e2e.ts` files, violating the strict 8-file limit enforced by `tests/unit/e2e-army-tooling.test.ts`.
3. Merging `lane/ai/199` into `lane/ai/199-p2` in commit `eb5ee4d` failed check `gate`, reaching the 3/3 fix-round cap.
4. Issue #300 isolates the task on a clean branch off `main` (`ai/300`), where `AI_QUESTIONS.md` contains no stale #196 blocker notes, and adds a regression test ensuring these notes cannot recur.

## Verification Commands & Outputs

### 1. Regression Test Execution (AC1, AC2)
```bash
pnpm vitest run tests/unit/stale-questions-guard.test.ts
```
Output:
```
 ✓ |unit| tests/unit/stale-questions-guard.test.ts (5 tests) 4ms
   ✓ @issue-300 guard against stale #196 blocker notes in AI_QUESTIONS.md (supersedes part of #268) (5)
     ✓ rejects historical QA finding: stale reference to prerequisite #196 being blocked 1ms
     ✓ rejects historical QA finding: branch 196 not merged and conflicting with #197 0ms
     ✓ rejects the full unmerged AI_QUESTIONS.md text that blocked PR #268 0ms
     ✓ verifies that repository AI_QUESTIONS.md contains no stale #196 blocker claims on the current head 1ms
     ✓ verifies that active documentation files contain no stale references claiming #196 blocks progress 2ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```
Exit code: 0

### 2. Typecheck (AC3)
```bash
pnpm typecheck
```
Output:
```
> flowline@0.1.0 typecheck
> tsc --noEmit
```
Exit code: 0

### 3. Linter (AC3)
```bash
pnpm lint
```
Output:
```
> flowline@0.1.0 lint
> eslint . --cache --cache-location node_modules/.cache/eslint/
```
Exit code: 0

### 4. E2E-Army Tooling Cap Guard
```bash
pnpm vitest run tests/unit/e2e-army-tooling.test.ts
```
Output:
```
 ✓ |unit| tests/unit/e2e-army-tooling.test.ts (12 tests) 1405ms
 Test Files  1 passed (1)
      Tests  12 passed (12)
```
Exit code: 0
