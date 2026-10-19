# Issue #196 verification report

Part 1/4 of #195: account security page, user-menu link and read-only two-step verification status.
Originating Sentry issue: none (feature work from goal demo #150, FL G1 step 4, not an error report).

Tested code: branch `ai/196` (merged `origin/main` commit `264336fb`).
Runs: 2026-10-19, local macOS, Node 26, Chromium (Playwright), isolated stack on port 3100 with database `flowline_test`.

## Acceptance criteria

- **AC1:** Signed in as a regular (non-admin) user: user menu, Account, **Security** opens `/account/security`.
- **AC2:** The page shows "Two-step verification" with **Off** for a user without MFA and **On** for a user whose `twoFactorEnabled` is true.
- **AC3:** A signed-out visit to `/account/security` redirects to `/sign-in`.
- **AC4:** Every new string exists in `ar.json` and `en.json` with identical keys; the layout uses logical CSS (`ms/me/start/end`) so it is correct in RTL.
- **AC5:** No change to `src/app/admin/setup/setup-flow.tsx`, the auth library setup, workflows/CI or the DB schema.

## Verification mapping

| AC | Covering tests / commands | Observed exit code & result |
|---|---|---|
| AC1 | `e2e/account-security.spec.ts` ("user menu opens the security page and shows the two-step status"); army: `e2e-army/85-sign-in-and-core-flow.e2e.ts` ("@issue-196 AC1"), `e2e-army/features/ui-flows.e2e.ts` ("[fl-workspace-nav.3]") | Exit 0: Playwright passed in 6.3s. Screenshot `user-menu-ar-rtl.png` verifies the "الأمان" item in the Account group. |
| AC2 | `e2e/account-security.spec.ts` (Off initially, then TOTP enabled via `/api/auth/two-factor/enable` + `verify-totp`, reload, On) | Exit 0: Playwright passed. Shows heading "Two-step verification" and badge "Off", then "On" after MFA enrollment. |
| AC3 | `e2e/account-security.spec.ts` ("a signed-out visit to the security page redirects to sign-in"); army: `e2e-army/109-account-delete-shared-audit.e2e.ts` ("@issue-196 AC3"), `e2e-army/features/core-api.e2e.ts` ("[fl-email-flows.7]") | Exit 0: Playwright passed in 634ms (`GET /account/security 307` redirect to `/sign-in 200`). |
| AC4 | `e2e/account-security.spec.ts` ("the security page renders in Arabic with RTL layout"); `tests/unit/account-security-page.test.ts` (10 tests); `tests/unit/i18n.test.ts` (16 tests ar/en key parity); army: `e2e-army/85-sign-in-and-core-flow.e2e.ts` ("@issue-196 AC4"); screenshots EN/LTR and AR/RTL | Exit 0: Playwright passed in 1.4s; unit tests 34/34 passed. Arabic `dir=rtl`, heading "الأمان", "التحقق بخطوتين", badge "غير مفعّل" at row end. Mutation check below. |
| AC5 | `git diff --name-only origin/main...HEAD \| grep -E "setup-flow\|\.github\|src/db/schema\|drizzle/\|src/server/auth\|src/lib/auth"` | Exit 1 (no forbidden files matched). |

## Changed covering tests

- `e2e/account-security.spec.ts` (new): AC1, AC2, AC3, AC4 (user menu navigation, Off/On status badge, signed-out redirect, and explicit Arabic RTL layout assertion).
- `tests/unit/account-security-page.test.ts` (new): AC4 (checks each key is in `ar.json` and `en.json`, Arabic text in `ar`, no physical `text-left`/`mr-`/`ml-` classes).
- `e2e-army/85-sign-in-and-core-flow.e2e.ts`: "@issue-196 AC1" (`feat:fl-workspace-nav`) and "@issue-196 AC4" (`feat:fl-i18n-rtl`).
- `e2e-army/109-account-delete-shared-audit.e2e.ts`: "@issue-196 AC3" (`feat:fl-email-flows`).
- `e2e-army/features/ui-flows.e2e.ts` "[fl-workspace-nav.3]".
- `e2e-army/features/core-api.e2e.ts` "[fl-email-flows.7]".
- `scripts/gate-groups.mjs`: `account-security` spec assigned to the `auth` group.

Feature map (`node src/lib/featurecov.ts map FlowLine_Web <changed files>` in the hub): `fl-i18n-rtl`, `fl-email-flows`, `fl-workspace-nav`, no unmapped files; each has a tagged army test above.

## Commands and results (executed this session)

| Command | Exit Code | Result |
|---|---|---|
| `FLOWLINE_BETA_MODE=invite_only pnpm test:e2e e2e/account-security.spec.ts --project=chromium --workers=1` | 0 | 3 passed (12.2s) |
| `pnpm vitest run --project unit tests/unit/account-security-page.test.ts tests/unit/i18n.test.ts tests/unit/gate-groups.test.ts` | 0 | 34 passed (34) |
| same, with `text-left` in page and `shell.userMenu.security` removed from `ar.json` (reverted) | 1 | 2 failed / 8 passed (regression test red verification) |
| `pnpm typecheck` (`tsc --noEmit`) | 0 | clean, 0 errors |
| `pnpm eslint src/app/account/security/page.tsx src/components/shell/app-shell.tsx e2e/account-security.spec.ts tests/unit/account-security-page.test.ts e2e-army/85-sign-in-and-core-flow.e2e.ts e2e-army/109-account-delete-shared-audit.e2e.ts e2e-army/features/core-api.e2e.ts e2e-army/features/ui-flows.e2e.ts` | 0 | clean, 0 warnings/errors |

## Screenshots (Playwright, captured in this session, present in `artifacts/phase-4/issue-196/`)

- `account-security-en-ltr.png` (19 KB): English LTR (`dir="ltr"`), title "Security", subtitle "Two-step verification", status badge "Off" on right.
- `account-security-ar-rtl.png` (18 KB): Arabic RTL (`dir="rtl"`), title "الأمان", subtitle "التحقق بخطوتين", status badge "غير مفعّل" on left (row end).
- `user-menu-ar-rtl.png` (81 KB): Arabic workspace navigation with open UserMenu showing "الأمان" in the "الحساب" section above "إعادة إرسال التأكيد" and "حذف الحساب".

## QA & Review findings addressed

1. **`docs/implementation/BETA_USER_GUIDE.md`**: Section 7 remains strictly "Privacy", and a dedicated numbered item `8. **Account, Security:** (user menu) shows whether two-step verification is on or off; turning it on or off from this page is coming soon.` is added before Help.
2. **`e2e/account-security.spec.ts`**: Added explicit test case `the security page renders in Arabic with RTL layout` asserting `lang="ar"`, `dir="rtl"`, and Arabic copy `الأمان`, `التحقق بخطوتين`, `غير مفعّل`.
3. **`scripts/gate-groups.mjs`**: Confirmed `account-security` is cleanly assigned to the `auth` group manifest without unnecessary comments.
4. **`src/app/account/security/page.tsx` & i18n keys**: Verified Arabic status badge copy ("مفعّل" / "غير مفعّل") is concise and idiomatic for `StatusBadge` tone indicators, strictly synchronized with `messages/en.json` ("On" / "Off").
5. **e2e-army model output issue on prior runs**: Identified provider cooldown fallback to Claude Haiku which failed `generateObject` schema parsing; confirmed `gemini-3.5-flash` endpoint is active and responsive.
