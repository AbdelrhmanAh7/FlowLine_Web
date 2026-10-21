# Verification Evidence for Issue #199 (PR #262)

## Goal
Account security page (4/4): disable MFA, sign-in journey test and Arabic/RTL check.

## Tested Environment
- Commit SHA: `HEAD` on branch `ai/199`
- Operating System: macOS (Darwin 24.6.0)
- Node engine: v26.10.0, pnpm 10.32.1
- PostgreSQL: `127.0.0.1:5432` (`flowline_test`)
- Test stack: port `3100`

---

## Numbered Acceptance Criteria

1. **AC1: Disable action and status persistence**: The "Disable" button is shown only while two-step verification is On. Clicking Disable opens a password form. A wrong password shows an error (`That password isn't correct.`) and leaves two-step verification On. The correct password issues a POST to `/api/auth/two-factor/disable` with `{ password }`, displays a success toast (`Two-step verification is off.`), and turns status Off (persisting after reload).
2. **AC2: Sign-in journey prompt & validation**: After enabling MFA in the UI, signing out and signing in with email and password displays the "Two-step verification" prompt (`src/app/(auth)/auth-form.tsx`). Submitting `000000` is rejected with `That code isn't valid. Try the current one.`, and submitting the current valid 30-second window TOTP code successfully completes authentication.
3. **AC3: Sign-in after disable**: After disabling two-step verification, signing out and signing back in requires only email and password, displaying no two-step verification prompt.
4. **AC4: Arabic / RTL layout**: Navigating to `/account/security` with Arabic locale sets `<html lang="ar" dir="rtl">`. The TOTP secret, backup codes, and code inputs retain `direction: ltr`. The page and enrolment dialogs have no horizontal scroll across 375px and 1280px viewports. Section ٧ of `docs/implementation/BETA_USER_GUIDE.md` includes matching Arabic user instructions.
5. **AC5: Cancel and concurrency safety**: All Cancel controls use explicit `type="button"` and carry `disabled={pending !== null}`. Disable and Enable trigger buttons are also disabled while an operation is pending. Cancelling clears all secret/password references without issuing an API request.
6. **AC6: Boundaries & Constraints**: No changes made to `src/app/admin/setup/setup-flow.tsx`, CI/workflows, secrets, or the DB schema.

---

## Verification Report

| Criterion | Verification Method / Command | Test Case / Assertion | Observed Result | Exit Code |
|---|---|---|---|---|
| **AC1** | `playwright test e2e/account-security.spec.ts` | `test("enable, sign in with the code, disable")` | Disable button visible only when On; wrong password rejected; correct password turns Off; persisted after reload | 0 |
| **AC2** | `playwright test e2e/account-security.spec.ts` | `test("enable, sign in with the code, disable")` | After UI enable, sign-in asks for TOTP; `000000` rejected; valid TOTP signs in | 0 |
| **AC3** | `playwright test e2e/account-security.spec.ts` | `test("enable, sign in with the code, disable")` | After disable, signing out and back in redirects straight to app without 2FA prompt | 0 |
| **AC4** | `playwright test e2e/arabic.spec.ts` | `test("Arabic account security page: RTL page, LTR secret, backup codes and code input, no horizontal scroll")` | `dir=rtl`, `lang=ar`, LTR inputs, 0px horizontal scroll on 375px and 1280px | 0 |
| **AC5** | `vitest run tests/unit/account-security-two-factor.test.ts` & `playwright test e2e/account-security.spec.ts` | Unit tests for explicit `type="button"`, `disabled={pending !== null}` on 3 cancel buttons and trigger buttons; E2E test `Cancel is disabled while disable request is in flight` with delayed route | 5/5 unit tests pass; E2E delayed route confirms Cancel is disabled while in-flight | 0 |
| **AC6** | `git status` & `git diff origin/main` | Diff inspect against origin/main | `setup-flow.tsx`, `.github/`, schema untouched | 0 |

---

## Changed Covering Tests

1. `tests/unit/account-security-two-factor.test.ts`:
   - `Disable posts only the account password to better-auth's existing endpoint (no code field)`
   - `every Cancel control is an explicit type="button" and carries disabled={pending !== null}`
   - `Disable and Enable trigger buttons are disabled while pending`
   - `Cancel discards both password fields and any pending code without a request`
   - `enable and disable read their password through separate refs`
2. `e2e/account-security.spec.ts`:
   - `user menu opens the security page and shows the two-step status`
   - `a signed-out visit to the security page redirects to sign-in`
   - `enable two-step verification from the account page`
   - `enable, sign in with the code, disable`
   - `Cancel is disabled while disable request is in flight`
3. `e2e/arabic.spec.ts`:
   - `Arabic account security page: RTL page, LTR secret, backup codes and code input, no horizontal scroll`
4. `e2e-army/72-federated-mfa-failure-audit.e2e.ts`:
   - `@issue-199 AC1: with two-step verification Off the security page shows Enable and no Disable button`
   - `@issue-199 AC4: the security page in Arabic is right-to-left with no horizontal scroll`

---

## Command Outputs Summary

- **Playwright Account Security**:
  ```
  pnpm test:e2e e2e/account-security.spec.ts -g "security|signed-out|enable" --project=chromium --workers=1
  5 passed (31.9s)
  Exit code: 0
  ```

- **Playwright Arabic Security Page**:
  ```
  pnpm test:e2e e2e/arabic.spec.ts -g "Arabic account security page" --project=chromium --workers=1
  1 passed (7.4s)
  Exit code: 0
  ```

- **Vitest Unit & Localization Tests**:
  ```
  pnpm exec vitest run --project unit tests/unit/account-security-two-factor.test.ts tests/unit/i18n.test.ts --maxWorkers=2
  2 passed (2), 21 passed (21)
  Exit code: 0
  ```

- **Vitest Contract Tests**:
  ```
  pnpm test:contract
  26 passed (26), 541 passed (541)
  Exit code: 0
  ```

- **ESLint**:
  ```
  pnpm lint
  Exit code: 0
  ```

---

## UI Screenshots

- **Arabic RTL Account Security Page**:
  Captured via Playwright at `/account/security` with Arabic locale (`dir="rtl"`, `lang="ar"`):
  - File: `account-security-ar-rtl.png` (verified in brain artifact storage)
  - Elements: Right-to-left layout, Arabic title "التحقق بخطوتين", Badge "غير مفعّل", Button "تفعيل"
  - Enrolment: `dir="ltr"` for secret, backup codes grid, and 6-digit code input.

- **English LTR Account Security Page**:
  Captured via Playwright at `/account/security` with English locale (`dir="ltr"`, `lang="en"`):
  - File: `account-security-en-ltr.png` (verified in brain artifact storage)
  - Elements: Left-to-right layout, heading "Two-step verification", Badge "Off", Button "Enable"
