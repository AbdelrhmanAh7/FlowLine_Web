# Account Security

## Overview

The `/account/security` route provides account security management for authenticated users. If an unauthenticated user visits the page, they are redirected to `/sign-in`.

The page displays the two-factor authentication (2FA) status and hosts the two-factor card (`TwoFactorCard`) component for enrolment and de-enrolment.

## Features

### Two-Step Verification Status
- Queries the user's `twoFactorEnabled` flag from the database (`schema.user`).
- Displays a status badge indicating whether two-step verification is active or inactive.

### Enrolment (Enable 2FA)
1. **Password Confirmation**: The user initiates enrolment by confirming their account password via `/api/auth/two-factor/enable`. Passwords are submitted via uncontrolled `SecretInput` elements and cleared from memory upon submission.
2. **Secret and Backup Codes**: Upon verification of the password, the server generates a TOTP secret (encoded in a standard `otpauth://` URI) and a set of backup codes. The raw base32 secret and backup codes are displayed to the user.
3. **Verification**: The user enters a 6-digit one-time password code from their authenticator app to complete enrolment via `/api/auth/two-factor/verify-totp`.

### Disabling 2FA
- Users with active 2FA can disable the feature by providing their account password to `/api/auth/two-factor/disable`.

### Cancellation and State Safety
- Cancelling any in-progress enable or disable flow scrubs the secret input fields, discards in-memory secret/backup codes, and resets form state.

## Integration with Federated MFA and Engine

- **TOTP Specification**: Standard RFC 6238 TOTP (SHA-1, 6 digits, 30-second step) implemented in `src/server/totp.ts` and managed via Better Auth's two-factor plugin.
- **Session and Federated MFA Fence**: When two-factor authentication is active on an account, federated identity providers (Google, GitHub, ZITADEL, workspace OIDC) cannot bypass local MFA. Federated sign-ins produce a temporary step-up challenge, requiring local TOTP verification before an authenticated session is established. For details on replay protection, audit logging, and lock ordering, see [FEDERATED_MFA.md](FEDERATED_MFA.md).
