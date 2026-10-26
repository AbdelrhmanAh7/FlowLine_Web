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

### Review Round 1 Resolution (PR #480)
CodeRabbit / Sonnet 5.5 flagged that the initial source-text regex guard had broad patterns (`/as\s+MessageKey/i` and bare `/errors\.NETWORK/i`), which could produce false positives on comments or unrelated valid usage, and noted that test helpers should not be exported.
Resolved by:
1. Removing `export` from `findCopyEditorViolations` and `HISTORICAL_PR329_SNIPPET`.
2. Stripping comments with `stripComments()` prior to checking patterns, preventing comments from causing false positives.
3. Narrowing patterns to target specifically inline function definitions (`/(?:async\s+)?function\s+handleWriteError\b|const\s+handleWriteError\s*=/i`) and dynamic error key casting (`/`errors\.\$\{[^}]+\}`\s+as\s+MessageKey/i`).
4. Replacing retry regex matching with a render-level test that renders `CopyEditor` under `I18nProvider` with translation overrides, asserting that the rendered DOM button uses `ui.retry` and not `common.retry` in both English and Arabic (RTL).

## Acceptance Criteria & Verification

| AC | Criterion | Command / Test | Exit Code | Result |
|----|-----------|----------------|-----------|--------|
| AC1 | `src/app/admin/copy/copy-editor.tsx` contains no inline `handleWriteError`, no dynamic `errors.*` key interpolation cast as `MessageKey`, and delegates error handling to `./copy-errors` | `pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts -t "AC1"` | 0 | ✅ PASS (2/2) |
| AC2 | `src/app/admin/copy/copy-errors.ts` maps `REVISION_CONFLICT` and `NETWORK` errors to canonical `platformAdmin.copyEditor.*` keys rather than `errors.*` | `pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts -t "AC2"` | 0 | ✅ PASS (2/2) |
| AC3 | Render-level verification that copy editor load error state renders the canonical `ui.retry` button and never `common.retry` across English and Arabic (RTL) locales | `pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts -t "AC3"` | 0 | ✅ PASS (2/2) |
| AC4 | Publish error handling (500 INTERNAL, STEP_UP_REQUIRED, validation fallback) operates cleanly via `handleWriteError` without requiring ad-hoc modifications to `copy-editor.tsx` | `pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts -t "AC4"` | 0 | ✅ PASS (3/3) |
| AC5 | All quality gates (`pnpm typecheck`, `pnpm lint`, `vitest`) pass cleanly with 0 errors | `pnpm typecheck && pnpm lint && pnpm exec vitest run tests/unit/admin/copy/` | 0 | ✅ PASS (49/49 unit tests) |

## Regression Demonstrations

### 1. Architectural Guard Regression: Inline `handleWriteError`
Injecting an inline `handleWriteError` into `src/app/admin/copy/copy-editor.tsx`:
```bash
sed -i '' 's/export function CopyEditor/async function handleWriteError() {}\nexport function CopyEditor/' src/app/admin/copy/copy-editor.tsx
pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts
```
**Result: 1 failed, 8 passed (Exit code: 1)**
```
FAIL tests/unit/admin/copy/copy-editor-publish-errors.test.ts > @issue-471 guard against unauthorized copy-editor.tsx core logic regressions (split from #329) > AC1: verifies that src/app/admin/copy/copy-editor.tsx adheres to architectural boundaries
AssertionError: expected [ Array(1) ] to deeply equal []
- Expected
+ Received
- []
+ [
+   "Inline handleWriteError definition in copy-editor.tsx (should import from ./copy-errors)",
+ ]
Exit code: 1
```

### 2. Render-Level Regression: `common.retry` instead of `ui.retry`
Injecting `common.retry` into `copy-editor.tsx`:
```bash
sed -i '' 's/t("ui.retry")/t("common.retry")/' src/app/admin/copy/copy-editor.tsx
pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts
```
**Result: 2 failed, 7 passed (Exit code: 1)**
```
FAIL tests/unit/admin/copy/copy-editor-publish-errors.test.ts > @issue-471 render-level behavior of copy-editor on load failure > AC3: renders load error with canonical ui.retry button and never common.retry (en)
AssertionError: expected '<div class="min-h-dvh bg-app text-hi"…' to contain 'UI_RETRY_CANONICAL_en'
Received: ... <button ...>COMMON_RETRY_FORBIDDEN_en</button> ...

FAIL tests/unit/admin/copy/copy-editor-publish-errors.test.ts > @issue-471 render-level behavior of copy-editor on load failure > AC3: renders load error with canonical ui.retry button and never common.retry (ar)
AssertionError: expected '<div class="min-h-dvh bg-app text-hi"…' to contain 'UI_RETRY_CANONICAL_ar'
Received: ... <button ...>COMMON_RETRY_FORBIDDEN_ar</button> ...
Exit code: 1
```

### 3. Proof of No False Positives on Comments
Injecting comments mentioning `errors.NETWORK` or `as MessageKey` does not trigger false positives due to comment stripping:
```bash
sed -i '' 's/export function CopyEditor/\/\/ Note: errors.NETWORK is handled in copy-errors.ts and cast as MessageKey\nexport function CopyEditor/' src/app/admin/copy/copy-editor.tsx
pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts
```
**Result: 9 passed, 0 failed (Exit code: 0)**

### 4. Clean HEAD State
```bash
git checkout src/app/admin/copy/copy-editor.tsx
pnpm exec vitest run tests/unit/admin/copy/copy-editor-publish-errors.test.ts
```
**Result: 9 passed, 0 failed (Exit code: 0)**
```
✓ tests/unit/admin/copy/copy-editor-publish-errors.test.ts (9 tests)
Test Files  1 passed (1)
Tests       9 passed (9)
Exit code: 0
```

## E2E Gate Note
**E2E: not needed — review finding resolution on PR #329 / guard against regressions in copy-editor.tsx error handling; no user-facing UI flows changed.** Existing static render test suite (`tests/unit/admin/copy/copy-editor.test.ts`) and new AC3 render-level tests assert error alerts and retry button in both `en` and `ar` (RTL) locales.

## Security Posture
No dependencies added or upgraded; no secrets read or exposed; no workflow files or permissions changed.
