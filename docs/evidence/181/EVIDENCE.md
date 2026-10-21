# Issue #181 Verification Report: Comprehensive Admin Copy Error Handling

## Overview & Origin
- **Issue**: [#181](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/181) (Part 3/3 of #119: Add comprehensive error handling tests for admin copy functionality)
- **Branch**: `ai/181` | **PR**: [#184](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/184)
- **Tested HEAD commit**: `HEAD`
- **Base commit**: `origin/main` (`264336fb`)
- **Originating Sentry Issue**: None (no Sentry alert was recorded; issue originated from hub automated verification finding on commit `be71f9f`).

---

## Security Architecture & Threat Model (`CREDENTIALS_DESIGN.md` Item 10)
The platform admin panel (`/admin` and `/admin/copy`) and its backing endpoints (`/api/platform/copy`) form a protected administrative boundary:
1. **Zero-Knowledge Existence for Non-Admins**: Any unauthenticated request or request from a non-platform-admin user is rejected with HTTP `404 Not Found` (returning the standard "We couldn't find that page" HTML or `{ "error": { "code": "NOT_FOUND", "message": "..." } }` JSON). The application never emits `401 Unauthorized` or `403 Forbidden` to unprivileged callers, preventing attackers from probing for the existence of administrative surfaces.
2. **Authenticated Platform Admin Requirements**: An active admin requires an enrolled TOTP authenticator, session-bound MFA assurance, and an active session <= 24 hours old (`PLATFORM_REAUTH_REQUIRED`, `PLATFORM_MFA_REQUIRED`, `PLATFORM_TOTP_REQUIRED`).
3. **Write Protection & Step-Up**: Mutations require an active TOTP step-up in the last 10 minutes (`STEP_UP_REQUIRED`), strict Origin validation, and CSRF token protection (`CSRF_TOKEN_INVALID`, `CROSS_SITE_REQUEST`).
4. **Header Hardening**: Every error response sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
5. **Information Leak Prevention**: 500 `INTERNAL` responses emit a generic localized message and request ID only, with strictly sanitized bodies containing zero stack traces, SQL queries, table names, or database driver strings.

---

## Explicit Numbered Acceptance Criteria

1. **AC1 (Unit Test Status Code & Error Mapping)**: Running unit tests yields passing assertions that the admin copy handler returns 401 with code `"unauthenticated"` when session is missing, 403 with code `"forbidden"` for a non-admin caller, 404 with code `"not_found"` for an unknown source id, and 500 with a generic code (`"INTERNAL"`) when the underlying database throws. Additionally verifies FlowLine platform-admin security refusals (404 `NOT_FOUND` for anonymous/non-admin per `CREDENTIALS_DESIGN.md` item 10, 401 `PLATFORM_REAUTH_REQUIRED`, 403 `PLATFORM_MFA_REQUIRED`).
2. **AC2 (500 Response Body Sanitization)**: 500 response bodies contain no stack traces (no `at `, `.tsx?:`, `node_modules`), no SQL statements/fragments (`select *`, `Failed query`), and no driver messages (`Connection terminated`, `DrizzleQueryError`).
3. **AC3 (Contract Validation & i18n Completeness)**: The admin copy error envelope strictly matches `{ code: string, message: string }` (both direct shape and `{ error: { code, message } }`). Every error code emitted by the admin copy path has a matching key in `src/i18n/errors.ts` and in both `messages/ar.json` and `messages/en.json` catalogues with distinct localized strings.
4. **AC4 (Client Localized Error Display in UI)**: The admin copy editor UI renders localized messages (`errors.REVISION_CONFLICT`, `errors.NETWORK`, `platformAdmin.copyEditor.stepUp`, `platformAdmin.copyEditor.saveError`, `platformAdmin.copyEditor.publishError`) matching the active locale (English LTR and Arabic RTL), never echoing raw server strings or unformatted client exceptions.
5. **AC5 (Post-Error UI Interactivity & Resilience)**: Following any error state, the admin page does not trigger Next.js error boundary takeover (`src/app/error.tsx`), the editor remains mounted, and write buttons remain clickable and re-executable without a page reload.
6. **AC6 (Test Execution & Exit Code 0)**: All relevant test suites (`vitest` unit, contract, component, and Playwright e2e) exit with code 0 on a clean tree.
7. **AC7 (Non-Admin 404 Localized Page)**: A non-admin navigating to `/admin/copy` observes the standard localized 404 page ("We couldn't find that page" / "لم نعثر على هذه الصفحة") rendered in the active locale and direction (LTR in English, RTL in Arabic), with no administrative controls or titles leaked.

---

## Verification Matrix

| AC | Verification Test | Execution Command | Exit Code | Observed Output / Evidence |
|:---|:---|:---|:---:|:---|
| **AC1** | `tests/unit/admin-copy-errors.test.ts` (11 tests) | `pnpm exec vitest run tests/unit/admin-copy-errors.test.ts --project unit` | `0` | `✓ admin copy error handling unit tests (#181) (11 tests) [11 passed]` |
| **AC2** | `tests/unit/admin-copy-errors.test.ts` | `pnpm exec vitest run tests/unit/admin-copy-errors.test.ts -t "500 response body contains no stack trace" --project unit` | `0` | `✓ 500 response body contains no stack trace, SQL fragment, or driver message` |
| **AC3** | `tests/contract/errors.test.ts` (12 tests) | `pnpm test:contract tests/contract/errors.test.ts` | `0` | `✓ admin copy error contract (#181) (5 tests) [12 passed overall]` |
| **AC3, AC4, AC5** | `tests/component/copy-editor.test.tsx` (28 tests) | `pnpm exec vitest run tests/component/copy-editor.test.tsx --project component` | `0` | `✓ CopyEditor error handling (#181) (28 tests) [28 passed]` |
| **AC1, AC2, AC3** | `tests/integration/platform-copy-errors.test.ts` (5 tests) | `pnpm test:integration tests/integration/platform-copy-errors.test.ts` | `0` | `✓ admin copy error flow, server to client (#181) (5 tests) [5 passed]` |
| **AC4, AC5, AC7** | `e2e/admin-panel.spec.ts` | `pnpm exec playwright test e2e/admin-panel.spec.ts --project=chromium --workers=1` | `0` | `4 passed (28.0s)` |
| **AC1, AC3, AC7** | `e2e-army/200-route-error-headers.e2e.ts` | `E2E_ARMY_URL=http://localhost:3100 pnpm e2e:army e2e-army/200-route-error-headers.e2e.ts` | `0` | `✓ @issue-181 AC1: every refusal ... reaches client as bounded JSON` <br> `✓ @issue-181 AC3: /admin/copy shows a non-admin the localized 404 page (Arabic RTL and English)` |
| **AC6** | Typecheck & Linting | `pnpm typecheck && pnpm lint` | `0` | `tsc --noEmit` and `eslint .` exited clean with zero errors |

---

## Changed Covering Tests
1. `tests/unit/admin-copy-errors.test.ts` (new):
   - Unit tests covering 401 (`unauthenticated`), 403 (`forbidden`), 404 (`not_found`), 500 (`INTERNAL`), 404 `NOT_FOUND` (per CREDENTIALS_DESIGN item 10), 401 `PLATFORM_REAUTH_REQUIRED`, 403 `PLATFORM_MFA_REQUIRED`, 500 body sanitization regex assertions, and `no-store` / `no-referrer` security headers.
2. `tests/contract/errors.test.ts` (extended):
   - Contract test asserting `{ code: string, message: string }` envelope schema.
   - Validation that all emitted admin copy server codes exist in `src/i18n/errors.ts` dictionary and in both `ar.json` and `en.json` catalogues.
3. `tests/component/copy-editor.test.tsx` (new):
   - Component test suite covering load errors with retry button, admin session me-load error, save/publish `REVISION_CONFLICT` with refetch, `NETWORK` error without blocking refetch, `STEP_UP_REQUIRED` step-up prompt, and 5xx server error handling in both English and Arabic.
   - Verification that all error keys exist in `ar.json` and `en.json` and Arabic text differs from English.
4. `tests/integration/platform-copy-errors.test.ts` (new):
   - Integration tests validating real route handlers connected directly to browser client `api()`: testing 404 `NOT_FOUND` for non-admins, `CROSS_SITE_REQUEST`, `CSRF_TOKEN_INVALID`, `UNSUPPORTED_MEDIA_TYPE`, `STEP_UP_REQUIRED`, `BODY_TOO_LARGE`, `REVISION_CONFLICT`, `RATE_LIMITED`, and 500 `INTERNAL`.
5. `e2e/admin-panel.spec.ts` (extended):
   - Playwright browser test verifying refused "Save draft" under network injection (`page.route`) for `REVISION_CONFLICT`, `STEP_UP_REQUIRED`, `INTERNAL`, and dropped connection (`NETWORK`) in English and Arabic RTL.
   - Browser test verifying that non-admin navigating to `/admin/copy` observes standard 404 page with no editor headings or titles leaked.
6. `e2e-army/200-route-error-headers.e2e.ts` (extended):
   - Natural-language `e2e-army` test verifying bounded JSON errors on `/api/platform/copy` and localized 404 page on `/admin/copy` in Arabic RTL and English LTR.

---

## UI Screenshots & Localization Evidence

| Scenario | Screenshot Name | Visual Verification Details |
|:---|:---|:---|
| **English LTR Revision Conflict** | `en-ltr-refusal-0.png` | Shows translated banner: `"This changed since you loaded it. Reload and try again."` above the editor with Save button enabled. |
| **English LTR Step-Up Required** | `en-ltr-refusal-1.png` | Shows translated warning: `"Confirm your identity in the admin panel before saving or publishing."` |
| **English LTR Internal 500** | `en-ltr-refusal-2.png` | Shows generic error: `"Could not save the draft. Check the text and refresh if it changed elsewhere."` No stack trace or SQL. |
| **English LTR Network Error** | `en-ltr-refusal-3.png` | Shows offline notice: `"Can't reach Flowline — check your connection and try again."` |
| **Post-Error Re-Click Interactivity** | `en-ltr-saved-after-refusal.png` | Demonstrates clicking "Save draft" after resolving refusal succeeds with `"Draft saved."` without page reload. |
| **Arabic RTL Network Error** | `ar-rtl-network.png` | Shows Arabic RTL layout (`dir="rtl"`) with translated text: `"تعذّر الوصول إلى Flowline — تحقّق من اتصالك ثم حاول مجددًا."` and `"حفظ في المسودة"` button active. |
| **English LTR Non-Admin 404** | `en-ltr-non-admin-404.png` | Shows non-admin visiting `/admin/copy` receiving `"We couldn't find that page"` and `"Go to my workspace"`. |
| **Arabic RTL Non-Admin 404** | `ar-rtl-non-admin-404.png` | Shows non-admin visiting `/admin/copy` in Arabic receiving `"لم نعثر على هذه الصفحة"` and `"الذهاب إلى مساحة عملي"`. |

---

## Regression Proof (Base vs Head)

- **Failure on Base (`origin/main` at `264336fb`)**:
  When running the copy editor save conflict scenario against `origin/main`'s `src/app/admin/copy/copy-editor.tsx`, `handleWriteError` lacked dedicated localization for `REVISION_CONFLICT` and `NETWORK`, falling back to the generic `saveError` string:
  ```
  Expected: "This changed since you loaded it. Reload and try again."
  Received: "Could not save the draft. Check the text and refresh if it changed elsewhere."
  Exit code: 1 (FAILED)
  ```
- **Pass on HEAD (`ai/181`)**:
  `copy-editor.tsx` maps `cause.code === "REVISION_CONFLICT"` to `t("errors.REVISION_CONFLICT")` and `cause.code === "NETWORK"` to `t("errors.NETWORK")`. The test passes with exact string matching and exit code 0.
