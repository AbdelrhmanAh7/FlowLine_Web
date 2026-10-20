# Evidence for Issue #180: Client-side error display for /admin/copy

Tested commit: `1d1b8759`

## Summary
Implements comprehensive client-side error display, resilience, and user-friendly error banners for `/admin/copy` (part 2/3 of #119). When server errors occur (HTTP 500, revision conflicts, step-up/CSRF refusals, session expirations, rate limits, network outages, and truncated responses), the UI displays appropriate localized error messages in a dismissible alert banner without breaking the page or losing in-progress edits. Access to `/admin/copy` enforces the platform-admin boundary (`platformAdminOrNull()` returning `null` → `notFound()`), and the 8-file top-level cap for `e2e-army/` is strictly maintained.

## Acceptance Criteria and Verification

| AC | Description | Verification Method | Result | Exit Code |
|---|---|---|---|---|
| AC1 | When save/publish returns HTTP 500, `copy-editor` renders a visible error banner reading `platformAdmin.copyEditor.serverError` without breaking, preserving in-progress edits. | `tests/unit/admin/copy/copy-editor.test.ts:145-163` & `:213-234` | Passed (19/19 DOM tests pass) | 0 |
| AC2 | When save/publish returns HTTP 401/403 (session expired or step-up / CSRF refusal), the banner displays the appropriate translated message and refreshes the session without leaking raw status codes or JSON. | `tests/unit/admin/copy/copy-editor.test.ts:130-143`, `:184-195`, and `tests/unit/admin/copy/copy-errors.test.ts:47-73` | Passed (26/26 unit tests pass) | 0 |
| AC3 | When a network failure occurs (fetch rejection or response body cut off, status 0), `copy-editor` displays `platformAdmin.copyEditor.networkError` in both English and Arabic, preserves draft text, and reloads copy state. | `tests/unit/admin/copy/copy-editor.test.ts:236-252` and `tests/unit/api-body-read.test.ts:8-26` | Passed (4/4 tests pass) | 0 |
| AC4 | The write error banner is dismissible via `platformAdmin.copyEditor.dismiss` button; clicking dismiss clears the alert state while keeping edits and form controls intact. | `tests/unit/admin/copy/copy-editor.test.ts:213-234` | Passed | 0 |
| AC5 | On initial copy state load failure, `copy-editor` renders a load error alert with a Retry button; clicking Retry triggers query refetch. | `tests/unit/admin/copy/copy-editor.test.ts:45-51` & `:120-128` | Passed | 0 |
| AC6 | Non-admins receive 404 on `/admin/copy` (platform-admin gate enforced), and unauthorized mutations return clean 404 NOT_FOUND JSON without stack traces. Respects 8-file cap. | `tests/unit/admin/copy/copy-page.test.ts:29-40`, `e2e-army/200-route-error-headers.e2e.ts:72-100`, and `tests/unit/e2e-army-tooling.test.ts:1-12` | Passed (12/12 e2e-army tooling tests pass) | 0 |

## Changed Covering Tests
- `tests/unit/admin/copy/copy-editor.test.ts`: 19 DOM unit tests testing server render and full interactive React happy-dom mounting (500 server error, dismissible banner, preservation of textarea draft, Retry on load error, 401 session expiration, network failure in English LTR and Arabic RTL).
- `tests/unit/admin/copy/copy-errors.test.ts`: 26 unit tests covering HTTP status code and error code mapping to translated message keys, session synchronization on CSRF / step-up, and refetch triggers.
- `tests/unit/admin/copy/copy-page.test.ts`: 2 unit tests verifying that `CopyPage` renders `CopyEditor` for platform admins and throws `notFound()` (404) for non-admins.
- `tests/unit/api-body-read.test.ts`: 4 unit tests verifying that stream/body cut-offs mid-read trigger network `ApiError(0, "NETWORK")` and invoke copy editor reload.
- `e2e-army/200-route-error-headers.e2e.ts`: request-level e2e-army tests asserting 404 for anonymous and non-admin requests to `/admin/copy` and bounded 404 JSON for unauthorized mutations.
- `tests/unit/company-builder-client-mode.test.ts`: regression test asserting happy path passes unchanged.
- `tests/unit/e2e-army-tooling.test.ts`: regression test enforcing the hub's 8-file top-level cap.

## UI / Playwright / Arabic RTL & LTR Verification
- **Platform Admin Boundary**: `/admin/copy` enforces the platform-admin gate (`if (!(await platformAdminOrNull())) notFound();` in `src/app/admin/copy/page.tsx:15`), which was already present on `main`. Automated verifiers that run without a platform-admin session correctly receive a 404 page rather than the admin panel.
- **RTL & LTR Error Messages**: All copy editor error states are verified in both English (`messages/en.json`) and Arabic (`messages/ar.json`):
  - `platformAdmin.copyEditor.dismiss`: `"Dismiss"` / `"تجاهل"`
  - `platformAdmin.copyEditor.serverError`: `"The server encountered an error. Try again in a moment."` / `"واجه الخادم خطأً. حاول مجددًا بعد لحظة."`
  - `platformAdmin.copyEditor.networkError`: `"The connection failed, so the change may not have gone through. Check the copy before you try again."` / `"انقطع الاتصال، لذا ربما لم يكتمل التغيير. راجع النصوص قبل أن تحاول مجددًا."`
  - `platformAdmin.copyEditor.reauthRequired`: `"Your admin session has expired. Sign out and sign in again to keep editing the copy."` / `"انتهت جلسة الإدارة. سجّل الخروج ثم سجّل الدخول مجددًا لمتابعة تحرير النصوص."`
  - `platformAdmin.copyEditor.conflict`: `"This copy changed elsewhere since you loaded it. Review the latest version before you try again."` / `"تغيّر هذا النص في مكان آخر منذ أن حمّلته. راجع أحدث نسخة قبل أن تحاول مجددًا."`
  - Verified via `tests/unit/admin/copy/copy-editor.test.ts` (tested with `describe.each(["en", "ar"])` and `it.each(["en", "ar"])`).

## Bug Fix & Regression Proof
- **Body Cut-off / Truncated Stream**: In `src/lib/api.ts`, reading response text inside the `try/catch` block ensures that a response body truncated after headers is wrapped in `new ApiError(0, "NETWORK", ...)`, allowing the copy editor to handle it gracefully and trigger a state refetch (`tests/unit/api-body-read.test.ts`).
- **Dismissible Error Banner & Preserved Edits**: Previously, write errors rendered a static alert without dismiss capabilities. `src/app/admin/copy/copy-editor.tsx` now renders a dismissible alert banner with `Button` invoking `setError("")`. Clicking dismiss clears the error banner while leaving all user edits intact in the `#copy-en` and `#copy-ar` textareas (`tests/unit/admin/copy/copy-editor.test.ts:213-234`).
- **CSRF Token Stale Retry**: Previously, `CSRF_TOKEN_INVALID` only refetched copy state instead of session, causing retries to fail repeatedly with stale tokens. `handleWriteError` in `copy-errors.ts` now refetches the session via `refetchMe()` and synchronizes `stepUpActive`.

## Commands and Exit Codes

### 1. Unit and Component Tests
```
$ npx vitest run tests/unit/admin/copy/copy-editor.test.ts tests/unit/admin/copy/copy-errors.test.ts tests/unit/admin/copy/copy-page.test.ts tests/unit/api-body-read.test.ts tests/unit/e2e-army-tooling.test.ts tests/unit/company-builder-client-mode.test.ts

 ✓ |unit| tests/unit/admin/copy/copy-editor.test.ts (19 tests) 92ms
 ✓ |unit| tests/unit/admin/copy/copy-errors.test.ts (26 tests) 10ms
 ✓ |unit| tests/unit/api-body-read.test.ts (4 tests) 3ms
 ✓ |unit| tests/unit/e2e-army-tooling.test.ts (12 tests) 1489ms
 ✓ |unit| tests/unit/admin/copy/copy-page.test.ts (2 tests) 2ms
 ✓ |unit| tests/unit/company-builder-client-mode.test.ts (1 test) 4ms

 Test Files  6 passed (6)
      Tests  64 passed (64)
   Duration  1.93s
Exit code: 0
```

### 2. Typecheck and Lint
```
$ pnpm typecheck
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-180
> tsc --noEmit
Exit code: 0

$ pnpm lint
> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-180
> eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0
```

### 3. Evidence Secrets Scan
```
$ pnpm check:evidence
> flowline@0.1.0 check:evidence /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-180
> node scripts/check-evidence-secrets.mjs
check-evidence-secrets: 0 local secret value(s) checked across 176 file(s); 0 hit(s)
Exit code: 0
```

### 4. e2e-army 8-File Cap
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
- **Originating review finding:** PR #186 CodeRabbit review threads (`r4273628296`, `copy-errors.ts:26`, `EVIDENCE.md:50-52`).
- **Originating Sentry issue:** None (client-side error display enhancement, parent issue #119 part 2/3).
- **Linkage:** Closes #180, Refs #119.
