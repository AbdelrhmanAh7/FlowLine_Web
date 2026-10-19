# Evidence for Issue #180: Client-side error display for /admin/copy

Tested commit: `193d4fd46d7bc4d64be5b4560e8a327afa85edca`

## Summary
Implements comprehensive client-side error display, resilience, and user-friendly error banners for `/admin/copy` (part 2/3 of #119). When server errors occur (HTTP 500, revision conflicts, step-up/CSRF refusals, session expirations, rate limits, network outages, and truncated responses), the UI displays appropriate localized error messages in a dismissible alert banner without breaking the page or losing in-progress edits. Access to `/admin/copy` enforces the platform-admin boundary (`platformAdminOrNull()` returning `null` → `notFound()`), and the 8-file top-level cap for `e2e-army/` is strictly maintained.

## Acceptance Criteria and Verification

| AC | Description | Verification Method | Result | Exit Code |
|---|---|---|---|---|
| AC1 | When save/publish returns HTTP 500, `copy-editor` renders a visible error banner reading `platformAdmin.copyEditor.serverError` without breaking, preserving in-progress edits. | `tests/unit/admin/copy/copy-editor.test.ts:145-163` & `:213-234` | Passed (19/19 DOM tests pass) | 0 |
| AC2 | When save/publish returns HTTP 401/403 (session expired or step-up / CSRF refusal), the banner displays the appropriate translated message and refreshes the session without leaking raw status codes or JSON. | `tests/unit/admin/copy/copy-editor.test.ts:130-143`, `:184-195`, and `tests/unit/admin/copy/copy-errors.test.ts:47-73` | Passed (26/26 unit tests pass) | 0 |
| AC3 | When a network failure occurs (fetch rejection or response body cut off, status 0), `copy-editor` displays `platformAdmin.copyEditor.networkError` in both English and Arabic, preserves draft text, and reloads copy state. | `tests/unit/admin/copy/copy-editor.test.ts:236-252` and `tests/unit/api-body-read.test.ts:8-26` | Passed (4/4 tests pass) | 0 |
| AC4 | The write error banner is dismissible via `platformAdmin.copyEditor.dismiss` button; clicking dismiss clears the alert state while keeping edits and form controls intact. | `tests/unit/admin/copy/copy-editor.test.ts:213-234` | Passed | 0 |
| AC5 | On initial copy state load failure, `copy-editor` renders `ErrorState` with a Retry button; clicking Retry triggers query refetch. | `tests/unit/admin/copy/copy-editor.test.ts:45-51` & `:120-128` | Passed | 0 |
| AC6 | Non-admins receive 404 on `/admin/copy` (platform-admin gate enforced), and unauthorized mutations return clean 404 NOT_FOUND JSON without stack traces. Respects 8-file cap. | `tests/unit/admin/copy/copy-page.test.ts:29-40`, `e2e-army/200-route-error-headers.e2e.ts:47-73`, and `tests/unit/e2e-army-tooling.test.ts:1-12` | Passed (12/12 e2e-army tooling tests pass) | 0 |

## Changes

### 1. Dismissible Write-Error Banner (`src/app/admin/copy/copy-editor.tsx`)
- Replaced static `<p role="alert">` with an accessible, dismissible alert banner (`<div role="alert" ...>`).
- Added dismiss button invoking `setError("")`, using localized label `platformAdmin.copyEditor.dismiss`.
- Dismissing the alert preserves all typed edits in `#copy-en` and `#copy-ar` without resetting the dirty state or remounting the editor.

### 2. Localization (`src/i18n/messages/en.json`, `src/i18n/messages/ar.json`)
- Added `platformAdmin.copyEditor.dismiss` to English catalogue (`"Dismiss"`) and Arabic catalogue (`"تجاهل"`).
- All error states (`loadError`, `saveError`, `publishError`, `conflict`, `networkError`, `serverError`, `meLoadError`, `reauthRequired`, `rateLimited`) are localized in both languages and verified.

### 3. Error Handling & Session Synchronization (`src/app/admin/copy/copy-errors.ts`)
- `handleWriteError` refetches session and synchronizes `stepUpActive` on `CSRF_TOKEN_INVALID` in addition to `STEP_UP_REQUIRED`.
- Validates refetch result error state (`!refreshed.isError && !refreshed.error`) so a failed refetch never enables writes even if stale session data retained a future expiry.
- Body cut-offs wrapped as network `ApiError` (status 0) in `src/lib/api.ts`.

### 4. Consolidated E2E Gate (`e2e-army/200-route-error-headers.e2e.ts`)
- Consolidated `@issue-180` test into `e2e-army/200-route-error-headers.e2e.ts` alongside `@issue-200` and `@issue-179` tests to strictly adhere to the hub's 8-file cap (`tests/unit/e2e-army-tooling.test.ts`).
- Asserts anonymous and signed-in non-admin requests to `/admin/copy` return 404 (hiding the panel), and unauthorized PATCH mutations return clean 404 `NOT_FOUND` JSON without stack trace leaks.

### 5. Page Gate Alignment (`src/app/admin/copy/page.tsx`)
- Reverted unrelated import reordering to match origin/main and keep PR diff minimal.

## Test Execution Evidence

### 1. Typecheck
```
$ pnpm typecheck
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-180
> tsc --noEmit
Exit code: 0
```

### 2. Lint
```
$ pnpm lint
> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-180
> eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0
```

### 3. Unit and Component Tests
```
$ npx vitest run tests/unit/admin/copy/copy-editor.test.ts tests/unit/admin/copy/copy-errors.test.ts tests/unit/admin/copy/copy-page.test.ts tests/unit/api-body-read.test.ts tests/unit/e2e-army-tooling.test.ts

 ✓ |unit| tests/unit/admin/copy/copy-editor.test.ts (19 tests) 68ms
 ✓ |unit| tests/unit/admin/copy/copy-errors.test.ts (26 tests) 7ms
 ✓ |unit| tests/unit/admin/copy/copy-page.test.ts (2 tests) 2ms
 ✓ |unit| tests/unit/api-body-read.test.ts (4 tests) 3ms
 ✓ |unit| tests/unit/e2e-army-tooling.test.ts (12 tests) 1922ms

 Test Files  5 passed (5)
      Tests  63 passed (63)
   Duration  2.10s
Exit code: 0
```

### 4. Spec Regression Test
```
$ npx vitest run tests/unit/company-builder-client-mode.test.ts
 ✓ |unit| tests/unit/company-builder-client-mode.test.ts (1 test) 8ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  346ms
Exit code: 0
```
