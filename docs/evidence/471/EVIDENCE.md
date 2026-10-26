# Evidence for Issue #471: Guard copy-editor.tsx core logic and verify publish error handling

**Issue:** fix: copy-editor.tsx: major (Claude Sonnet 5.5·medium): The issue explicitly forbids touchi… (split from #329)
**Branch:** ai/471
**Base:** main
**Supersedes part of:** #329
**Parent Issue:** #228
**Originating Review Finding:** [PR #329 discussion r4322429334](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/329#discussion_r4322429334)
**Originating Sentry Issue:** None (Review finding on PR #329)

## Context & Finding Analysis

In PR #329 (delegated subtask for component tests on publish errors and expired step-up), changes were introduced directly to `src/app/admin/copy/copy-editor.tsx`:
1. Modified `handleWriteError` to check `REVISION_CONFLICT` and `NETWORK`, mapping them inline to generic `errors.${cause.code}` as `MessageKey` and refetching.
2. Added an ad-hoc inline Retry button using `t("common.retry")` on `state.isError`.

Review finding `5d6aad501027` (Claude Sonnet 5.5·medium) flagged:
> "The issue explicitly forbids touching src/ and the parent's core logic. This PR changes handleWriteError (REVISION_CONFLICT/NETWORK now render errors.* and refetch) and adds a Retry button on the load error. This is behaviour change outside the delegated scope and it duplicates #180/#181 work. Drop it, or move it to the parent PR. The new tests in copy-editor-publish-errors.test.tsx do not need it."

On `main`, the legitimate copy error architecture was completed under parent issue #180 (PR #322 / #451):
- `src/app/admin/copy/copy-errors.ts` maps error codes to proper localized keys (`platformAdmin.copyEditor.conflict`, `platformAdmin.copyEditor.networkError`, `platformAdmin.copyEditor.serverError`, etc.).
- `src/app/admin/copy/copy-editor.tsx` imports and delegates to `handleWriteError` from `./copy-errors`.
- The Retry button on load error was added cleanly in `copy-editor.tsx` using `t("ui.retry")`.

Issue #471 resolves this review finding on a fresh branch off `main` by adding an architectural regression guard and comprehensive publish error tests proving that `copy-editor.tsx` core logic remains clean without ad-hoc error logic.

## Acceptance Criteria & Verification

| AC | Criterion | Command / Test | Exit Code | Result |
|----|-----------|----------------|-----------|--------|
| AC1 | `src/app/admin/copy/copy-editor.tsx` contains no inline `handleWriteError`, no generic `errors.*` key interpolation, no unsafe `MessageKey` cast, and delegates error handling to `./copy-errors` | `pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts -t "AC1"` | 0 | ✅ PASS |
| AC2 | `src/app/admin/copy/copy-errors.ts` maps `REVISION_CONFLICT` and `NETWORK` errors to canonical `platformAdmin.copyEditor.*` keys rather than `errors.*` | `pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts -t "AC2"` | 0 | ✅ PASS |
| AC3 | The copy editor load error state uses `t("ui.retry")` (from parent #180/#322) rather than uncoordinated `common.retry` | `pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts -t "AC1"` | 0 | ✅ PASS |
| AC4 | Publish error handling (500 INTERNAL, STEP_UP_REQUIRED, validation fallback) operates cleanly via `handleWriteError` without requiring ad-hoc modifications to `copy-editor.tsx` | `pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts -t "AC4"` | 0 | ✅ PASS |
| AC5 | All quality gates (`pnpm typecheck`, `pnpm lint`, `vitest`) pass cleanly with 0 errors | `pnpm typecheck && pnpm lint && pnpm exec vitest run tests/unit/admin/copy/` | 0 | ✅ PASS |

## Regression Demonstration

A mutation test introducing `async function handleWriteError` or `errors.*` into `src/app/admin/copy/copy-editor.tsx` causes the test suite to fail:

### Base/Offending State (with inline handleWriteError injected)
```bash
sed -i '' 's/export function CopyEditor/async function handleWriteError() {}\nexport function CopyEditor/' src/app/admin/copy/copy-editor.tsx
pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts --maxWorkers=2
```
**Result: 1 failed, 6 passed (Exit code: 1)**
```
FAIL tests/unit/admin/copy/copy-editor-publish-errors.test.ts > @issue-471 guard against unauthorized copy-editor.tsx core logic regressions (split from #329) > AC1: verifies that src/app/admin/copy/copy-editor.tsx adheres to architectural boundaries
AssertionError: expected [ Array(1) ] to deeply equal []
- Expected
+ Received
- []
+ [
+   "Inline handleWriteError in copy-editor.tsx (should import from ./copy-errors)",
+ ]
Exit code: 1
```

### Head State (Clean architectural boundaries)
```bash
git checkout src/app/admin/copy/copy-editor.tsx
pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts --maxWorkers=2
```
**Result: 7 passed, 0 failed (Exit code: 0)**
```
✓ tests/unit/admin/copy/copy-editor-publish-errors.test.ts (7 tests)
Test Files  1 passed (1)
Tests       7 passed (7)
Exit code: 0
```

## E2E Gate Note
**E2E: not needed — review finding resolution on PR #329 / guard against regressions in copy-editor.tsx error handling; no user-facing UI flows changed.** Existing static render test suite (`tests/unit/admin/copy/copy-editor.test.ts`) already asserts error alerts and retry button in both `en` and `ar` (RTL) locales.

## Security Posture
No dependencies added or upgraded; no secrets read or exposed; no workflow files or permissions changed.
