# Flowline credential-management security design

**Recommendation: implement separate platform and workspace credential controls, backed by versioned encrypted records. Do not implement this as a generic “edit environment variables” screen.**

The current encryption and connection services provide a useful starting point, but they do not yet support the required isolation, OAuth-app binding, revocation semantics, or restart-free configuration.

**Review scope:** read-only inspection of FlowLine at `1a9883fa55f35753e54ec6275a629c6b66fb0bf5`, and the AI worktree at `6838bdbae02cd2deb63701ff575ce044c032c3b4` **plus its uncommitted changes**. AI-worktree observations describe a moving implementation, not a certified release. No repository files were edited, no tests were executed, and no other scratchpad reports were read.

Citations without a prefix refer to `C:/Users/Abdelrahman/Desktop/Personal_Project/FlowLine`. `AIH/` refers to `C:/Users/Abdelrahman/Desktop/Personal_Project/FL-wt-aihub`. Proposed files are explicitly identified as new.

**Priority meanings:** **MUST** = acceptance requirement; **SHOULD** = recommended hardening or operational default; **COULD** = optional extension.

## 1. Findings that determine the design

| Priority | Finding and consequence | Code evidence |
|---|---|---|
| **MUST** | Existing encryption uses AES-256-GCM directly with the master key. It has neither envelope encryption nor authenticated row/workspace context. Copying ciphertext and `key_id` to another compatible record is not cryptographically rejected. | `src/server/crypto.ts:32`, `src/server/crypto.ts:41` |
| **MUST** | Connections record provider and credential version, but not OAuth app identity. Refresh reads whichever client credentials are currently in env. Changing the global app can therefore pair an old refresh token with a different client. | `src/db/schema.ts:310`, `src/server/connections.ts:227`, `src/server/connections.ts:312` |
| **MUST** | OAuth state binds user, workspace and provider, but not app identity, client-secret revision or initiating session. Callback processing does not recheck current workspace membership/capability. | `src/db/schema.ts:344`, `src/server/connections.ts:330` |
| **MUST** | `FLOWLINE_BETA_ADMINS` is an invitation-gate bypass, not platform authorization. Workspace `integration.manage` includes editors. Neither is a suitable platform-secret boundary. | `src/server/beta.ts:50`, `src/server/beta.ts:79`, `src/lib/permissions.ts:18` |
| **MUST** | Social-login configuration is built at module initialization; billing caches its adapter indefinitely, including `null`. UI writes alone would not update these consumers. | `src/lib/auth.ts:11`, `src/lib/auth.ts:20`, `src/billing/service.ts:26` |
| **MUST** | Provider error text can enter stored connection reasons, HTTP errors and redirect query strings. Existing pattern redaction cannot recognize every arbitrary client secret. | `src/server/connections.ts:65`, `src/server/connections.ts:228`, `src/server/connections.ts:345`, `src/app/api/oauth/callback/route.ts:27`, `src/server/redact.ts:6` |
| **MUST** | Caddy redacts `token=` and selected bearer-token paths, but not OAuth `code`, `state` or provider error parameters. | `deploy/beta/Caddyfile:26` |
| **MUST** | Social-login token fields are separate from encrypted SaaS connections. The auth configuration does not enable Better Auth’s optional token encryption. | `src/db/schema.ts:58`, `src/lib/auth.ts:20`, `node_modules/better-auth/dist/oauth2/utils.mjs:21` |
| **MUST** | The AI worktree uses the same context-free crypto. Its replace operation updates by ID after a network verification; disconnect does not increment `cred_version`. Concurrent replace/disconnect needs fencing. | `AIH/src/ai/hub/credentials.ts:17`, `AIH/src/ai/hub/connections.ts:180`, `AIH/src/ai/hub/connections.ts:203` |
| **SHOULD** | GitHub already defines OAuth endpoints but declares `authType: "api_key"`, so current UI/catalog logic presents the PAT path. Adding app inputs alone will not expose GitHub OAuth correctly. | `src/integrations/providers/github.ts:156`, `src/app/api/integrations/catalog/route.ts:29`, `src/app/w/[slug]/integrations/page.tsx:261` |

## 2. Recommended design

### 2.1 Separate three credential domains

| Priority | Domain | Authorized configuration | Runtime use |
|---|---|---|---|
| **MUST** | Platform credentials: social-login apps, shared integration OAuth apps, email service, sandbox billing and webhook verification | Explicit platform administrators with fresh step-up authentication | Purpose-specific server services; never returned to tenants |
| **MUST** | Workspace OAuth-app overrides | Workspace owners with fresh reauthentication | Only integration authorization and refresh for that workspace |
| **MUST** | Workspace connection credentials: SaaS tokens, API keys and AI BYOK | Existing applicable workspace capabilities; AI retains `ai.manage` and `use_roles` separation | Authorized server/worker execution using connection references |

**Basis:** workspace access is already centralized in `src/server/access.ts:45`; connection runtime checks exist at `src/server/connections.ts:182`; AI ownership/use separation is required by `AIH/docs/ai/IMPLEMENTATION_PLAN.md:93`.

**MUST:** an override must never change Flowline’s Google/GitHub sign-in, email, billing or another workspace’s configuration. Use explicit purposes such as `signin.google`, `integration.google`, `integration.slack`, `email.resend`, and `billing.paddle.sandbox`. Today sign-in and integration Google credentials already have distinct env names; preserve that separation. (`src/lib/auth.ts:12`, `src/integrations/providers/google_sheets.ts:27`)

**MUST:** preserve UI-only AI BYOK and absence of operator-key fallback. The new owner decision changes where operators manage platform credentials; it does not authorize platform-funded AI or import global AI credentials into tenants. (`AIH/docs/ai/IMPLEMENTATION_PLAN.md:95`–`100`)

### 2.2 Platform-admin identity and first-admin bootstrap

**MUST — introduce a separate platform principal.** Add `platform_admin` keyed by immutable `user.id`, with `status`, `created_at`, `created_by`, and `revoked_at`. Do not add a fourth workspace role. Do not authorize from email address, workspace ownership, invitation codes, SSO claims or `FLOWLINE_BETA_ADMINS`. (`src/db/schema.ts:22`, `src/lib/permissions.ts:2`, `src/server/beta.ts:79`)

**MUST — centralize enforcement.** Add `requirePlatformAdmin()` alongside the existing access boundary. It must query current admin status and validate the session before reading secret metadata or accepting changes. Authenticated non-admins receive 404 on platform pages and APIs. Workspace override routes retain 404 for non-members and 403 for members lacking owner capability. (`src/server/access.ts:29`, `src/server/access.ts:45`)

**MUST — require MFA before the normal platform panel unlocks.** The current auth configuration has only `nextCookies()` and a seven-day session; neither establishes recent MFA. Add independently enrolled admin MFA and server-side authentication-assurance records. Workspace-controlled SSO must not satisfy platform step-up merely by asserting a verified email. (`src/lib/auth.ts:49`, `src/lib/auth.ts:85`, `src/server/sso.ts:430`)

**SHOULD — use these initial assurance defaults:**

- Phishing-resistant WebAuthn/passkey verification for platform administration.
- Successful MFA within five minutes for create, replace, activate, revoke, clear and admin-membership changes.
- A short-lived elevated session with a 15-minute idle timeout.
- Single-use, action/target/session-bound authorization for destructive changes.
- Password reset, MFA reset, admin revocation and session revocation invalidate elevation.

These require new fields; `session.created_at`/`updated_at` do not represent a fresh authentication challenge. (`src/db/schema.ts:32`)

**MUST — use explicit operator bootstrap, not “first signup wins.”** Implement a new `scripts/admin/bootstrap.mts` that creates a hashed, random, short-lived, one-use setup challenge in the DB, bound to the operator-selected identity. Serialize bootstrap with a DB lock and permanently record completion. Supply the challenge through a form POST, never a URL. The script must not print service credentials. Existing operator scripts already establish a privileged DB administration boundary. (`scripts/beta/create-code.mts:3`, `src/server/crypto.ts:73`)

**MUST — solve the email bootstrap dependency explicitly.** A fresh installation cannot require a verification email before allowing the first email-provider credential to be configured: verification is mandatory, while sending currently requires provider configuration. (`src/lib/auth.ts:33`, `src/server/email/index.ts:23`, `src/server/email/index.ts:43`)

Use this restricted sequence:

1. **MUST:** an operator-issued setup session can configure only the initial email provider and deliver verification only to its prebound identity.
2. **MUST:** complete the real email-verification and account-authentication flow.
3. **MUST:** enroll and verify admin MFA.
4. **MUST:** atomically create the first `platform_admin`, consume the challenge and close setup access.

The setup session is a narrowly scoped bootstrap authority, not a general admin session. Never enable the test outbox in beta to bypass this sequence. (`src/server/email/index.ts:25`, `src/lib/auth.ts:37`)

**SHOULD:** bootstrap access should additionally require a private network or operator tunnel. The current public proxy blocks test/debug/ops endpoints but has no setup/admin boundary. (`deploy/beta/Caddyfile:5`)

**MUST:** recovery must require an explicit operator action and produce an audit event. Deleting all admin rows must not automatically reopen setup. An email change must not transfer admin authority. (`src/db/schema.ts:23`, `src/server/beta.ts:50`)

### 2.3 Storage, envelope encryption and AAD

**The current `crypto.ts` is insufficient for the requested design.** Its random IV and GCM authentication are useful, and `key_id` supports old-key lookup, but there is no DEK wrapping or `setAAD()`. (`src/server/crypto.ts:14`, `src/server/crypto.ts:32`)

**MUST — introduce a versioned envelope format.**

For each secret revision:

1. Generate a new random 32-byte data-encryption key, or DEK.
2. Encrypt the secret payload using AES-256-GCM with a fresh 12-byte nonce and a 16-byte authentication tag.
3. Wrap the DEK using the appropriate key-encryption key, or KEK, with a separate nonce and authentication tag.
4. Store format version, algorithm, KEK ID, wrapped DEK and payload ciphertext.
5. Authenticate both payload and wrapped-DEK context.

**MUST — require context at every encryption/decryption call.** Proposed API:

```ts
encryptSecret(value, context, keyDomain)
decryptSecret(envelope, expectedContext, keyDomain)
rewrapSecret(envelope, expectedContext, targetKeyId)
```

Context must include:

```text
format version
installation/environment identity
key domain
table/record kind
record ID
scope: platform or workspace
workspace ID, where applicable
provider/app family
purpose
immutable secret revision
```

Derive expected context from trusted records and the authorized operation. Never accept it directly from the browser or trust context embedded in the envelope without comparison. Existing `canonicalJson()` can serialize a strictly validated context structure. (`src/server/crypto.ts:57`)

**MUST — allocate IDs before encrypting.** Current connection creation encrypts before the DB allocates its random ID. Generate the ID first so it can be bound into AAD. (`src/server/connections.ts:99`, `src/db/schema.ts:313`)

**MUST — separate platform and workspace storage and KEKs.**

- New `platform_credential` and immutable `platform_credential_version` tables.
- New `workspace_oauth_app` and immutable `workspace_oauth_app_version` tables.
- Existing `connection` and `ai_connection` remain tenant-token stores.
- Separate operator-managed platform and workspace key rings; do not reuse the same root key bytes.
- Scope-specific server APIs; no generic decrypt endpoint or tenant-supplied secret reference that can resolve platform secrets.

The existing single env key is shared by SaaS connections, SSO, webhook secrets and encrypted step data. Migration must account for every caller. (`src/server/crypto.ts:21`, `src/server/sso.ts:116`, `src/server/publish.ts:100`, `worker/runner.ts:203`)

**MUST — enforce relational constraints.** Add immutable app-identity references to connections and OAuth state. For workspace-app references, enforce matching workspace ownership through composite constraints or an equivalent checked relation; checking only a UUID’s existence is insufficient. App-version foreign keys must also agree with the selected app. (`src/db/schema.ts:310`, `src/db/schema.ts:344`)

**MUST — validate envelopes strictly.** Reject unknown versions/algorithms, extra or missing segments, oversized ciphertext, invalid base64, incorrect nonce/tag/wrapped-key lengths, unavailable keys and all authentication failures. The current parser only checks the first four split components for presence. (`src/server/crypto.ts:44`)

**MUST — migrate without leaving a downgrade route.** Allow v1 only for explicitly legacy-marked existing rows. Backfill them using trusted row context; require v2 for new records and all platform secrets. After migration, refuse v1 in migrated domains. Otherwise a malicious replacement with legacy ciphertext bypasses AAD. (`src/server/crypto.ts:45`)

**MUST — distinguish KEK rotation from compromise recovery.**

- Routine KEK rotation can rewrap DEKs without reencrypting payloads.
- Retain old keys until all dependent live data and required restore points are handled.
- If a KEK and ciphertext were stolen, rewrapping does not invalidate the attacker’s copy. Rotate affected provider secrets and tokens as well.

This extends the current old-key read support rather than treating it as a complete rotation mechanism. (`src/server/crypto.ts:25`)

**SHOULD:** separate DB roles and service access by purpose, particularly preventing workers from accessing sign-in and email administration credentials. The current web and worker share `.env.beta` and application DB credentials. Separate tables and keys alone do not isolate a process that possesses both. (`deploy/beta/docker-compose.beta.yml:8`, `deploy/beta/docker-compose.beta.yml:65`)

**COULD:** use a KMS/HSM or credential broker for stronger key custody and process isolation. Application-side encryption cannot protect secrets from a fully compromised process that is authorized to decrypt them. (`src/server/crypto.ts:21`, `src/server/connections.ts:197`)

### 2.4 Write-only UI and HTTP contract

**MUST — return metadata projections only.** Use the existing `publicConnection()` approach, with explicit allowlisted fields:

```text
id, provider, purpose, scope
configured/status/verification
revision
setAt, setBy
lastTestedAt, lastTestResultCode
```

Never serialize encrypted columns, wrapped DEKs, plaintext, authentication headers or provider response bodies. Prefer “configured” and audit metadata over a last-four hint. (`src/server/connections.ts:27`; compare `AIH/src/ai/hub/credentials.ts:21`)

**MUST — distinguish public identifiers from secrets.** OAuth client IDs necessarily appear in authorization URLs; Paddle’s client token is intentionally delivered to checkout. These are integrity-sensitive public configuration, not confidential client secrets. A write-only guarantee must apply to actual secrets rather than falsely promising that these identifiers never reach a browser. (`src/server/connections.ts:295`, `src/billing/checkout-page.ts:47`)

**MUST — make changes unambiguous.**

| Operation | Required semantics |
|---|---|
| Replace | Nonempty new value plus `expectedRevision`; creates a candidate revision |
| Omitted field | Preserve current value |
| Empty secret | Validation failure; never implicit clear |
| Activate | Explicitly selects a candidate; reports verification status honestly |
| Revoke | Immediately denies local future use; invalidates outstanding authorization where applicable |
| Clear | Explicit destructive operation with dependency preview and fresh step-up |
| Switch OAuth app | Creates/selects a different app identity; never masquerades as secret rotation |

Use optimistic concurrency; stale writes return 409. Current credential updates generally match only the record ID. (`src/server/connections.ts:135`, `AIH/src/ai/hub/connections.ts:194`)

**MUST — keep plaintext transient.** Secret inputs may exist temporarily in an input element and submission body. They must not enter persisted React state, query caches, mutation retry queues, offline drafts, URL parameters, server-rendered HTML or RSC payloads. Clear inputs and mutation state on success, cancellation, close and navigation. Disable offline submission. (`src/app/w/[slug]/integrations/page.tsx:259`, `src/lib/drafts.ts:30`)

**SHOULD:** use password-type inputs, LTR direction, disabled spellcheck/autocapitalization, explicit non-login field names, `autocomplete="off"` and supported password-manager exclusion hints. These reduce accidental capture; browsers/extensions can ignore them. Do not provide a stored-secret reveal endpoint. (`src/app/w/[slug]/integrations/page.tsx:251`)

**MUST — apply stricter request checks to secret-management endpoints.**

- Require a session, current authorization and step-up where specified.
- Require exact configured `Origin` for browser mutations; reject missing, `null` or mismatched origins.
- Add a session-bound CSRF token.
- Do not trust request-derived host/origin as an allowed control-plane origin.
- Require JSON, strict schemas, bounded lengths and a streaming body cap.
- Return `Cache-Control: no-store`; do not place secret pages in shared caches.

The existing wrapper permits requests based on `Sec-Fetch-Site` and includes `req.url` among allowed origins. Keep provider callbacks/webhooks on their separately authenticated paths rather than breaking them with browser CSRF rules. (`src/server/http.ts:70`, `src/server/http.ts:29`)

**MUST:** use distributed rate limits for tests, writes, bootstrap and MFA attempts. Reuse `checkRate()`, which already uses PostgreSQL advisory locking. Test limits must include actor, credential/workspace and provider-wide budgets. (`src/server/rate-limit.ts:14`)

**SHOULD:** start with five credential tests per minute per actor/credential, a bounded provider-wide limit, and one concurrent test per revision. Email tests must target the administrator’s verified address, not an arbitrary submitted recipient. (`src/server/rate-limit.ts:14`, `src/server/email/index.ts:73`)

**SHOULD:** isolate admin pages from tenant-authored content and third-party scripts, and add a tested restrictive CSP. Existing proxy headers deny framing but do not supply a CSP. (`deploy/beta/Caddyfile:9`)

### 2.5 OAuth validation, redirects and workspace overrides

**MUST — use fixed provider definitions.** Customers may supply client ID and secret, not authorize/token/revoke URLs, arbitrary scopes, redirect URIs, authentication methods or extra authorization parameters. These remain reviewed code. (`src/integrations/types.ts:129`, `src/server/connections.ts:303`)

**MUST — use `safeFetch` plus provider-specific endpoint restrictions.** SSRF filtering alone permits arbitrary public hosts. Token/revocation calls need exact HTTPS endpoints, `maxRedirects: 0`, response caps and timeouts. Existing `safeFetch` supports these options; token exchange currently leaves redirects at the default. (`src/server/egress.ts:140`, `src/server/egress.ts:162`, `src/server/connections.ts:313`)

**MUST — validate OAuth credentials through a real authorization-code flow.** Save syntactically valid configuration as `CONFIGURED_UNVERIFIED`; validate it through an explicit test Connect or first real Connect. An invalid-code token request returning `invalid_grant` does not prove the client secret is correct. Validate successful token-response shape and confirm external identity before marking that revision verified. (`src/server/connections.ts:308`, `src/server/connections.ts:327`, `src/server/connections.ts:347`)

**MUST:** bind verification to the particular revision and purpose. A successful Gmail authorization does not automatically certify every Sheets scope, and “configured” is not “live verified.” (`src/integrations/providers/gmail.ts:20`, `src/integrations/providers/google_sheets.ts:21`)

**MUST — show these exact callback paths, using the trusted deployment origin:**

| Purpose | Redirect URI |
|---|---|
| SaaS integrations, platform or workspace app | `${FLOWLINE_PUBLIC_URL without trailing slash}/api/oauth/callback` |
| Google sign-in | `${BETTER_AUTH_URL origin}/api/auth/callback/google` |
| GitHub sign-in | `${BETTER_AUTH_URL origin}/api/auth/callback/github` |
| Existing workspace SSO | `${FLOWLINE_PUBLIC_URL without trailing slash}/api/sso/callback` |

Integration and SSO paths are defined at `src/server/connections.ts:255` and `src/server/sso.ts:189`. Better Auth’s default base path and callback construction are at `node_modules/better-auth/dist/context/create-context.mjs:87` and `node_modules/better-auth/dist/oauth2/utils.mjs:28`.

The beta compose file sets both public origins to `https://${BETA_DOMAIN}`. The concrete deployed domain was not read; it should be rendered from trusted configuration, not invented or supplied by a tenant. Require valid HTTPS origins outside isolated local tests. (`deploy/beta/docker-compose.beta.yml:13`)

**MUST — bind every OAuth attempt to its complete identity.** Persist app ID, app credential revision, initiating session, workspace, user, integration provider, canonical redirect URI, PKCE verifier and expiration. Store a hash of state where practical. Recheck membership/capability and app revocation before exchange and before storing results. Keep single-use state consumption and supported PKCE. (`src/server/connections.ts:275`, `src/server/connections.ts:330`)

**MUST — preserve explicit issuer/provider binding.** Validate issuer information where the provider supplies it, and never select a token endpoint from callback input. Retain fixed provider routing and add mix-up tests. This follows the OAuth security guidance on issuer binding, PKCE and refresh-token protection. (`src/server/connections.ts:338`; [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.4))

**MUST — acknowledge the malicious-app-owner risk.** Before redirecting, show whether the connection uses a Flowline-managed app or a workspace-managed app, its provider, client ID, requested scopes and configuring owner. A customer-controlled OAuth app may use misleading branding or have access outside Flowline. Fixed endpoints prevent sending secrets to arbitrary hosts; they do not make a customer’s app trustworthy. (`src/server/connections.ts:293`, `src/app/w/[slug]/integrations/page.tsx:265`)

**MUST:** configure overrides with a new owner-only capability such as `oauthapp.manage`; retain existing integration-use permissions separately. Audit creation, replacement, activation, default changes and revocation. (`src/lib/permissions.ts:17`, `src/lib/permissions.ts:31`)

**SHOULD:** give platform admins an ability to disable workspace overrides for an installation or particular workspace, with an audited policy change. This controls the new risk without conflating it with workspace ownership. (`src/server/access.ts:45`)

### 2.6 App switching, rotation, revocation and concurrent execution

**MUST — separate app identity from secret revision.**

- An app identity represents scope, provider family, purpose and client ID.
- Rotating the secret for that same client ID creates a new revision.
- Changing client ID creates a different app identity.
- A connection permanently records which app issued its tokens.
- A workspace default affects new Connect attempts only.

Google Sheets and Gmail can share an app identity while retaining their own scopes and connection provider IDs. (`src/integrations/providers/google_sheets.ts:27`, `src/integrations/providers/gmail.ts:29`)

**MUST:** existing connections must either continue using their retained issuing app or require explicit reauthorization. Never refresh an existing token with the newly selected default app. Reconnect must preserve the existing external-account check. Clearing an override must not silently redirect its connections to the platform app. (`src/server/connections.ts:227`, `src/server/connections.ts:351`)

**MUST — support a bounded rotation window where the provider supports overlapping secrets.**

1. Save a candidate revision.
2. Validate the candidate against the same app.
3. Activate it atomically for new requests.
4. Allow preexisting OAuth attempts to finish with their pinned, still-accepted revision.
5. Retire the old revision after the state/request window and observed migration.

The current OAuth state expires after ten minutes and token requests have a fifteen-second timeout; these are inputs to the grace period, not proof that any provider supports dual secrets. (`src/server/connections.ts:291`, `src/server/connections.ts:317`)

**MUST:** do not promise universally zero-downtime OAuth rotation. Some providers invalidate the old secret immediately. Record provider-specific rotation capability and expose the actual interruption/reconnect implications. Never automatically retry a consumed authorization code or rotating refresh token after an ambiguous timeout. (`src/server/connections.ts:227`, `tests/contract/oauth.test.ts:106`)

**MUST — make revocation authoritative in the DB.**

- Mark app/credential revoked and increment its revocation epoch/revision.
- New Connect, callback, refresh and API execution check current status.
- Check the parent app even when the access token has not expired.
- Invalidate pending states; pause affected flows and surface a reconnect requirement.
- Reject stale writes after revocation.

Currently runtime checks only connection status, and the locked refresh path does not recheck that status after obtaining its lock. (`src/server/connections.ts:191`, `src/server/connections.ts:208`)

**MUST — fence in-flight refresh results.** Keep per-connection refresh serialization, but capture the app’s epoch and connection version. Before committing refreshed credentials, recheck current app status/epoch and connection status/version. If revoked or replaced, discard the response and never restore `active`.

A practical lock rule is: revocation commits the parent app tombstone without waiting on all connection rows; dependent pausing follows separately. Refresh’s final transaction briefly locks/checks the parent before committing, so stale results cannot cross the revocation commit. Avoid opposite parent/connection lock orders. (`src/server/connections.ts:213`, `src/server/connections.ts:234`)

**MUST — state the revocation boundary honestly.** Local revocation prevents new authorized use after the revocation transaction. It cannot recall a request already sent or make a stolen provider credential stop working externally. Attempt provider-specific revocation and instruct the operator to revoke the credential at the provider; record success, failure or unsupported status. (`src/server/connections.ts:381`)

**MUST:** implement provider-specific revocation adapters. The current generic form POST cannot correctly cover every provider; GitHub’s configured revoke URL even contains a `{client_id}` placeholder. (`src/server/connections.ts:389`, `src/integrations/providers/github.ts:161`)

**MUST — avoid stale credential caches.** Resolve current status and revision from DB immediately before use. Initially, avoid cross-request plaintext credential caches. If adapters are cached, key them by immutable revision and check DB status before selecting one. Notifications may accelerate invalidation but must not establish correctness. (`src/billing/service.ts:34`, `AIH/src/ai/hub/credentials.ts:9`)

**SHOULD:** reuse PostgreSQL LISTEN/NOTIFY for configuration-change hints, with reconnect recovery and periodic reconciliation. The worker already uses LISTEN for run wakeups. Notifications must contain identifiers/revisions only. (`worker/index.ts:115`)

**MUST — refactor Better Auth deliberately.** Merely supplying an asynchronous social-provider configuration function is insufficient: the installed library evaluates it when constructing its context. Replace the singleton consumer model with a server-only, revision-keyed auth factory and request-local snapshot; update the route handler, session consumers and public provider-availability endpoint. (`node_modules/better-auth/dist/context/create-context.mjs:98`, `src/app/api/auth/[...all]/route.ts:5`, `src/server/access.ts:30`)

**MUST:** social-login attempts also need server-side binding to their initiating app revision. A callback dispatcher must select only a stored, unexpired, still-accepted revision while Better Auth continues to validate its own state/PKCE. Do not trust a callback query parameter as authority to select historical credentials. (`node_modules/better-auth/dist/api/routes/callback.mjs:90`)

### 2.7 Environment compatibility and migration

**MUST — use UI/DB as the sole runtime source for migrated credentials.** Do not use “DB value, otherwise env.” After clear, revoke, DB outage or decryption failure, fallback would silently reactivate credentials the administrator believes are disabled. (`src/server/connections.ts:246`, `src/billing/service.ts:37`)

**SHOULD — provide one explicit operator-run import for existing platform credentials.**

- Import only a named allowlist of platform settings into empty records.
- Never import on startup and never overwrite existing UI records.
- Record provenance and an audit event without values or secret hashes.
- Keep imported credentials unverified until the relevant check succeeds.
- Remove migrated env values from runtime deployment configuration after cutover.
- Do not import AI keys or guess their tenant ownership.

This preserves existing installations while complying with the AI plan’s prohibition on legacy global-key import. (`AIH/docs/ai/IMPLEMENTATION_PLAN.md:98`, `deploy/beta/docker-compose.beta.yml:10`)

**MUST — migrate legacy OAuth connections carefully.** Backfill a connection’s issuing app only where deployment history establishes the original client ID. Current env configuration alone may not prove historical issuance. Mark ambiguous connections `reconnect_required`; do not guess. (`src/db/schema.ts:310`, `src/server/connections.ts:312`)

**MUST:** bootstrap DB credentials, auth signing secrets and encryption roots stay operator-managed. Restart-free service-credential rotation does not imply that changing container env can hot-rotate these bootstrap roots. (`src/db/index.ts:8`, `src/lib/auth.ts:22`, `src/server/crypto.ts:21`)

### 2.8 Audit, alerts and leakage controls

**MUST — introduce platform security audit storage.** Existing `audit_event.workspace_id` is mandatory and cascades on workspace deletion. Platform events must not be attached to a synthetic tenant or disappear when a tenant is removed. (`src/db/schema.ts:598`)

**MUST:** commit successful credential changes and their audit events in the same DB transaction. Record actor ID, authentication assurance, action, target ID, scope, provider/purpose, old/new revisions, result code, timestamp and server correlation ID. Never record values, suffixes, request bodies, ciphertext, wrapped keys, tokens or raw provider errors. Existing `audit()` already accepts a transaction. (`src/server/audit.ts:6`, `src/server/audit.ts:44`)

**MUST:** audit denied administrative attempts, MFA changes, bootstrap/recovery, imports, app switches, revocations, key rewraps and failed decryption. Use enumerated fields, not arbitrary `data`. Redaction remains defense in depth: telemetry presently allows arbitrary string values under allowed keys, and recursive redaction returns unprocessed data beyond depth 30. (`src/server/telemetry.ts:34`, `src/server/redact.ts:43`)

**MUST:** replace raw OAuth/provider errors with bounded internal codes everywhere, including `statusReason` and callback redirects. Do not emit provider error descriptions into `message=`. (`src/server/connections.ts:326`, `src/app/api/oauth/callback/route.ts:34`)

**MUST:** remove sensitive OAuth query values from Caddy access logs and error reporting; use `Referrer-Policy: no-referrer` on authentication callback and secret-administration responses. OAuth codes/state necessarily transit the protocol URL, but must not become stored diagnostic payloads. (`deploy/beta/Caddyfile:12`, `deploy/beta/Caddyfile:31`)

**MUST:** enqueue metadata-only security notifications transactionally for other active admins, and workspace owners for override changes. Deliver asynchronously with retries; changing a broken email credential must not lose the notification record or roll back the repair. (`src/server/audit.ts:44`, `src/server/email/index.ts:73`)

**SHOULD:** retain credential/admin security events for at least 365 days, with restricted append-only access and an off-host copy. Treat this as a proposed operational policy, not a legal requirement. Do not let ordinary tenant retention changes erase platform events. Current audit retention defaults to 365 days but accepts values as low as one day. (`src/server/retention.ts:14`, `src/server/retention.ts:20`)

## 3. Threat model: asset → threat → mitigation

| Priority | Asset → threat | Mitigation and implementation basis |
|---|---|---|
| **MUST** | Platform credentials → workspace owner/editor escalates privileges | Separate admin principal and access function; never reuse `integration.manage` or beta email lists. `src/lib/permissions.ts:18`; `src/server/beta.ts:79` |
| **MUST** | Admin identity → stolen session or attacker-controlled tenant SSO | Fresh independent MFA, session-bound elevation, restricted factor enrollment/recovery. `src/lib/auth.ts:49`; `src/server/sso.ts:430` |
| **MUST** | First-admin authority → setup race or token replay | Explicit operator challenge, hash/expiry/single use, serialized completion, permanently closed setup state. `src/server/crypto.ts:73`; `src/db/schema.ts:22` |
| **MUST** | Encrypted credentials → DB dump disclosure or ciphertext substitution | Separate KEKs, envelope encryption, trusted-context AAD, strict format and migration rules. `src/server/crypto.ts:32` |
| **MUST** | Workspace tokens → another workspace or provider uses them | Existing execution checks plus composite app/workspace constraints and AAD. `src/server/connections.ts:182` |
| **MUST** | Refresh tokens → refreshed against a different OAuth app | Immutable issuing-app reference; default changes affect only new authorizations. `src/server/connections.ts:227`; `src/db/schema.ts:310` |
| **MUST** | Client secrets → attacker-controlled token endpoint or redirect | Fixed reviewed endpoints, exact destination policy, no redirects. `src/server/connections.ts:313`; `src/server/egress.ts:162` |
| **MUST** | Members’ external accounts → deceptive workspace app consent | Explicit app provenance/scopes and separate consent; no claim that tenant apps are Flowline verified. `src/app/w/[slug]/integrations/page.tsx:265` |
| **MUST** | Credential changes → CSRF, forged origin or replay | Strict Origin, CSRF proof, fresh step-up, revision checks. `src/server/http.ts:70` |
| **MUST** | Secret plaintext → browser persistence, HTML or evidence leak | Metadata DTOs, transient form state, no offline storage, no secret-bearing traces. `src/server/connections.ts:27`; `src/lib/drafts.ts:30`; `playwright.config.ts:31` |
| **MUST** | Revoked credentials → stale cache or concurrent operation resurrects use | DB status/epoch checks, fenced writes, no runtime env fallback. `src/billing/service.ts:34`; `AIH/src/ai/hub/connections.ts:194` |
| **MUST** | Email/billing credentials → abuse through “Test” | Restricted recipients/read-only sandbox probes, distributed rate limits and fixed endpoints. `src/server/email/index.ts:61`; `src/server/rate-limit.ts:14` |
| **MUST** | Audit evidence → secrets copied into events or tenant deletion erases history | Typed metadata events, separate platform audit table, transactional writes. `src/server/audit.ts:44`; `src/db/schema.ts:602` |
| **SHOULD** | All decrypted material → compromised web/worker process | Separate runtime roles/keys and restricted network access; acknowledge remaining process-compromise risk. `deploy/beta/docker-compose.beta.yml:8` |
| **SHOULD** | Historical secrets → backups restore revoked configuration | Protect backups separately, retain revocation recovery records, reconcile revocations before restored workers execute. `deploy/beta/docker-compose.beta.yml:81` |

## 4. Exact implementation changes

These are proposed changes, not edits performed during this review.

| Priority | Files/functions | Required change |
|---|---|---|
| **MUST** | `src/db/schema.ts:310`, `:344`, `:598`; new Drizzle migration | Add platform-admin/setup/elevation records; separate platform and workspace app/version tables; app references, epochs and constraints; platform audit and notification outbox. |
| **MUST** | `src/server/crypto.ts:32` / `decryptSecret()` | Introduce strict v2 envelopes, mandatory context, domain-specific key rings, DEK wrapping and rewrap support. Preserve tightly restricted legacy migration support. |
| **MUST** | New `src/server/platform-access.ts`; `src/server/access.ts:29`; `src/lib/permissions.ts:9` | Implement `requirePlatformAdmin()`/step-up verification and owner-only `oauthapp.manage`. Keep platform authority out of workspace role ranking. |
| **MUST** | New `src/server/platform-credentials.ts`, `src/server/oauth-apps.ts` | Provide purpose-specific create/stage/activate/revoke/resolve operations; explicit projections; CAS updates; transactional audits. No generic plaintext read operation. |
| **MUST** | New `/api/platform/credentials/...` and `/api/workspaces/[wid]/oauth-apps/...` routes | Metadata GET; explicit stage/activate/revoke/clear/test mutations. Enforce authorization, strict Origin/CSRF, body caps, no-store and distributed limits using `src/server/http.ts:29` and `src/server/rate-limit.ts:14`. |
| **MUST** | `src/server/connections.ts:245`, `:259`, `:310`, `:330`, `:208` | Replace env resolution with typed app resolution; bind state/app/version/session; reauthorize callback; schema-validate token responses; fence refresh/reconnect writes. |
| **MUST** | `src/integrations/types.ts:129`; provider OAuth definitions | Replace runtime `clientIdEnv/clientSecretEnv` with stable app-family/purpose identifiers. Keep env-name mapping only in the explicit migration command. Add provider-specific revocation support. |
| **MUST** | `src/app/api/integrations/catalog/route.ts:20` | Make effective OAuth availability workspace-authorized and workspace-specific. The present endpoint has no workspace context; do not globally cache override availability. |
| **SHOULD** | `src/integrations/providers/github.ts:156`; integration dialog | Represent supported auth methods explicitly so GitHub PAT and OAuth can coexist; preserve existing PAT connections. |
| **MUST** | `src/lib/auth.ts:11`; `src/app/api/auth/[...all]/route.ts:5`; `src/app/api/auth-config/route.ts:7` | Introduce revision-aware auth construction/callback dispatch and live metadata availability. Preserve hooks, cookies, logger protections and verification semantics. |
| **MUST** | `src/db/schema.ts:58`; Better Auth persistence boundary | Prevent plaintext persistence of retained social access/refresh/ID tokens. Use a tested adapter transformation or supported encryption integration; enabling `encryptOAuthTokens` alone is not evidence that every token column has row-bound encryption. Installed helper: `node_modules/better-auth/dist/oauth2/utils.mjs:21`. |
| **MUST** | `src/server/email/index.ts:22`, `:35`; `src/billing/service.ts:33`; `src/billing/checkout-page.ts:33` | Resolve DB configuration per operation/revision. Remove indefinite billing cache. Keep sandbox/live guards operator-controlled. Support bounded webhook-secret verification overlap. |
| **MUST** | `src/server/sso.ts:116`, `:239`, `:326`; `src/server/publish.ts:100`, `:165`; `worker/runner.ts:83`, `:203` | Pass trusted context to every crypto call and migrate existing ciphertext. Do not change hashing semantics for credentials that need only verification. |
| **MUST** | `AIH/src/ai/hub/credentials.ts:17`; `AIH/src/ai/hub/connections.ts:180` | Adopt envelope context; atomically enforce expected version/status after network verification; increment version on disconnect; prevent replace/test/discovery from resurrecting revoked records. |
| **MUST** | New platform/override UI; `src/app/w/[slug]/integrations/page.tsx:251` | Write-only forms, source/impact previews, explicit destructive actions, transient state and localized server error codes. Follow existing `useT()` pattern and Arabic/English key parity. |
| **MUST** | `src/server/audit.ts:44`; `src/server/telemetry.ts:34`; callback route; `deploy/beta/Caddyfile:31` | Typed security events, transactional notifications, bounded internal errors, OAuth query redaction and no secret-bearing diagnostics. |
| **MUST** | New bootstrap/import/rewrap scripts; release scripts | Add explicit migration tools; update staging/test provisioning to use DB-backed service configuration. Existing outage/release scripts currently inject email settings from env. `scripts/release/db-outage.mjs:37`. |
| **SHOULD** | `deploy/beta/docker-compose.beta.yml:8`, `:70` | Replace broad shared env-file exposure with per-service allowlists; keep monitor independent of application DB configuration and limit its credentials. |

## 5. Complete environment-variable classification

The inventory includes direct `process.env` reads across `src/`, `worker/`, `scripts/`; dynamic provider, retention and smoke variables; `env` parameter aliases; parsed env-file reads; and script-assigned environment controls. Variables with identical handling are grouped, but names are explicit.

“Platform UI” means protected instance administration. “Workspace UI” means tenant-owned configuration. Public values can still be integrity-sensitive.

### Service credentials and product configuration

| Priority | Variable(s) | Classification / destination | Evidence |
|---|---|---|---|
| **MUST** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Platform UI, purpose `signin.google`; ID public, secret confidential | `src/lib/auth.ts:12`, `:17` |
| **MUST** | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Platform UI, purpose `signin.github`; ID public, secret confidential | `src/lib/auth.ts:13`, `:18` |
| **MUST** | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Platform integration app; optional owner-managed workspace override; shared Google app family for Gmail/Sheets | `src/integrations/providers/google_sheets.ts:27`; `src/integrations/providers/gmail.ts:29` |
| **MUST** | `SLACK_OAUTH_CLIENT_ID`, `SLACK_OAUTH_CLIENT_SECRET` | Platform integration app plus optional workspace override | `src/integrations/providers/slack.ts:42` |
| **MUST** | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | Platform integration app plus optional workspace override; separate from sign-in | `src/integrations/providers/github.ts:164` |
| **MUST** | `FLOWLINE_EMAIL_RESEND_KEY`, `FLOWLINE_EMAIL_POSTMARK_TOKEN` | Encrypted platform UI secrets | `src/server/email/index.ts:43` |
| **MUST** | `FLOWLINE_EMAIL_PROVIDER`, `FLOWLINE_EMAIL_FROM` | Platform UI configuration; provider enum and validated sender. Outbox remains test/staging-only | `src/server/email/index.ts:23`, `:30` |
| **MUST** | `FLOWLINE_EMAIL_ALLOWED_RECIPIENTS` | Keep operator-controlled sandbox restriction; panel may show its effective policy | `src/server/email/sandbox.ts:1` |
| **MUST** | `FLOWLINE_BILLING_PADDLE_KEY`, `FLOWLINE_BILLING_PADDLE_WEBHOOK_SECRET` | Encrypted platform UI sandbox credentials; separate purposes and revisions | `src/billing/service.ts:40` |
| **MUST** | `FLOWLINE_BILLING_STRIPE_KEY`, `FLOWLINE_BILLING_WEBHOOK_SECRET` | Encrypted platform UI sandbox credentials; latter is Stripe webhook secret | `src/billing/service.ts:37` |
| **MUST** | `FLOWLINE_BILLING_PADDLE_CLIENT_TOKEN` | Platform UI public checkout configuration; intentionally supplied to browser | `src/billing/checkout-page.ts:35`, `:47` |
| **MUST** | `FLOWLINE_BILLING_ALLOW_LIVE`, `FLOWLINE_BILLING_PADDLE_ENV` | Keep operator-controlled safety gates; no UI route can enable live payments | `src/billing/paddle.ts:64`; `src/billing/checkout-page.ts:37` |
| **SHOULD** | `FLOWLINE_BILLING_PROVIDER` | Versioned platform UI configuration with dependency checks; changing provider must not reinterpret existing billing accounts | `src/billing/service.ts:35` |
| **SHOULD** | `FLOWLINE_BILLING_PLANS`, `FLOWLINE_BILLING_FREE_PLAN` | Versioned platform UI configuration, validated against sandbox provider prices and existing entitlements | `src/billing/plans.ts:33` |
| **MUST** | `ANTHROPIC_API_KEY` | Retire tenant runtime env consumption; workspace BYOK UI only; never auto-import | `src/ai/chat.ts:56`; `AIH/docs/ai/IMPLEMENTATION_PLAN.md:95` |
| **MUST** | `FLOWLINE_AI_PROVIDER`, `FLOWLINE_AI_MODEL`, `ANTHROPIC_MODEL` | Retire global tenant routing defaults; use workspace/flow/agent UI references and explicit model selection | `src/ai/chat.ts:52`; `AIH/docs/ai/IMPLEMENTATION_PLAN.md:93` |
| **MUST** | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Retire from cloud tenant runtime; preserve explicit migration errors for legacy local routes | `src/ai/chat.ts:54`, `:93`; `AIH/docs/ai/IMPLEMENTATION_PLAN.md:116` |
| **SHOULD** | `FLOWLINE_SUPPORT_EMAIL`, `FLOWLINE_FEEDBACK_URL` | Public platform UI configuration with existing validation retained | `src/server/beta.ts:37` |

### Bootstrap, infrastructure and security policy

| Priority | Variable(s) | Classification / destination | Evidence |
|---|---|---|---|
| **MUST** | `DATABASE_URL` | Operator secret; stays outside UI | `src/db/index.ts:8`; `worker/index.ts:115` |
| **MUST** | `FLOWLINE_ENCRYPTION_KEY`, `FLOWLINE_ENCRYPTION_KEYS_OLD` | Operator bootstrap KEKs; migrate to separate domain key rings; never stored encrypted under themselves in DB | `src/server/crypto.ts:21` |
| **MUST** | `BETTER_AUTH_SECRET` | Operator auth-signing/encryption root; stays outside UI | `src/lib/auth.ts:22` |
| **MUST** | `BETTER_AUTH_URL`, `FLOWLINE_PUBLIC_URL` | Operator-controlled canonical origins; nonsecret but security-critical | `src/lib/auth.ts:23`; `src/server/connections.ts:256` |
| **MUST** | `FLOWLINE_ENV`, `NODE_ENV` | Operator/runtime execution modes; UI cannot change test/beta/production boundaries | `src/server/email/index.ts:27`; `src/db/index.ts:28` |
| **MUST** | `FLOWLINE_BETA_MODE` | Operator release/access policy; retain invitation-only setting | `src/server/beta.ts:28` |
| **MUST** | `FLOWLINE_BETA_ADMINS` | Existing signup bypass only; keep operator-managed during migration, never grant platform authority from it | `src/server/beta.ts:50`, `:79` |
| **MUST** | `FLOWLINE_EGRESS_ALLOWLIST` | Operator network-security exception policy; never tenant-editable | `src/server/egress.ts:61` |
| **MUST** | `FLOWLINE_CODE_IMAGE`, `FLOWLINE_CODE_SANDBOX` | Operator execution/security policy; never accept arbitrary images through credential UI | `src/server/code-sandbox.ts:12`, `:19` |
| **MUST** | `FLOWLINE_OPS_TOKEN` | Operator monitoring secret; stays independent of DB-backed UI configuration | `src/app/api/ops/status/route.ts:13`; `scripts/ops/monitor.mjs:9` |
| **MUST** | `FLOWLINE_ALERT_WEBHOOK_URL` | Operator secret-bearing destination; keep external monitor usable during DB/app outage | `scripts/ops/monitor.mjs:10` |
| **MUST** | `OPS_BASE`, `OPS_INTERVAL_MS` | Operator monitoring configuration | `scripts/ops/monitor.mjs:8`, `:11` |
| **MUST** | `FLOWLINE_OPS_DATA_DIR`, `FLOWLINE_OPS_BACKUP_DIR` | Operator filesystem paths; no tenant control | `src/app/api/ops/status/route.ts:17` |
| **MUST** | `FLOWLINE_RELEASE_SHA` | Build/deployment provenance; not editable product configuration | `src/server/ops.ts:84` |
| **MUST** | `FLOWLINE_WORKER_CONCURRENCY`, `FLOWLINE_RUN_SEGMENT_TIMEOUT_MS` | Operator capacity/timeout configuration | `worker/index.ts:24`; `worker/runner.ts:16` |
| **SHOULD** | `FLOWLINE_TELEMETRY` | Operator privacy/observability policy; independent of mandatory security audit | `src/server/telemetry.ts:46` |
| **MUST** | `FLOWLINE_RETENTION_RUN_DAYS`, `FLOWLINE_RETENTION_WEBHOOK_DAYS`, `FLOWLINE_RETENTION_TELEMETRY_DAYS`, `FLOWLINE_RETENTION_AUDIT_DAYS` | Operator retention policy; introduce a separately protected platform-security retention rule | `src/server/retention.ts:14`, `:19` |
| **MUST** | `PATH`, `SystemRoot` | Operating-system process environment; never UI inputs | `src/server/code-sandbox.ts:61` |

### Test, release and script-only controls

| Priority | Variable(s) | Classification / destination | Evidence |
|---|---|---|---|
| **MUST** | `FLOWLINE_PROVIDER_OVERRIDE` | Test-only provider endpoint override; reject/ignore outside `FLOWLINE_ENV=test` | `src/server/connections.ts:251` |
| **MUST** | `FLOWLINE_EMAIL_RESEND_TEST_URL`, `FLOWLINE_EMAIL_POSTMARK_TEST_URL`, `FLOWLINE_EMAIL_TEST_TIMEOUT_MS` | Test-only email transport controls | `src/server/email/index.ts:48`, `:60` |
| **MUST** | `FLOWLINE_TEST_PADDLE_JS_URL` | Test-only script override; never configurable through UI | `src/billing/checkout-page.ts:46` |
| **MUST** | `FLOWLINE_AI_TEST_OVERRIDE` | AI-worktree-only test transport control | `AIH/src/ai/hub/transport.ts:20` |
| **MUST** | `SMOKE_A_EMAIL`, `SMOKE_A_PASSWORD`, `SMOKE_B_EMAIL`, `SMOKE_B_PASSWORD` | Release-runner identities/secrets; not application configuration or platform credentials | `scripts/release/smoke.mjs:62` |
| **MUST** | `STAGING_DB_PASSWORD` | Operator staging DB secret, also read from parsed env files | `scripts/release/backup-restore.mjs:43`; `scripts/load/beta.mjs:55` |
| **MUST** | `NODE_TLS_REJECT_UNAUTHORIZED` | Script-assigned TLS control; never UI-managed and never allowed to disable verification for real credential transport | `scripts/release/verify-beta-stack.mjs:20` |
| **MUST** | `NEXT_DIST_DIR` | Script-assigned test build isolation | `scripts/dev-test.mjs:7` |
| **MUST** | `FLOWLINE_LIVE_DRYRUN` | Script-assigned live-test dry-run control | `scripts/live-dryrun.mjs:6` |
| **MUST** | `FLOWLINE_IMAGE` | Script-assigned deployment image selection; stays operator-managed | `scripts/release/rollback.mjs:51` |

**MUST — also retain deployment-only infrastructure variables outside UI.** Beyond the requested source scan, beta compose reads `BETA_DOMAIN`, `BETA_DB_PASSWORD`, `BACKUP_RETENTION_DAYS` and supplies PostgreSQL’s `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `PGPASSWORD`. These are deployment configuration, not platform-provider credentials. (`deploy/beta/docker-compose.beta.yml:28`, `:42`, `:86`)

**MUST — keep existing tenant API-key integrations in workspace UI.** Notion, Airtable, Linear, HubSpot, Zendesk, Snowflake, Postgres and Stripe integration credentials already use provider connect fields; they are not missing platform env migrations. GitHub PATs likewise remain tenant credentials. (`src/integrations/providers/notion.ts:85`, `airtable.ts:24`, `linear.ts:96`, `hubspot.ts:14`, `zendesk.ts:21`, `snowflake.ts:90`, `postgres.ts:168`, `stripe.ts:98`, `github.ts:167`)

## 6. Required test list

These tests are proposed acceptance evidence, not reported passes.

| Priority | Test | Required proof / code basis |
|---|---|---|
| **MUST** | Platform authorization matrix | Anonymous/non-admin platform access denied; authenticated non-admin gets 404; workspace owner/editor and beta-allowlisted email cannot become platform admin. `src/server/access.ts:45`; `src/server/beta.ts:79` |
| **MUST** | Bootstrap and recovery | Expired/replayed challenges fail; concurrent setup yields one first admin; email setup works without existing email credentials; normal panel stays locked until real verification and MFA; deleting admins does not reopen setup. `src/lib/auth.ts:33`; `src/server/email/index.ts:43` |
| **MUST** | Step-up lifecycle | Old session, old MFA, different session, replayed proof and revoked admin fail. Tenant SSO cannot manufacture admin assurance. `src/db/schema.ts:32`; `src/server/sso.ts:430` |
| **MUST** | Cross-workspace isolation | Owner A cannot inspect/use/replace/test/revoke B’s override, including direct service calls, forged app references and callback completion. `src/server/connections.ts:182` |
| **MUST** | AAD substitution | Swap entire envelopes, wrapped DEKs or key IDs across records, workspaces, platform/workspace domains, purposes, providers, environments and revisions; all mismatches fail authentication. `src/server/crypto.ts:41` |
| **MUST** | Envelope validation and migration | Wrong key, malformed encoding, truncated/oversized data, invalid nonce/tag and unknown version fail safely; migrated rows reject v1 downgrade; rewrap preserves plaintext semantics. `src/server/crypto.ts:44` |
| **MUST** | Canary non-disclosure | Enter a synthetic secret through UI; inspect responses, HTML/RSC, DOM after cleanup, local/session storage, IndexedDB, caches, drafts, logs, audit, telemetry, run data and error paths. Only the intended submission/provider transport may contain plaintext. `src/server/connections.ts:27`; `src/lib/drafts.ts:30` |
| **MUST** | Evidence safety | Canary must not appear in retained traces, HARs, videos or screenshots. Disable secret-bearing trace capture during entry/submission; perform leak assertions in memory and save only sanitized results. Current Playwright retains failure traces. `playwright.config.ts:31` |
| **MUST** | Error reflection | Fake provider echoes the exact arbitrary canary in JSON errors, nested errors, HTTP redirects and malformed responses; no echoed value reaches URL, response, logs, status or audit. `src/server/connections.ts:326`; `src/app/api/oauth/callback/route.ts:35` |
| **MUST** | CSRF and body limits | Cross-origin, missing/null Origin, forged fetch metadata, missing/replayed CSRF token, wrong content type and chunked oversized bodies fail. OAuth callbacks still work with valid state. `src/server/http.ts:29`, `:70` |
| **MUST** | Distributed limits | Multiple web processes cannot exceed the combined test/write/MFA limit; no arbitrary email test recipient or unrestricted provider probe. `src/server/rate-limit.ts:17` |
| **MUST** | OAuth-state binding | Wrong user/session/workspace/provider/app/revision, revoked membership, expiry and replay fail; revoked state causes no token exchange. `src/server/connections.ts:330` |
| **MUST** | Endpoint and SSRF controls | Custom endpoints, credential-bearing URLs, private/metadata IPs, DNS rebinding and every redirect status are refused for credential exchange. `src/server/egress.ts:79`, `:122`, `:177` |
| **MUST** | App switch | Connections issued by app A continue using A after default changes to B; A’s tokens never reach B’s token exchange; clearing an override causes no platform fallback. `src/server/connections.ts:227` |
| **MUST** | Restart-free rotation | With two web processes and a worker running, activate new email, billing, integration and sign-in credentials; next eligible operation uses the new revision without restart, including when previously unconfigured. `src/billing/service.ts:34`; `src/lib/auth.ts:11` |
| **MUST** | Dual-secret expiry | In-progress authorization uses its accepted pinned revision; retired/revoked revisions fail; fallback never retries ambiguous consumed grants. `src/server/connections.ts:291`; `tests/contract/oauth.test.ts:106` |
| **MUST** | Revocation races | Pause a refresh/replace/test response, commit revocation, then release it; no operation restores active state or commits stale credentials. Repeat for AI replace/disconnect. `src/server/connections.ts:234`; `AIH/src/ai/hub/connections.ts:194` |
| **MUST** | Missed invalidation | Drop notification delivery and reconnect listeners; DB status still prevents revoked-key use. `worker/index.ts:115` |
| **MUST** | External revocation | Provider-specific revoke works against contract doubles; local denial succeeds even if remote revoke fails; UI reports the difference. `src/server/connections.ts:381` |
| **MUST** | Billing separation | Reject live keys/tokens under beta policy; webhook old/new-secret overlap remains bounded; replay and account mapping protections remain intact. `src/billing/paddle.ts:64`; `src/billing/checkout-page.ts:38` |
| **MUST** | Migration/no fallback | DB-empty, DB-unavailable, cleared, revoked or undecryptable credentials never fall back to populated env values. Import is explicit, allowlisted, non-overwriting and excludes AI BYOK. `src/server/connections.ts:246`; `AIH/docs/ai/IMPLEMENTATION_PLAN.md:98` |
| **MUST** | Audit durability | Mutation/audit commit together; audit failure prevents successful mutation; notification delivery retries independently; tenant deletion does not remove platform security events. `src/server/audit.ts:44`; `src/db/schema.ts:602` |
| **MUST** | Social-token storage | Real sign-in callback path persists no plaintext retained provider tokens and cannot return them through account APIs; encryption migration preserves login behavior. `src/db/schema.ts:58`; `src/app/api/auth/[...all]/route.ts:5` |
| **MUST** | Arabic/English UI | Arabic-first RTL, LTR credential fields, key parity, keyboard-safe inputs, accessible validation, app-source disclosure and disabled-state explanations. Existing integration UI uses `useT()` at `src/app/w/[slug]/integrations/page.tsx:252`. |
| **SHOULD** | Backup restore | Restored configuration cannot resurrect known revoked credentials; required KEKs and audit recovery data are handled separately and tested. `deploy/beta/docker-compose.beta.yml:81` |

**MUST — distinguish contract proof from provider proof.** The existing OAuth contract suite explicitly exercises the fake provider implementation. Extend it, but do not label real Google/Slack/GitHub rotation or revocation verified until authorized sandbox tests exercise those providers. (`tests/contract/oauth.test.ts:5`)

**MUST — run the repository gates when implemented:** lint, typecheck, unit, contract and integration tests; UI E2E in Chromium and Firefox, plus the prescribed WebKit Docker lane. Stop the test worker before integration tests, keep all tests on `flowline_test`/port 3100, and attach sanitized evidence to the tested SHA. No such execution was performed in this read-only review.


