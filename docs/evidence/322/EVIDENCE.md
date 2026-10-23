# Evidence for Issue #322: Client-side error display for /admin/copy (replaces #186, closes #180)

Tested commit: `343579d2`

## Summary
Implements comprehensive client-side error display, resilience, and user-friendly error banners for `/admin/copy` (restarting #180 and superseding #186). When server errors occur (HTTP 500, revision conflicts, step-up/CSRF refusals, session expirations, rate limits, network outages, and truncated response bodies), the UI displays appropriate localized error messages in a dismissible alert banner without breaking the page or losing in-progress edits. Access to `/admin/copy` strictly enforces the platform-admin boundary (`platformAdminOrNull()` returning `null` → `notFound()`), and the 8-file top-level cap for `e2e-army/` is maintained.

## Acceptance Criteria and Verification

| AC | Description | Verification Method | Result | Exit Code |
|---|---|---|---|---|
| AC1 | When save/publish returns HTTP 500, `copy-editor` renders a visible error banner reading `platformAdmin.copyEditor.serverError` without breaking, preserving in-progress edits. | `tests/unit/admin/copy/copy-errors.test.ts` (row 3, 500 INTERNAL) | Passed (26/26 unit tests pass) | 0 |
| AC2 | When save/publish returns HTTP 401/403 (session expired, step-up or CSRF refusal), the banner displays the appropriate translated message (`reauthRequired`, `stepUp`, or fallback) and refreshes the session without leaking raw status codes or JSON. | `tests/unit/admin/copy/copy-errors.test.ts` (STEP_UP_REQUIRED, CSRF_TOKEN_INVALID, PLATFORM_REAUTH_REQUIRED, PLATFORM_MFA_REQUIRED) | Passed (26/26 unit tests pass) | 0 |
| AC3 | When a network failure occurs (fetch rejection or response body cut off mid-stream, status 0), `copy-editor` displays `platformAdmin.copyEditor.networkError` in both English and Arabic, preserves draft text, and reloads copy state. | `tests/unit/api-body-read.test.ts:7-24` & `tests/unit/admin/copy/copy-errors.test.ts` (network error row) | Passed (4/4 & 26/26 pass) | 0 |
| AC4 | The write error banner is dismissible via `platformAdmin.copyEditor.dismiss` button; clicking dismiss clears the alert state while keeping edits and form controls intact. | `src/app/admin/copy/copy-editor.tsx` (`Button` dismiss handler) & `tests/unit/admin/copy/copy-editor.test.ts` | Passed | 0 |
| AC5 | On initial copy state load failure, `copy-editor` renders a load error alert with a Retry button (`ui.retry`); clicking Retry triggers query refetch. If initial admin session load fails, renders `meLoadError`. Subsequent background refresh errors do not unmount or break the editor. | `tests/unit/admin/copy/copy-editor.test.ts` (English & Arabic render tests for meLoadError, loadError + Retry, background error resilience, and step-up warning state) | Passed (12/12 tests pass) | 0 |
| AC6 | Non-admins receive 404 on `/admin/copy` (platform-admin gate enforced), and unauthorized mutations return clean 404 NOT_FOUND JSON with bounded response size and allowed error fields without stack traces. Respects 8-file cap. | `tests/unit/admin/copy/copy-page.test.ts:28-39` & `e2e-army/200-route-error-headers.e2e.ts` (@issue-322 AC6 test & expectBoundedError helper) & `tests/unit/e2e-army-tooling.test.ts` | Passed (2/2, 1/1, 12/12 pass) | 0 |
| AC7 | When copy state refresh is in progress (`state.isFetching`), `copy-editor` renders a visual indicator (`platformAdmin.copyEditor.refreshing`) explaining that saving is temporarily disabled due to state refresh, preventing user confusion while leaving draft text intact. | `tests/unit/admin/copy/copy-editor.test.ts` (refreshing indicator in English and Arabic) | Passed (12/12 tests pass) | 0 |

## Changed Covering Tests
- `tests/unit/admin/copy/copy-errors.test.ts`: 26 unit tests covering HTTP status code and error code mapping to translated message keys, session synchronization on CSRF / step-up, refusal handling, and unawaited refetch triggers.
- `tests/unit/admin/copy/copy-editor.test.ts`: 12 server-render unit tests in English (LTR) and Arabic (RTL) for `meLoadError` alert, `loadError` with `ui.retry` button, keeping editor mounted on later background refetch error, loading state, step-up warning note, and the `refreshing` indicator.
- `tests/unit/admin/copy/copy-page.test.ts`: 2 unit tests verifying that `CopyPage` renders `CopyEditor` for platform admins and throws `notFound()` (404) for non-admins.
- `tests/unit/api-body-read.test.ts`: 4 unit tests verifying that stream/body cut-offs mid-read trigger network `ApiError(0, "NETWORK")` inside `api()` and handle offline errors cleanly.
- `e2e-army/200-route-error-headers.e2e.ts`: request-level e2e-army test (`@issue-322 AC6`) asserting 404 for non-admin requests to `/admin/copy` in Arabic RTL and English LTR without stack traces, and clean 404 JSON for unauthorized mutations. Helper `expectBoundedError` asserts max response size (<4096 bytes) and restricts keys inside `error` to supported fields (`code`, `message`, `details`, `requestId`).
- `tests/unit/e2e-army-tooling.test.ts`: regression test asserting the hub's 8-file top-level cap is respected (8/8 files).

## Bug Fix & Regression Proof
- **Body Cut-off / Truncated Stream (`src/lib/api.ts`)**:
  - *Base behavior*: `res.text()` was called outside the `try/catch` block. When a response body was cut off after headers arrived, `res.text()` threw an unhandled `TypeError: terminated`.
  - *Failure on base (`tests/unit/api-body-read.test.ts`)*:
    ```
    FAIL |unit| tests/unit/api-body-read.test.ts > api() response-body failures > reports a body cut off mid-read (HTTP 200) as a network ApiError
    AssertionError: expected TypeError: terminated to be an instance of ApiError
    ```
  - *Pass on head*: Moving `text = await res.text();` inside `try/catch` in `src/lib/api.ts` ensures truncated streams are caught and converted to `ApiError(0, "NETWORK", "Can't reach Flowline — check your connection")`. All 4 tests in `tests/unit/api-body-read.test.ts` pass cleanly (exit 0).

## UI / Playwright / Arabic RTL & LTR Verification
- **Platform Admin Boundary**: `/admin/copy` enforces the platform-admin gate (`if (!(await platformAdminOrNull())) notFound();` in `src/app/admin/copy/page.tsx:15`). Automated verifiers running without a platform-admin session receive a 404 page rather than the admin panel.
- **RTL & LTR Error Messages**: All copy editor error messages are fully translated in `src/i18n/messages/en.json` and `src/i18n/messages/ar.json`:
  - `platformAdmin.copyEditor.saveError`: `"Could not save the draft. Check the text and try again."` / `"تعذّر حفظ المسودة. راجع النص وحاول مرة أخرى."`
  - `platformAdmin.copyEditor.publishError`: `"Could not publish. Review the draft and try again."` / `"تعذّر النشر. راجع المسودة وحاول مرة أخرى."`
  - `platformAdmin.copyEditor.serverError`: `"The server encountered an error. Try again in a moment."` / `"واجه الخادم خطأً. حاول مجددًا بعد لحظة."`
  - `platformAdmin.copyEditor.networkError`: `"The connection failed, so the change may not have gone through. Check the copy before you try again."` / `"انقطع الاتصال، لذا ربما لم يكتمل التغيير. راجع النصوص قبل أن تحاول مجددًا."`
  - `platformAdmin.copyEditor.reauthRequired`: `"Your admin session has expired. Sign out and sign in again to keep editing the copy."` / `"انتهت جلسة الإدارة. سجّل الخروج ثم سجّل الدخول مجددًا لمتابعة تحرير النصوص."`
  - `platformAdmin.copyEditor.conflict`: `"This copy changed elsewhere since you loaded it. Review the latest version before you try again."` / `"تغيّر هذا النص في مكان آخر منذ أن حمّلته. راجع أحدث نسخة قبل أن تحاول مجددًا."`
  - `platformAdmin.copyEditor.refreshing`: `"Saving is temporarily disabled while the copy refreshes."` / `"الحفظ معطّل مؤقتًا أثناء تحديث النصوص."`
  - `platformAdmin.copyEditor.dismiss`: `"Dismiss"` / `"تجاهل"`
  - `platformAdmin.copyEditor.meLoadError`: `"Could not load your admin session. Refresh the page and try again."` / `"تعذّر تحميل جلسة الإدارة. حدّث الصفحة وحاول مجددًا."`

## Commands and Exit Codes

### 1. Unit Tests
```
$ pnpm vitest run tests/unit/admin/copy/ tests/unit/api-body-read.test.ts tests/unit/e2e-army-tooling.test.ts
✓ |unit| tests/unit/e2e-army-tooling.test.ts (12 tests)
✓ |unit| tests/unit/admin/copy/copy-editor.test.ts (12 tests)
✓ |unit| tests/unit/admin/copy/copy-errors.test.ts (26 tests)
✓ |unit| tests/unit/admin/copy/copy-page.test.ts (2 tests)
✓ |unit| tests/unit/api-body-read.test.ts (4 tests)

Test Files  5 passed (5)
     Tests  56 passed (56)
Exit code: 0
```

### 2. Typecheck and Lint
```
$ pnpm typecheck
tsc --noEmit
Exit code: 0

$ pnpm lint
eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0
```

### 3. e2e-army 8-File Cap
```
$ node -e "const fs = require('fs'); const files = fs.readdirSync('e2e-army').filter(f => /^[\w.-]+\.e2e\.ts$/.test(f)); console.log(files.length, files);"
8 [
  '109-account-delete-shared-audit.e2e.ts',
  '117-flows-list-dashboard.e2e.ts',
  '147-mizano-create-customer-and-quote.e2e.ts',
  '166-mena-template.e2e.ts',
  '200-route-error-headers.e2e.ts',
  '221-auth-isolation.e2e.ts',
  '72-federated-mfa-failure-audit.e2e.ts',
  '85-sign-in-and-core-flow.e2e.ts'
]
Exit code: 0
```

---

## Originating Issue & Sentry
- **Originating review finding:** PR #186 review threads (replaces #186, fresh restart of #180).
- **Originating Sentry issue:** None (client-side error display enhancement, parent issue #119 part 2/3).
- **Linkage:** Closes #180, Supersedes #186.
