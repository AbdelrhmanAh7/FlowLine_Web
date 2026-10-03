# Federated sign-in and local MFA

Source review: 2026-10-03, H3 candidate based on `2c85f058c2bf382ee861a2c2007af129705c62c6`.
This describes the implementation; PostgreSQL, browser and live-provider acceptance remain pending for the revised candidate.

## Authentication boundary

Google, GitHub, platform ZITADEL and approved workspace OIDC links do not replace an enrolled Flowline authenticator. For an enrolled account, federation produces a ten-minute, opaque `fl_federated_mfa` cookie. The server stores only its hash and pending authority in `verification`. No authenticated session cookie is granted until the local six-digit TOTP succeeds. Better Auth's temporary federated session is deleted before the pending response; the workspace flow creates no session at callback time.

`/auth/step-up` loads a purpose-separated CSRF token. Its POST requires the exact configured origin, the pending cookie, the CSRF token and a bounded JSON body. Attempts are limited to five per five minutes per user. Challenge consumption is single-use. IdP MFA claims, trusted-device cookies and backup codes cannot complete this federated challenge. Password sign-in retains Better Auth's local TOTP/backup-code and trusted-device behavior.

The `federatedMfa` plugin also fences the shared Better Auth adapter's session reads. An enrolled user needs assurance for the exact session token and current verified factor. This applies to `auth.api.getSession`, the access helpers, `/api/auth/get-session`, and Better Auth's internal account/session middleware. A page redirect alone is not the boundary. Cookie caching is explicitly disabled; adding cookie caching or secondary session storage requires revisiting this fence.

Sessions issued before enrollment or by the earlier vulnerable implementation have no acceptable proof and require sign-in again. Legacy assurance records containing only a user ID are also refused. A verified local factor/enrollment or successful federated challenge records the proof. Proof expires at the session expiry recorded when the factor was accepted; sliding session renewal does not extend it. Factor replacement invalidates old proofs. Deleting a session remains authoritative even if its proof has not yet expired. No schema migration is needed: pending state and proof use the existing `verification` table.

## Authority and revocation

- Completion locks/rechecks pending state, user timestamp, verified factor, account identities/password state and the unissued session. Expiry, recovery, password changes, unlink/relink and factor replacement refuse stale attempts. A rejected completion removes its unissued session.
- Workspace completion additionally rechecks the initiating session when present, enabled configuration/revision, membership and approved identity binding. Membership/configuration/link revocation cannot be undone by a pending callback or MFA completion. Audit is emitted only on successful completion.
- Global challenges retain the accepting provider configuration fingerprint. Revocation, replacement or a changed configuration expires the challenge. The callback checks its captured credentials against current configuration, including an explicitly valid previous-secret grace window. Completion holds share locks on DB credential/issuer rows while checking the fingerprint. Environment configuration changes require process restart. Dispatch also rechecks the original callback attempt after provider work. A cleared session cookie does not mark a sign-in credential verified; after successful MFA commits, verification metadata is updated only for the still-matching DB app identity/revision. Environment-backed ZITADEL does not mark a shadow DB credential verified.
- Workspace link confirmation still needs independent Flowline mailbox proof and explicit CSRF-protected POST consent, with fresh password/TOTP assurance as applicable. The final transaction also rechecks the verified factor, local password and user timestamp so a concurrent change cannot authorize linking with stale assurance. Legacy tenant email assertions do not establish mailbox ownership. ZITADEL account identities include issuer and subject; legacy bare subjects require explicit re-linking.
- Explicit global `/link-social` attempts bind the initiating session hash and provider configuration in Better Auth's server-controlled OAuth state. Account create/update hooks re-read session/MFA and provider authority after provider work, including direct ID-token linking. Revoked, expired, swapped or newly unassured initiating sessions cannot complete a link. Old in-flight links without this binding must restart. Caller `additionalData` cannot supply the trusted binding. The existing implicit-link policy is unchanged.

Existing authenticated sessions remain separate credentials: revoking a provider/account link prevents new or pending federated sign-ins, but does not by itself revoke already completed sessions. Revoke those sessions through session management; recovery deletes existing sessions. Logging out of Flowline does not log out of the provider.

## Platform and API access

Platform access additionally requires an active `platform_admin` row, verified email, verified TOTP and a session at most 24 hours old. Writes still require a separate ten-minute, session-bound TOTP elevation with replay protection. Workspace ownership/SSO never grants platform administration. Unassured sessions resolve as signed out, including a 404 at the platform boundary.

Workspace API keys are independent machine credentials for `/api/v1/**`; they retain their existing hash, expiry/revocation, scope and current-membership checks. They never count as a browser session or local MFA, and any Authorization header is refused by platform access. An unassured browser session cannot create a new key through the authenticated workspace management API. Enrollment or session logout does not silently revoke previously issued API keys.

## Validation limits

Focused unit tests exercise the installed Better Auth middleware and real GitHub linking callbacks with an in-memory adapter and mocked HTTP, pending-state failure paths with mocked transactions, provider dispatch and i18n. Mocked transactions do not prove PostgreSQL locking or concurrent consumption. Updated integration tests include provider callbacks, pre-enrollment sessions, revocation and authority races, but were **not executed** in this resource-limited review. Browser, live IdP, real mailbox and full main-target CI gates remain required. See [readiness evidence](../../artifacts/phase-4/h3-readiness/README.md).
