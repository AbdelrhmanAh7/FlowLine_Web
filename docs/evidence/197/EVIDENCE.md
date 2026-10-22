# Issue #197 Verification Report

Part 2/4 of #195: Account security page: enable MFA with secret, backup codes and code check.
Originating Sentry issue: None (feature work from Goal demo #150, FL G1 step 4, not an error report).

Tested code: branch `ai/197` (head commit `08b84fb5` and working tree).
Runs: 2026-10-21, local macOS, Node 26.10.0, pnpm 10.32.1.

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
| AC1 | `e2e/account-security.spec.ts` ("enable two-step verification from the account page", lines 114–120; "enable two-step verification in Arabic (RTL)", lines 237–245); `e2e-army/72-federated-mfa-failure-audit.e2e.ts` ("@issue-197 AC1: Enable asks for the account password and a wrong password shows an error and no secret", lines 102–113) | Exit 0: Shows password input labeled "Account password" / "كلمة مرور الحساب". Wrong password triggers error toast with `passwordInvalid` message and no secret is rendered. |
| AC2 | `e2e/account-security.spec.ts` (lines 121–130 and lines 246–255); `e2e-army/72-federated-mfa-failure-audit.e2e.ts` ("@issue-197 AC2: a correct password shows the manual secret and backup codes with the one-time warning", lines 120–133); `src/app/account/security/two-factor-card.tsx` | Exit 0: `[data-testid=totp-secret]` and `[data-testid=backup-codes]` have explicit `dir="ltr"` attribute in both LTR and RTL Arabic layouts; warning `[data-testid=backup-codes-warning]` is visible. |
| AC3 | `e2e/account-security.spec.ts` (lines 137–149); `e2e-army/72-federated-mfa-failure-audit.e2e.ts` ("@issue-197 AC3: a wrong 6-digit code shows an error and the status stays Off after reload", lines 135–148) | Exit 0: Submitting `000000` displays error toast "That code isn't valid. Try the current one." (`auth.twoFactorInvalid`); status badge stays "Off" / "غير مفعّل" (`data-state="off"`) after reload. |
| AC4 | `e2e/account-security.spec.ts` (lines 150–163 and lines 256–269); `tests/unit/account-security-page.test.ts` (line 33) | Exit 0: Submitting current `totpCodeFor(raw)` turns status badge to "On" / "مفعّل (نشط)" (`data-state="on"`), removes secret and backup code elements from DOM, and status persists across page reload. |
| AC5 | `e2e/account-security.spec.ts` (lines 105–113, 131–136, 165–202); `e2e-army/72-federated-mfa-failure-audit.e2e.ts` ("@issue-197 AC5: Cancel leaves the status Off and the secret hidden", lines 150–165); `src/app/account/security/two-factor-card.tsx` | Exit 0: Cancel button (`type="button"`) closes form without submitting request; `takeSecret` consumes and clears password input; no secret or codes in storage or URL. |
| AC6 | `tests/unit/i18n.test.ts` (16 tests for key parity); `tests/unit/account-security-page.test.ts` (11 tests for catalogue keys & logical CSS); `git diff origin/main..HEAD -- src/app/admin/setup/setup-flow.tsx` | Exit 0: 16/16 i18n tests passed; 11/11 account-security tests passed; `git diff` on `setup-flow.tsx` is completely empty (file untouched). |

## Changed Covering Tests

- `e2e/account-security.spec.ts`: covers full lifecycle of enabling MFA in English and Arabic RTL, wrong password, wrong code, valid code, reload persistence, cancellation race guards, and distinct API error messages.
- `e2e-army/72-federated-mfa-failure-audit.e2e.ts`: covers AC1, AC2, AC3, and AC5 under the 8-file hub cap.
- `tests/unit/account-security-page.test.ts`: validates i18n translations, active Arabic badge, standalone user guide documentation, and logical CSS rules.
- `tests/unit/api-error-shape.test.ts`: verifies top-level and nested API error parsing for `INVALID_PASSWORD` mapping.
- `tests/unit/i18n.test.ts`: confirms exact key parity between `messages/ar.json` and `messages/en.json`.
- `tests/unit/gate-groups.test.ts`: checks gate group registrations and spec assignments.
- `tests/unit/e2e-army-tooling.test.ts`: checks 8-file cap compliance and hygiene rules.

## Commands Executed and Observed Exit Codes

| Command | Exit Code | Result |
|---|---|---|
| `pnpm lint` (`eslint . --cache`) | 0 | Clean: 0 errors, 0 warnings |
| `pnpm typecheck` (`tsc --noEmit`) | 0 | Clean: 0 type errors |
| `pnpm vitest run tests/unit/account-security-page.test.ts` | 0 | 11 passed (11) |
| `pnpm vitest run tests/unit/api-error-shape.test.ts` | 0 | 3 passed (3) |
| `pnpm vitest run tests/unit/i18n.test.ts` | 0 | 16 passed (16) |
| `pnpm vitest run tests/unit/gate-groups.test.ts` | 0 | 8 passed (8) |
| `pnpm vitest run tests/unit/e2e-army-tooling.test.ts` | 0 | 12 passed (12) |
| `git diff origin/main..HEAD -- src/app/admin/setup/setup-flow.tsx` | 0 | Clean: 0 lines changed (untouched) |

## Regression / Mutation Verification

1. **Direction enforcement (`dir="ltr"` in RTL context)**:
   - Verified that `two-factor-card.tsx` enforces `dir="ltr"` on `<code data-testid="totp-secret">`, `<ul data-testid="backup-codes">`, and `<Input id="two-factor-code">`.
   - Explicit inline comments explain that TOTP secret keys, backup codes, and OTP codes are ASCII alphanumeric / numeric credentials that must be displayed and read left-to-right to prevent character transposition in RTL layouts.
2. **Cancellation button behavior**:
   - `type="button"` on Cancel buttons prevents form submit events from triggering empty enable/verify API requests.
3. **i18n key parity & deduplication**:
   - Removed duplicated `backupCodes` and `confirm` keys; single `backupCodesWarning` and `confirmButton` keys used consistently across `ar.json` and `en.json`.
   - Verified by `tests/unit/i18n.test.ts` (Exit 0).

## Screenshots (Present in `artifacts/phase-4/issue-196/`)

- `account-security-en-ltr.png`: English LTR UI with Two-step verification heading and Off status badge.
- `account-security-ar-rtl.png`: Arabic RTL UI with "الأمان" heading and "غير مفعّل" status badge at row end.
- `account-security-ar-on.png`: Arabic RTL UI with active "مفعّل (نشط)" status badge.
- `user-menu-ar-rtl.png`: Arabic workspace navigation showing the "الأمان" user menu entry.
