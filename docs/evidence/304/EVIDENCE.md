# Issue #304 Verification Report

Fresh restart of #197 (Account security page 2/4: enable MFA with secret, backup codes and code check, replaces #259).
Originating Sentry issue: None (feature work from Goal demo #150, FL G1 step 4, not an error report).

Tested code: branch `ai/304` (head commit: `4dd243e01ee438953ca5fa11c71922acbb0f07b7`).
Runs: 2026-10-22, local macOS, Node 26.10.0, pnpm 10.32.1.

## Acceptance Criteria

- **AC1:** While Off, **Enable** asks for the account password; a wrong password shows an error ("That password isn't valid. Try again." / "كلمة المرور غير صالحة. حاول مجددًا.") and no secret.
- **AC2:** A correct password shows the manual secret and the backup codes (both left-to-right via `dir="ltr"`, in Arabic too) with the "shown only once" warning.
- **AC3:** A wrong 6-digit code (`000000`) shows "That code isn't valid. Try the current one." (`auth.twoFactorInvalid`) and the status is still Off after a reload.
- **AC4:** The correct code turns the status On, hides the secret and backup codes, and the status remains On after a reload.
- **AC5:** Secrets stay out of URLs, browser storage and logs; the password input is cleared after submit (`takeSecret`); Cancel leaves the status Off.
- **AC6:** New strings exist in `ar.json` and `en.json` with identical keys; `setup-flow.tsx` is unchanged.

## Verification Mapping

| AC | Covering Tests / Commands | Observed Exit Code & Result |
|---|---|---|
| AC1 | `e2e/account-security.spec.ts` ("enable two-step verification from the account page", lines 97–104; "enable two-step verification in Arabic (RTL)", lines 196–203); `e2e-army/304-account-security.e2e.ts` ("@issue-304 AC1: Enable asks for the account password and a wrong password shows an error and no secret") | Exit 0: Password input is shown. Submitting an invalid password triggers error toast with `passwordInvalid` message and no secret is rendered. |
| AC2 | `e2e/account-security.spec.ts` (lines 106–114, lines 205–214); `e2e-army/304-account-security.e2e.ts` ("@issue-304 AC2: a correct password shows the manual secret and backup codes with the one-time warning"); `src/app/account/security/two-factor-card.tsx` | Exit 0: `[data-testid=totp-secret]` and `[data-testid=backup-codes]` have explicit `dir="ltr"` attribute in both LTR and RTL Arabic layouts; warning `[data-testid=backup-codes-warning]` is visible; secret is non-empty valid base32 string and backup codes count >= 8. |
| AC3 | `e2e/account-security.spec.ts` (lines 122–132); `e2e-army/304-account-security.e2e.ts` ("@issue-304 AC3: a wrong 6-digit code shows an error and the status stays Off after reload") | Exit 0: Submitting `000000` displays error toast "That code isn't valid. Try the current one." (`auth.twoFactorInvalid`); status badge stays "Off" / "غير مفعّل" (`data-state="off"`) after reload. |
| AC4 | `e2e/account-security.spec.ts` (lines 134–146, lines 216–229); `e2e-army/304-account-security.e2e.ts` ("@issue-304 AC4: a valid 6-digit TOTP code turns the status On and persists across reload") | Exit 0: Submitting valid `totpCodeFor(secret)` turns status badge to "On" / "مفعّل (نشط)" (`data-state="on"`), removes secret and backup code elements from DOM, and status persists across page reload. |
| AC5 | `e2e/account-security.spec.ts` (lines 89–95, lines 116–120, lines 149–181); `e2e-army/304-account-security.e2e.ts` ("@issue-304 AC5: Cancel leaves the status Off and the secret hidden"); `src/app/account/security/two-factor-card.tsx` | Exit 0: Cancel button (`type="button"`) closes form without submitting request; `takeSecret` consumes and clears password input; in-flight request cancellation guard increments `requestRef.current` preventing late responses from reopening the secret; no secret or codes in storage or URL. |
| AC6 | `tests/unit/i18n.test.ts` (16 tests for key parity); `tests/unit/account-security-page.test.ts` (24 tests for catalogue keys & logical CSS); `git diff origin/main..HEAD -- src/app/admin/setup/setup-flow.tsx` | Exit 0: 16/16 i18n tests passed; 24/24 account-security tests passed; `git diff` on `setup-flow.tsx` is completely empty (file untouched). |

## Changed Covering Tests

- `e2e/account-security.spec.ts`: covers full lifecycle of enabling MFA in English and Arabic RTL, wrong password, wrong code, valid code, reload persistence, cancellation race guards, and distinct API error messages.
- `e2e-army/304-account-security.e2e.ts`: dedicated natural-language e2e-army test file covering AC1, AC2, AC3, AC4, and AC5 with isolated fresh user sessions per test.
- `e2e-army/221-auth-isolation.e2e.ts`: consolidated auth isolation tests retaining both #221 and #72 while keeping top-level e2e-army file count at exactly 8.
- `tests/unit/account-security-page.test.ts`: validates i18n translations, active Arabic badge, standalone user guide documentation, and logical CSS rules.
- `tests/unit/api-error-shape.test.ts`: verifies top-level and nested API error parsing for `INVALID_PASSWORD` mapping.
- `tests/unit/i18n.test.ts`: confirms exact key parity between `messages/ar.json` and `messages/en.json`.
- `tests/unit/gate-groups.test.ts`: checks gate group registrations and spec assignments (`account-security` in `auth`).
- `tests/unit/e2e-army-tooling.test.ts`: checks 8-file cap compliance and hygiene rules.

## Commands Executed and Observed Exit Codes

| Command | Exit Code | Result |
|---|---|---|
| `pnpm lint` (`eslint . --cache`) | 0 | Clean: 0 errors, 0 warnings |
| `pnpm typecheck` (`tsc --noEmit`) | 0 | Clean: 0 type errors |
| `pnpm vitest run tests/unit/account-security-page.test.ts` | 0 | 24 passed (24) |
| `pnpm vitest run tests/unit/api-error-shape.test.ts` | 0 | 3 passed (3) |
| `pnpm vitest run tests/unit/i18n.test.ts` | 0 | 16 passed (16) |
| `pnpm vitest run tests/unit/gate-groups.test.ts` | 0 | 8 passed (8) |
| `pnpm vitest run tests/unit/e2e-army-tooling.test.ts` | 0 | 12 passed (12) |
| `git diff origin/main..HEAD -- src/app/admin/setup/setup-flow.tsx` | 0 | Clean: 0 lines changed (untouched) |

## Regression / Mutation Verification

1. **Direction enforcement (`dir="ltr"` in RTL context)**:
   - Verified that `two-factor-card.tsx` enforces `dir="ltr"` on `<code data-testid="totp-secret">`, `<ul data-testid="backup-codes">`, and `<Input id="two-factor-code">`.
   - Explicit inline comments explain that TOTP secret keys, backup codes, and OTP codes are ASCII alphanumeric / numeric credentials that must be displayed and read left-to-right to prevent character transposition in RTL layouts.
2. **Cancellation button behavior & race guard**:
   - `type="button"` on Cancel buttons prevents form submit events from triggering empty enable/verify API requests.
   - `requestRef.current += 1` in `cancel()` ensures an in-flight API response cannot reopen the secret or mutate state.
3. **Better-auth error mapping**:
   - `api()` in `src/lib/api.ts` parses better-auth's top-level `{ code, message }` body shape. Tested in `tests/unit/api-error-shape.test.ts` (failed on base, passed on head).
   - Only `err.code === "INVALID_PASSWORD"` is mapped to the password line; other 400 errors display their own server message via `apiErrorMessage(t, err)`.
4. **i18n key parity & deduplication**:
   - Consistent keys (`backupCodesWarning`, `confirmButton`, etc.) across `ar.json` and `en.json`.
   - Verified by `tests/unit/i18n.test.ts` and `tests/unit/account-security-page.test.ts` (Exit 0).

## Screenshots Reference

Playwright captures the following screenshots to `artifacts/phase-4/issue-304/`:
- `account-security-en-ltr.png`: English LTR UI with Two-step verification heading and Off status badge.
- `account-security-ar-rtl.png`: Arabic RTL UI with "الأمان" heading and "غير مفعّل" status badge at row end.
- `account-security-ar-on.png`: Arabic RTL UI with active "مفعّل (نشط)" status badge.
- `user-menu-ar-rtl.png`: Arabic workspace navigation showing the "الأمان" user menu entry.

## Post-Merge Revalidation on `origin/main` (head `232e2e2d`, PR #359) — 2026-10-27

Merged `origin/main` (`1eceed2b`) into HEAD at `232e2e2d`.
Investigated CI run `40409072812` where job `chromium` was cancelled during `setup-gate` after hitting the 5-minute fast-tier timeout. Confirmed root cause was a transient runner stall during Playwright browser dependencies installation on Ubuntu 24.04 (no test failure; `Run gate (chromium)` step was skipped due to the runner timeout).
Full local verification on merged HEAD:
- `pnpm typecheck` (tsc --noEmit): Exit 0, clean.
- `pnpm lint` (eslint): Exit 0, 0 errors, 0 warnings.
- `pnpm test` (vitest run --project unit): 154 passed test files, 1973 passed tests.
- `pnpm test:contract` (vitest run --project contract): 26 passed test files, 548 passed tests.
- `tests/unit/account-security-page.test.ts`: 24 passed (24).
- `tests/unit/api-error-shape.test.ts`: 3 passed (3).
- `tests/unit/gate-groups.test.ts`: 8 passed (8).
- `tests/unit/ci-workflows.test.ts`: 84 passed (84).
- `pnpm check:evidence`: Exit 0, 0 local secret hits.
- `git merge-base --is-ancestor origin/main HEAD`: Exit 0 (origin/main is ancestor of HEAD).
