# Issue #196 verification report

Part 1/4 of #195: account security page, user-menu link and read-only two-step verification status.
Originating Sentry issue: none (feature work from goal demo #150, not an error report).

Tested code: branch `ai/196` at `99639745` (page, menu, catalogues and tests unchanged since; this file is the only later change).
Runs: 2026-10-18, local macOS, Node 26, Chromium (Playwright), isolated stack on port 3196 with database `flowline_test_196`.

## Acceptance criteria

- **AC1:** Signed in as a regular (non-admin) user: user menu, Account, **Security** opens `/account/security`.
- **AC2:** The page shows "Two-step verification" with **Off** for a user without MFA and **On** for a user whose `twoFactorEnabled` is true.
- **AC3:** A signed-out visit to `/account/security` redirects to `/sign-in`.
- **AC4:** Every new string exists in `ar.json` and `en.json` with identical keys; the layout uses logical CSS (`ms/me/start/end`) so it is correct in RTL.
- **AC5:** No change to `src/app/admin/setup/setup-flow.tsx`, the auth library setup, workflows/CI or the DB schema.

## Verification mapping

| AC | Covering tests / commands | Observed |
|---|---|---|
| AC1 | `e2e/account-security.spec.ts` "user menu opens the security page and shows the two-step status"; army: `e2e-army/85-sign-in-and-core-flow.e2e.ts` "@issue-196 AC1", `e2e-army/features/ui-flows.e2e.ts` "[fl-workspace-nav.3]" | Playwright run 2: passed. Army tests run in the hub's verify job (not run locally). Screenshot `user-menu-ar-rtl.png` shows the "الأمان" item under "الحساب". |
| AC2 | same Playwright case: Off first, then TOTP enabled through `/api/auth/two-factor/enable` + `verify-totp`, reload, On | Playwright run 2: passed (Off, then On) |
| AC3 | `e2e/account-security.spec.ts` "a signed-out visit to the security page redirects to sign-in"; army: `e2e-army/109-account-delete-shared-audit.e2e.ts` "@issue-196 AC3", `e2e-army/features/core-api.e2e.ts` "[fl-email-flows.7]" | Playwright runs 1 and 2: passed |
| AC4 | `tests/unit/account-security-page.test.ts` (new); `tests/unit/i18n.test.ts` (ar/en key parity); army `e2e-army/85-…` "@issue-196 AC4" (Arabic, `dir=rtl`, badge at the row's end) tagged `feat:fl-i18n-rtl`; screenshots EN/LTR and AR/RTL | unit 10/10 exit 0; i18n 16/16 exit 0; mutation check below |
| AC5 | `git diff --name-only origin/main...HEAD \| grep -E "setup-flow\|\.github\|src/db/schema\|drizzle/\|src/server/auth\|src/lib/auth"` | no match (grep exit 1) |

## Changed covering tests

- `e2e/account-security.spec.ts` (new): AC1, AC2, AC3.
- `tests/unit/account-security-page.test.ts` (new): AC4. Each new key is a string in ar (Arabic text) and en, the page renders only those keys, and its classes contain no physical left/right utilities.
- `e2e-army/85-sign-in-and-core-flow.e2e.ts`: "@issue-196 AC1" (`feat:fl-workspace-nav`) and "@issue-196 AC4" (`feat:fl-i18n-rtl`, model-free).
- `e2e-army/109-account-delete-shared-audit.e2e.ts`: "@issue-196 AC3" (`feat:fl-email-flows`, request level).
- `e2e-army/features/ui-flows.e2e.ts` "[fl-workspace-nav.3]", `e2e-army/features/core-api.e2e.ts` "[fl-email-flows.7]".
- `scripts/gate-groups.mjs`: `account-security` added to the `auth` group (additive only).

Feature map (`node src/lib/featurecov.ts map FlowLine_Web <changed files>` in the hub): `fl-i18n-rtl`, `fl-email-flows`, `fl-workspace-nav`, no unmapped files; each has a tagged army test above.

## Commands and results (this session)

| Command | Result |
|---|---|
| `vitest run --project unit tests/unit/account-security-page.test.ts` | 10 passed, exit 0 |
| same, with `text-left` in the page and `shell.userMenu.security` removed from `ar.json` (reverted afterwards) | 2 failed / 8 passed, exit 1 |
| `vitest run --project unit tests/unit/i18n.test.ts` | 16 passed, exit 0 |
| `vitest run --project unit tests/unit/e2e-army-tooling.test.ts` | 12 passed, exit 0 |
| `pnpm typecheck` | exit 0 |
| `eslint` on every changed source/test file | exit 0 |

## Playwright runs

Run 1 (`playwright test e2e/account-security.spec.ts <temporary screenshot spec> --project=chromium --workers=1`, stack without `FLOWLINE_BETA_MODE`):
signed-out redirect passed; screenshots passed; the menu case timed out at the click on the "E2E User" button because Next's dev
"1 Issue" badge covered it. The one issue was the server log "FLOWLINE_BETA_MODE is missing or invalid" (`src/server/beta.ts`, printed
once per process), which hit this spec because it was the first render on a fresh stack. That is a local environment gap, not a page defect.
The test was not changed.

Run 2 (same spec, `FLOWLINE_BETA_MODE=invite_only`): 2 passed (38.7 s), exit 0: the menu case (Off, then On after TOTP enable + verify) in 9.5 s; the signed-out case in 6.2 s (`GET /account/security 307`, then `/sign-in 200` in the stack log).

## Screenshots (Playwright, attached to the PR, not committed)

- `account-security-en-ltr.png`: English, `dir=ltr`: "Security", "Two-step verification" at the start (left), "Off" badge at the end (right).
- `account-security-ar-rtl.png`: Arabic, `dir=rtl`: "الأمان", "التحقق بخطوتين" at the start (right), "غير مفعّل" at the end (left).
- `user-menu-ar-rtl.png`: Arabic user menu with "الأمان" under "الحساب", above "إعادة إرسال رسالة التأكيد".

## Hub verify findings answered

- 51bbefd e2e-army: the 3 failures were hub-suite tests (`tests/FlowLine_Web.e2e.ts`), all `MODEL_OUTPUT_INVALID` from the last-resort model
  after their `agent.act` steps passed. No product change is needed for them.
- QA rounds 5–6 (a1d83cd): `shell.userMenu.security` and `meta.accountSecurity` exist in `ar.json`, and the page uses `text-start`, not
  `text-left`; `tests/unit/account-security-page.test.ts` now fails if either regresses (mutation row above).
