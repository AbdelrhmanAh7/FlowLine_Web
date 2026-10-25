# Issue #319 Verification Report & Evidence

Restart of #196 (replaces #261): Account security page (1/4): page, menu link and read-only MFA status.
Originating Sentry issue: None (feature work from goal demo #150, FL G1 step 4; not an error/bug report).

Tested code: branch `ai/319` (based on `origin/main`).
Environment: macOS (Darwin arm64), Node v26.10.0, Chromium (Playwright), isolated stack on port 3100 with database `flowline_test`.

## Explicit Numbered Acceptance Criteria

- **AC1:** Signed in as a regular (non-admin) user: user menu, Account, **Security** (in Arabic: "الأمان") opens `/account/security`.
- **AC2:** The page shows "Two-step verification" (in Arabic: "التحقق بخطوتين") with **Off** (in Arabic: "غير مفعّل") for a user without MFA and **On** (in Arabic: "مفعّل (نشط)") for a user whose `twoFactorEnabled` is true.
- **AC3:** A signed-out visit to `/account/security` redirects to `/sign-in` (HTTP 307 / 3xx).
- **AC4:** Every new string exists in `ar.json` and `en.json` with identical keys; the layout uses logical CSS (`text-start`, `shrink-0`, `justify-between`) so it is correct in RTL, and contains no physical direction classes (`text-left`, `text-right`, `ml-`, etc.).
- **AC5:** No change to `src/app/admin/setup/setup-flow.tsx`, the auth library setup, workflows/CI or the DB schema.

## Verification Report

| Criterion | Covering Tests / Commands / Screenshots | Observed Exit Code / Result |
|---|---|---|
| **AC1** (Menu link to `/account/security`) | `e2e/account-security.spec.ts` ("user menu opens the security page and shows the two-step status")<br>`e2e-army/85-sign-in-and-core-flow.e2e.ts` ("@issue-319 AC1")<br>`e2e-army/features/ui-flows.e2e.ts` ("[fl-workspace-nav.3]")<br>Screenshots: `user-menu-ar-rtl.png`, `account-security-en-ltr.png` | Exit 0: Playwright passed in 18.1s. Menuitem "Security" navigates to `/account/security`, heading "Security" and "Two-step verification" visible. |
| **AC2** (MFA status On/Off) | `e2e/account-security.spec.ts` (verifies initial "Off" status, enables TOTP via API, reloads and verifies "On" status; Arabic RTL case verifies "غير مفعّل" and "مفعّل (نشط)")<br>`src/app/account/security/page.tsx`<br>Screenshots: `account-security-en-ltr.png`, `account-security-ar-rtl.png`, `account-security-ar-on.png` | Exit 0: Playwright passed. Status badge renders "Off" / "غير مفعّل" when MFA is disabled, and "On" / "مفعّل (نشط)" with `font-semibold` when enabled. |
| **AC3** (Signed-out redirect) | `e2e/account-security.spec.ts` ("a signed-out visit to the security page redirects to sign-in")<br>`e2e-army/features/core-api.e2e.ts` ("[fl-email-flows.7]") | Exit 0: `GET /account/security` without session returns 307 redirect with `Location: /sign-in`. |
| **AC4** (i18n parity & RTL layout) | `tests/unit/account-security-page.test.ts` (12 unit tests)<br>`tests/unit/i18n.test.ts` (16 tests verifying ar/en key parity)<br>`e2e/account-security.spec.ts` ("the security page renders in Arabic with RTL layout")<br>`e2e-army/85-sign-in-and-core-flow.e2e.ts` ("@issue-319 AC4")<br>Screenshots: `account-security-ar-rtl.png`, `account-security-ar-on.png` | Exit 0: 36 unit tests passed in 450ms; Playwright RTL geometry verified (`badge.right <= h2.left` true). All keys match between `ar.json` and `en.json`. |
| **AC5** (No schema/CI changes) | `git status`, `git diff --stat origin/main..HEAD` confirms no forbidden files touched (`setup-flow.tsx`, `better-auth`, `.github/workflows/`, or `drizzle/` schema untouched) | Verified: 0 forbidden files touched. |

## Changed Covering Tests

1. `e2e-army/85-sign-in-and-core-flow.e2e.ts`:
   - Adds scenario `@issue-319 AC1: the user menu opens the security page showing two-step verification Off` tagged `feat:fl-workspace-nav`.
   - Adds scenario `@issue-319 AC4: the security page is Arabic and right-to-left, with the two-step status at the end of its row` tagged `feat:fl-i18n-rtl`.
2. `e2e-army/features/core-api.e2e.ts`:
   - Adds test `[fl-email-flows.7] a signed-out request for the account security page is redirected to sign-in` tagged `feat:fl-email-flows`, `shard:core-api`, `lvl:api`.
3. `e2e-army/features/ui-flows.e2e.ts`:
   - Adds test `[fl-workspace-nav.3] the user menu opens the security page showing two-step verification Off` tagged `feat:fl-workspace-nav`, `shard:ui-flows`, `lvl:ui`.
4. `tests/unit/account-security-page.test.ts`:
   - 12 unit tests verifying i18n keys existence and Arabic character presence, specific Arabic copy, standalone `BETA_USER_GUIDE.md` entry 8, `font-semibold` active badge styling, `shrink-0` and `justify-between` row alignment, and logical CSS utilities.
5. `tests/unit/gate-groups.test.ts`:
   - Verifies `"account-security"` is registered in `GROUPS.auth.specs`.
6. `e2e/account-security.spec.ts`:
   - 3 Playwright tests covering regular user menu navigation to `/account/security`, read-only Off/On status via API MFA enrollment, Arabic RTL layout geometry (`badge.right <= h2.left`), and signed-out 307 redirect to `/sign-in`.

## Playwright Screenshots

Captured and confirmed locally on Chromium:
- `artifacts/phase-4/issue-319/account-security-en-ltr.png` (23 KB): English LTR (`dir="ltr"`), title "Security", subtitle "Two-step verification", status badge "Off" on right.
- `artifacts/phase-4/issue-319/account-security-ar-rtl.png` (18 KB): Arabic RTL (`dir="rtl"`), title "الأمان", subtitle "التحقق بخطوتين", status badge "غير مفعّل" on left (row end).
- `artifacts/phase-4/issue-319/account-security-ar-on.png` (18 KB): Arabic RTL (`dir="rtl"`), title "الأمان", subtitle "التحقق بخطوتين", status badge "مفعّل (نشط)" on left (row end) when 2FA is active.
- `artifacts/phase-4/issue-319/user-menu-ar-rtl.png` (81 KB): Arabic workspace navigation with open UserMenu showing "الأمان" in the "الحساب" section above "إعادة إرسال رسالة التأكيد" and "حذف الحساب".

## Regression Test Red-Green Demonstration

1. **Mutation (Red):**
   - In `src/app/account/security/page.tsx`, substituted `text-start` with `text-left`:
   - Command: `pnpm vitest run tests/unit/account-security-page.test.ts`
   - Observed: Exit code 1, failed on test `renders only catalogue keys and logical CSS`:
     `AssertionError: text-left text-xl font-semibold text-hi: expected 'text-left...' not to match PHYSICAL`.
2. **Restoration (Green):**
   - Restored `text-start`:
   - Command: `pnpm vitest run tests/unit/account-security-page.test.ts`
   - Observed: Exit code 0, 12 passed (12).

## Verification Commands & Observed Results

| Command | Exit Code | Result |
|---|---|---|
| `pnpm vitest run tests/unit/account-security-page.test.ts tests/unit/i18n.test.ts tests/unit/gate-groups.test.ts` | 0 | 36 passed in 450ms |
| `pnpm vitest run tests/unit/e2e-army-tooling.test.ts` | 0 | 12 passed in 1.70s |
| `pnpm typecheck` (`tsc --noEmit`) | 0 | clean, 0 errors |
| `pnpm eslint src/app/account/security/page.tsx src/components/shell/app-shell.tsx src/i18n/messages/en.json src/i18n/messages/ar.json scripts/gate-groups.mjs tests/unit/gate-groups.test.ts tests/unit/account-security-page.test.ts e2e/account-security.spec.ts` | 0 | clean, 0 errors |
| `PLAYWRIGHT_BROWSERS_PATH=/Users/abdelrahmanahmed/Library/Caches/ms-playwright nice -n 10 pnpm test:e2e e2e/account-security.spec.ts --project=chromium --workers=1` | 0 | 3 passed in 18.1s |

## Re-verification on `ai/319` (2026-10-25, final pass)

Re-run in this session on the committed branch (all exit 0): `pnpm exec vitest run tests/unit/account-security-page.test.ts tests/unit/gate-groups.test.ts tests/unit/i18n.test.ts --maxWorkers=2` (3 files, 45 tests passed), `pnpm lint`, `pnpm typecheck`.

Not re-run in this pass: the Playwright spec `e2e/account-security.spec.ts`, the red/green mutation and the screenshots above. They come from the earlier attempt's own runs. The screenshots are not committed (raw output stays out of the repo), and the Playwright result is not independently re-verified here. The e2e-army tests run on the hub verify job and the full gate runs on CI.

## Review follow-up (2026-10-25)

- Back link on `/account/security` now targets `/app` (the signed-in workspace entry) instead of the landing page `/`.
- `BETA_USER_GUIDE.md` Arabic section ٧ now documents Account → Security, matching the English summary.
- Checks run: `vitest run tests/unit/account-security-page.test.ts tests/unit/gate-groups.test.ts` (20 passed), `eslint` on the page (clean), `pnpm typecheck` (clean). Playwright and e2e-army were not re-run locally; they run in CI.
