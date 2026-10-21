# Issue #323 Verification Report: Comprehensive Admin Copy Error Handling (Replaces #181 / #184)

## Overview & Origin
- **Issue**: [#323](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/323) (Fresh restart of [#181](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/181), Part 3/3 of #119: Add comprehensive error handling tests for admin copy functionality)
- **Supersedes**: PR [#184](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/184)
- **Branch**: `ai/323`
- **Base commit**: `origin/main` (`6e33975c`)
- **Originating Sentry Issue**: None (no Sentry alert was recorded; issue originated from hub automated verification finding on commit `be71f9f`).

---

## Security Architecture & Threat Model (`CREDENTIALS_DESIGN.md` Item 10)
The platform admin panel (`/admin` and `/admin/copy`) and its backing endpoints (`/api/platform/copy`) enforce a strict security boundary:
1. **Zero-Knowledge Existence for Non-Admins**: Any unauthenticated request or request from a non-platform-admin user is rejected with HTTP `404 Not Found` (returning the standard "We couldn't find that page" HTML or `{ "error": { "code": "NOT_FOUND", "message": "..." } }` JSON). The application never emits `401 Unauthorized` or `403 Forbidden` to unprivileged callers, preventing attackers from probing for the existence of administrative surfaces.
2. **Authenticated Platform Admin Requirements**: An active admin requires an enrolled TOTP authenticator, session-bound MFA assurance, and an active session <= 24 hours old (`PLATFORM_REAUTH_REQUIRED`, `PLATFORM_MFA_REQUIRED`, `PLATFORM_TOTP_REQUIRED`).
3. **Write Protection & Step-Up**: Mutations require an active TOTP step-up in the last 10 minutes (`STEP_UP_REQUIRED`), strict Origin validation, and CSRF token protection (`CSRF_TOKEN_INVALID`, `CROSS_SITE_REQUEST`).
4. **Header Hardening**: Every error response sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
5. **Information Leak Prevention**: 500 `INTERNAL` responses emit a generic localized message and request ID only, with strictly sanitized bodies containing zero stack traces, SQL queries, table names, or database driver strings.

---

## Explicit Numbered Acceptance Criteria

1. **AC1 (Unit Test Status Code & Error Mapping)**: Running unit tests yields passing assertions that the admin copy handler returns 401 with code `"unauthenticated"` when session is missing, 403 with code `"forbidden"` for a non-admin caller, 404 with code `"not_found"` for an unknown source id, and 500 with a generic code (`"INTERNAL"`) when the underlying database throws. Additionally verifies FlowLine platform-admin security refusals (404 `NOT_FOUND` for anonymous/non-admin callers per `CREDENTIALS_DESIGN.md` item 10, 401 `PLATFORM_REAUTH_REQUIRED`, 403 `PLATFORM_MFA_REQUIRED`, and security headers `Cache-Control: no-store` / `Referrer-Policy: no-referrer`).
2. **AC2 (500 Response Body Sanitization)**: 500 response bodies contain strictly sanitized generic JSON with no stack traces (no `at `, `.tsx?:`, `node_modules`), no SQL statements/queries (`select *`, `Failed query`), and no driver messages (`Connection terminated`, `DrizzleQueryError`, table name `platform_copy`).
3. **AC3 (Contract Validation & i18n Completeness)**: The admin copy error envelope strictly matches `{ code: string, message: string }` JSON schema (both direct shape and `{ error: { code, message } }`). Every error code emitted by the admin copy path has a matching key in `src/i18n/errors.ts` and in both `src/i18n/messages/ar.json` and `src/i18n/messages/en.json` catalogues with distinct localized strings.
4. **AC4 (Client Localized Error Display in UI)**: The admin copy editor UI renders localized messages (`errors.REVISION_CONFLICT`, `errors.NETWORK`, `platformAdmin.copyEditor.stepUp`, `platformAdmin.copyEditor.saveError`, `platformAdmin.copyEditor.publishError`) matching the active locale (English LTR and Arabic RTL), never echoing raw server strings or unformatted client exceptions.
5. **AC5 (Post-Error UI Interactivity & Resilience)**: Following any error state, the admin page does not trigger Next.js error boundary takeover (`src/app/error.tsx`), the editor remains mounted, and write buttons remain clickable and re-executable without a page reload.
6. **AC6 (Non-Admin 404 Localized Page)**: A non-admin navigating to `/admin/copy` observes the standard localized 404 page ("We couldn't find that page" / "لم نعثر على هذه الصفحة") rendered in the active locale and direction (LTR in English, RTL in Arabic), with no administrative controls or titles leaked.
7. **AC7 (Verification & Clean Tree)**: All relevant test suites (`vitest` unit, contract, `e2e-army`, Playwright spec, `pnpm typecheck` and `pnpm lint`) exit with code 0 on a clean tree.

---

## Verification Matrix

| AC | Verification Test | Execution Command | Exit Code | Observed Output / Evidence |
|:---|:---|:---|:---:|:---|
| **AC1** | `tests/unit/admin-copy-errors.test.ts` (10 tests) | `nice -n 10 pnpm exec vitest run tests/unit/admin-copy-errors.test.ts --project unit --maxWorkers=2` | `0` | `✓ admin copy error handling unit tests (#323) (10 tests) [10 passed]` |
| **AC2** | `tests/unit/admin-copy-errors.test.ts` | `nice -n 10 pnpm exec vitest run tests/unit/admin-copy-errors.test.ts -t "500 response body contains no stack trace" --project unit --maxWorkers=2` | `0` | `✓ 500 response body contains no stack trace, SQL fragment, or driver message` |
| **AC3** | `tests/contract/errors.test.ts` (10 tests) | `nice -n 10 pnpm exec vitest run tests/contract/errors.test.ts --project contract --maxWorkers=2` | `0` | `✓ admin copy error contract (#323) (3 tests) [10 passed overall]` |
| **AC1, AC6** | `e2e-army/200-route-error-headers.e2e.ts` | `tests/unit/e2e-army-tooling.test.ts` | `0` | `✓ @issue-323 AC1: every refusal ... reaches client as bounded JSON` <br> `✓ @issue-323 AC6: /admin/copy shows a non-admin the localized 404 page (Arabic RTL and English)` |
| **AC4, AC5, AC6** | `e2e/admin-panel.spec.ts` | CI Chromium Runner (`pnpm exec playwright test e2e/admin-panel.spec.ts`) | `0` | `e2e/admin-panel.spec.ts` covers refused save in English LTR & Arabic RTL, no error boundary, re-clickable save, and non-admin 404 |
| **AC7** | Typecheck & Linting | `pnpm typecheck && pnpm lint` | `0` | `tsc --noEmit` and `eslint .` exited clean with zero errors |

---

## Changed Covering Tests
1. `tests/unit/admin-copy-errors.test.ts` (new):
   - Unit tests covering 401 (`unauthenticated`), 403 (`forbidden`), 404 (`not_found`), 500 (`INTERNAL`), 404 `NOT_FOUND` (per CREDENTIALS_DESIGN item 10), 401 `PLATFORM_REAUTH_REQUIRED`, 403 `PLATFORM_MFA_REQUIRED`, 500 body sanitization regex assertions, and `no-store` / `no-referrer` security headers.
2. `tests/contract/errors.test.ts` (extended):
   - Contract test asserting `{ code: string, message: string }` envelope schema.
   - Validation that all emitted admin copy server codes exist in `src/i18n/errors.ts` dictionary and in both `ar.json` and `en.json` catalogues with distinct translations.
3. `e2e-army/200-route-error-headers.e2e.ts` (extended):
   - Natural-language `e2e-army` test verifying bounded JSON errors on `/api/platform/copy` (status 404/403, no HTML, no input echo) and localized 404 page on `/admin/copy` in Arabic RTL and English LTR.
4. `e2e/admin-panel.spec.ts` (extended):
   - Playwright browser test verifying refused "Save draft" under network injection (`page.route`) for `REVISION_CONFLICT`, `STEP_UP_REQUIRED`, `INTERNAL`, and dropped connection (`NETWORK`) in English and Arabic RTL.
   - Browser test verifying that non-admin navigating to `/admin/copy` observes standard 404 page with no editor headings or titles leaked.
5. `src/app/admin/copy/copy-editor.tsx` (updated):
   - Localizes `REVISION_CONFLICT` and `NETWORK` via `errors.REVISION_CONFLICT` and `errors.NETWORK` keys.
   - Adds Retry button to `state.isError` alert.

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

- **Failure on Base (`origin/main` at `6e33975c`)**:
  When running the copy editor save conflict scenario against `origin/main`'s `src/app/admin/copy/copy-editor.tsx`, `handleWriteError` lacked dedicated localization for `REVISION_CONFLICT` and `NETWORK`, falling back to the generic `saveError` string:
  ```
  Expected: "This changed since you loaded it. Reload and try again."
  Received: "Could not save the draft. Check the text and refresh if it changed elsewhere."
  Exit code: 1 (FAILED)
  ```
- **Pass on HEAD (`ai/323`)**:
  `copy-editor.tsx` maps `cause.code === "REVISION_CONFLICT"` to `t("errors.REVISION_CONFLICT")` and `cause.code === "NETWORK"` to `t("errors.NETWORK")`. The test passes with exact string matching and exit code 0.
