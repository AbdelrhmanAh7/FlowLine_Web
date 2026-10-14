# Evidence for Issue #180: Client-side error display for /admin/copy

## Summary
Implements comprehensive client-side error display and resilience for `/admin/copy` (part 2/3 of #119). When server errors occur (conflicts, step-up refusals, session expirations, rate limits, network outages, and 5xx errors), the UI displays appropriate localized user-friendly error messages without breaking. In addition, the platform-admin gate (`platformAdminOrNull()` returning `null` → `notFound()`) is strictly enforced so that non-admins receive a 404 page, and the 8 top-level file cap for `e2e-army/` is preserved.

## Changes

### 1. Client-Side Error Mapping & Resilience (`src/app/admin/copy/copy-errors.ts`)
- `copyErrorKey`: Maps various `ApiError` failure modes to distinct translated keys:
  - `REVISION_CONFLICT` → `platformAdmin.copyEditor.conflict`
  - `STEP_UP_REQUIRED` → `platformAdmin.copyEditor.stepUp`
  - `PLATFORM_REAUTH_REQUIRED` / `PLATFORM_MFA_REQUIRED` → `platformAdmin.copyEditor.reauthRequired`
  - `RATE_LIMITED` / status 429 → `platformAdmin.copyEditor.rateLimited`
  - `isNetwork` (status 0, offline, body cut-off) → `platformAdmin.copyEditor.networkError`
  - Server errors (status >= 500) → `platformAdmin.copyEditor.serverError`
  - Fallback keys for 4xx save/publish failures
- `handleWriteError`: Sets translated error message; on `STEP_UP_REQUIRED`, re-fetches the admin session and validates the refetch result's error state (`!refreshed.isError && !refreshed.error`) so a failed refetch never enables writes even if stale session data retained a future expiry; on session refusals disables writes; on other errors triggers a copy state reload.
- `src/lib/api.ts`: Wraps `res.text()` inside try-catch so incomplete response bodies (body cut off after headers) are reported as network `ApiError` (status 0).

### 2. Client-Side Editor UI (`src/app/admin/copy/copy-editor.tsx`)
- TanStack Query `ErrorState` with retry on `isLoadingError` for copy state (`/api/platform/copy`).
- Session query error alert on `meError` (`isLoadingError` for `/api/platform/me`).
- Write buttons (Save and Apply) disabled while `state.isFetching` to prevent race conditions during query reload.
- Localized error and success alerts in both Arabic RTL and English LTR (`src/i18n/messages/ar.json`, `src/i18n/messages/en.json`).

### 3. Page Gate (`src/app/admin/copy/page.tsx`)
- Calls `if (!(await platformAdminOrNull())) return notFound();` preserving the platform-admin boundary (MUST 1–2).
- Non-admins receive 404, hiding the panel's existence.

### 4. Unit & DOM Tests
- `tests/unit/admin/copy/copy-page.test.ts`:
  - Authorized admin renders `CopyEditor`.
  - Non-admin calls `notFound()` and rejects.
- `tests/unit/admin/copy/copy-errors.test.ts`: 24 unit tests covering all error mappings, fallbacks, session refusals, rate limits, network errors, and failed refetch retaining future expiry.
- `tests/unit/admin/copy/copy-editor.test.ts`: 16 DOM interaction tests in happy-dom verifying Save/Apply retries, conflict alert, step-up refusal, session expiration, load error Retry button, and fetch locking in both English and Arabic.
- `tests/unit/api-body-read.test.ts`: 3 unit tests verifying body cut-off reporting as network `ApiError`.
- `tests/unit/e2e-army-tooling.test.ts`: 12 unit tests passing, verifying the 8-file cap is maintained.

### 5. E2E Test (`e2e-army/179-copy-editor-state.e2e.ts`)
- Consolidated `@issue-180` test into `e2e-army/179-copy-editor-state.e2e.ts` (satisfying the 8-file cap, matching the precedent from #197 in commit `a71fae72`).
- Verifies:
  1. Anonymous GET `/admin/copy` returns 404.
  2. Signed-in non-admin GET `/admin/copy` returns 404 (gate enforced).
  3. Unauthorized PATCH `/api/platform/copy` returns 404 JSON NOT_FOUND without stack traces.

### 6. Documentation
- `docs/DEVELOPER_GUIDE.md`: Updated to describe guarded page behavior, distinguishing E2E non-admin boundary checks from unit/DOM error display tests, citing `179-copy-editor-state.e2e.ts`.
- `docs/implementation/PROGRESS.md`: Updated to distinguish E2E non-admin 404 checks from unit/DOM tested client-side error states.

## Verification Results

- `pnpm typecheck`: Clean (0 errors)
- `pnpm lint`: Clean (0 errors)
- Focused vitest runs:
  - `tests/unit/admin/copy/copy-page.test.ts`: 2/2 passed
  - `tests/unit/admin/copy/copy-errors.test.ts`: 24/24 passed
  - `tests/unit/admin/copy/copy-editor.test.ts`: 16/16 passed
  - `tests/unit/api-body-read.test.ts`: 3/3 passed
  - `tests/unit/e2e-army-tooling.test.ts`: 12/12 passed (8-file cap verified)
