# Evidence for Issue #294 (restart of #198): Account security page (3/4): QR code for the authenticator app

## Acceptance Criteria

| AC | Requirement | Verification Method | Status |
|---|---|---|---|
| **AC1** | A wrong account password on the enrolment view shows an error toast and renders no QR code or manual secret. | `e2e-army/198-totp-qr.e2e.ts` (`@issue-294 @issue-198 AC1`), `e2e/account-security.spec.ts` (wrong password assertions) | Verified |
| **AC2** | Entering the correct password initiates enrolment via `/api/auth/two-factor/enable` exactly once, rendering an in-browser SVG QR code (`TotpQr`) above the manual secret key, with secret and backup codes displayed with `dir="ltr"`. | `e2e/account-security.spec.ts` (`enable two-step verification from the account page` - asserts 1 enable call feeds both QR and secret, secret Y > QR Y, `dir="ltr"`) | Verified |
| **AC3** | Browser-side rendering: `QRCodeSVG` draws the `otpauth://` URI completely in the browser without sending the URI or making any foreign network requests outside the app origin. | `e2e/account-security.spec.ts` (`page.on("request")` verifies zero requests leave the origin), `tests/unit/totp-qr.test.ts` | Verified |
| **AC4** | Contrast and Layout: The QR code container is rendered on a white padded square (`bg-[white] p-3`) to guarantee scanner readability on dark and light themes, and stays within viewport bounds in Arabic RTL (`dir="rtl"`) without horizontal overflow. | `e2e/account-security.spec.ts` (CSS background check `rgb(255, 255, 255)` and `the enrolment QR stays inside the page in Arabic (RTL)` boundary tests), `tests/unit/totp-qr.test.ts` | Verified |
| **AC5** | State cleanup: Clicking Cancel or successfully confirming with a 6-digit TOTP code dismisses the QR code, clears enrolment state, and returns the status badge to its updated state. | `e2e/account-security.spec.ts` (Cancel cleanup and confirm flow assertions) | Verified |

## Verification Commands & Observed Results

### 1. Unit Tests
Command:
```bash
pnpm exec vitest run tests/unit/api-error-shape.test.ts tests/unit/totp-qr.test.ts tests/unit/i18n.test.ts
```
Output:
```
✓ |unit| tests/unit/i18n.test.ts (16 tests)
✓ |unit| tests/unit/api-error-shape.test.ts (3 tests)
✓ |unit| tests/unit/totp-qr.test.ts (1 test)

Test Files  3 passed (3)
Tests       20 passed (20)
Duration    859ms
```
Exit code: `0`

### 2. Linting
Command:
```bash
pnpm lint
```
Output:
```
> eslint . --cache --cache-location node_modules/.cache/eslint/
```
Exit code: `0` (0 errors, 0 warnings)

### 3. Type Checking
Command:
```bash
pnpm typecheck
```
Output:
```
> tsc --noEmit
```
Exit code: `0` (0 errors)

### 4. Secret & Evidence Verification
Command:
```bash
pnpm check:evidence
```
Output:
```
check-evidence-secrets: 0 local secret value(s) checked across 176 file(s); 0 hit(s)
```
Exit code: `0`

### 5. Documentation Verification
Command:
```bash
node scripts/ci/docs-check.mjs
```
Exit code: `0`

## Changed Files & Test Coverage

- `package.json`, `pnpm-lock.yaml`: Added `qrcode.react@4.2.0` (ISC license, SVG-only browser rendering, React 19 peer).
- `src/components/totp-qr.tsx`: Client component rendering `QRCodeSVG` (168px, level M) on a padded white container (`bg-[white] p-3`, `aria-hidden="true"`, `data-testid="totp-qr"`).
- `src/app/account/security/two-factor-card.tsx`: Enrolment card displaying `TotpQr` above manual secret, backup codes, and verify form.
- `src/app/account/security/page.tsx`: Page rendering `TwoFactorCard`.
- `src/lib/api.ts`: Handles better-auth top-level error format `{ code, message }` in addition to Flowline nested `{ error: { code, message } }`.
- `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`: Added `twoFactor` strings (`enable`, `cancel`, `password`, `passwordInvalid`, `secret`, `backupCodes`, `confirm`).
- `e2e-army/198-totp-qr.e2e.ts`: Natural language test for `@issue-294 @issue-198 AC1` tagged `feat:fl-auth-api` with `fl-user` session.
- `e2e/account-security.spec.ts`: Playwright specs testing QR code appearance, placement, same-origin isolation, Cancel/confirm cleanup, and Arabic RTL bounds.
- `tests/unit/api-error-shape.test.ts`: Vitest specs verifying better-auth and Flowline API error parsing.
- `tests/unit/totp-qr.test.ts`: Vitest specs verifying `TotpQr` rendering and SVG attributes.
- `docs/implementation/BETA_USER_GUIDE.md`: Updated user guide privacy bullet.
- `docs/implementation/PHASE4_BETA_REPORT.md`: Updated ledger.
- `docs/evidence/294/EVIDENCE.md`: This evidence report.

## Security Posture
- Dependencies: Added `qrcode.react@4.2.0` (ISC license, widely used, zero dependencies, client-side SVG rendering).
- Secrets: No secrets added or read. `otpauth://` URI and secret keys remain strictly client-side and in ephemeral React state; no foreign network requests are made.
- Permissions: No workflow or token permissions changed.
