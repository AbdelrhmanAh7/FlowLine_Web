# Credentials in the UI: combined security design

**Owner decision (2026-09-29):** "Everything Google, Slack or whatever should be set on inputs and fully secure." The
owner chose **both** of the following:

- **A.** A platform admin panel for Flowline's own service credentials.
- **B.** An optional per-workspace "use my own OAuth app" override.

This is combined from two independent reviews of the same question (`artifacts/security-review/QUESTION.md`). Each
reviewer read the code without seeing the other's answer:

- Fable 5.1 → `artifacts/security-review/credentials-fable-5.1.md`
- Codex gpt-6-astra → `artifacts/security-review/credentials-codex-gpt-6-astra.md`

The implementation lead verified the key findings against the code (e.g. `src/server/crypto.ts:32-49` calls
`createCipheriv` with no `setAAD`).

## 1. Three credential domains

| Domain | Who manages | Examples | Used by |
|---|---|---|---|
| **Bootstrap** (operator env, never UI) | Server operator | `DATABASE_URL`, `FLOWLINE_ENCRYPTION_KEY(S)`, `BETTER_AUTH_SECRET`, `FLOWLINE_BILLING_ALLOW_LIVE` (a safety switch that stays out of reach of a click) | Process start |
| **Platform credentials** (A) | Platform admins only, with MFA + step-up | Sign-in apps (`signin.google`, `signin.github`); shared integration apps (`integration.google`, `integration.slack`, `integration.github`, …); email (`email.resend`/`postmark`); billing (`billing.paddle.sandbox`: key, webhook secret, client token) | Purpose-specific server services only; never returned to anyone |
| **Workspace credentials** | Workspace owners (`oauthapp.manage`), existing integration caps, AI (`ai.manage` / `use_roles`) | Workspace OAuth-app overrides (B), SaaS connection tokens, AI BYOK keys | Server/worker via connection references |

An override never affects sign-in, email, billing or another workspace.

## 2. MUST requirements

The two reviews agree on all of these.

### Identity and access
1. **A separate `platform_admin` principal** (keyed by `user.id`), checked on every request by
   `requirePlatformAdmin()` in a new `src/server/platform-access.ts`.
   - It is never derived from workspace roles, SSO, invites, sign-up or `FLOWLINE_BETA_ADMINS`.
   - Non-admins get **404**; API-key bearers are refused (session cookies only).
   - `emailVerified` is required.
2. **MFA (TOTP)** is enrolled before the panel unlocks, using the better-auth `two-factor` plugin (installed, 1.7.6).
   - **Step-up** (TOTP or password) is required before every write: a 10-minute elevation row bound to the session
     token hash.
   - The session must be ≤ 24 h old.
   - Workspace SSO never satisfies platform step-up.
3. **Bootstrap** by an operator CLI: `scripts/admin/bootstrap.mts` creates a hashed, single-use, short-lived setup
   challenge bound to one identity.
   - It is serialised with a DB lock, and completion is recorded permanently. Deleting every admin does not reopen
     setup.
   - Recovery is an explicit, audited operator action.
   - **Email bootstrap:** the setup session may configure only the email provider first. Verification then goes only to
     the pre-bound identity, followed by MFA enrolment, then atomic admin creation.

### Storage
4. **Crypto v2 envelope:**
   - a data key per secret, wrapped by a key-encryption key (separate key rings for **platform** and **workspace**);
   - AES-256-GCM with **AAD** = `flowline:v2:<table>:<rowId>:<scope>:<owner>:<provider>:<purpose>`;
   - row ids are generated app-side before encryption;
   - strict parsing: exact segments, lengths, size cap, unknown version/key → error.
5. **Migration without a downgrade path:**
   - v1 stays readable only for rows explicitly marked legacy; they are backfilled with trusted row context;
   - new rows, platform secrets and AI BYOK are v2 only;
   - migrated domains refuse v1 (otherwise planting a legacy blob would bypass AAD).

   Existing users: `connection`, SSO config, webhook secrets (`publish.ts`), worker.
6. **Separate tables:**
   - `platform_secret`: purpose-keyed, current + previous revision with `prev_valid_until`, hint, revision/epoch,
     `set_by`/`set_at`, verification state;
   - `workspace_oauth_app`;
   - `connection.oauth_app_id` + a client-id snapshot, with composite constraints (the app's workspace = the
     connection's workspace);
   - `oauth_state` bound to app id + revision + initiating session + workspace + user + provider + redirect URI + PKCE.

### Write-only UI and HTTP
7. **Metadata projections only.**
   - Never the value, the ciphertext or the provider's raw error.
   - The hint is the last 4 characters only if the secret is ≥ 32 characters; otherwise just "set on <date> by <admin>".
   - OAuth **client IDs are public identifiers** and may be shown; client **secrets** never are.
8. **Explicit semantics:**
   - secret omitted = keep;
   - `""` = 400;
   - revoke/clear are separate explicit actions;
   - replace is compare-and-swap on revision.
9. **Inputs:**
   - `type=password autocomplete=new-password data-1p-ignore data-lpignore data-bwignore`;
   - uncontrolled, cleared on success, close and navigation;
   - never in the TanStack cache, mutation retries, offline drafts, URLs or RSC payloads.
10. **Endpoints:**
    - `route()` CSRF + strict Origin, body caps, `Cache-Control: no-store`;
    - distributed `checkRate` limits: test 5/min, writes 20/min, step-up 5/5 min, bootstrap/MFA attempts;
    - fixed error codes.

### OAuth correctness
11. **Fixed provider endpoints.** Customers supply only a client ID and secret; authorize, token and revoke URLs, scopes,
    redirect URIs and auth methods stay reviewed code.
    - Token calls go through `safeFetch` with an exact host, `maxRedirects: 0`, size caps and timeouts.
12. **Validation (resolved; see §3):**
    - a save is `CONFIGURED_UNVERIFIED`;
    - a token-endpoint probe can only reject obviously wrong credentials (`invalid_client`);
    - **VERIFIED** only after a successful real Connect for that revision and purpose.
    - Show the exact redirect URIs verbatim: `/api/oauth/callback` and `/api/auth/callback/<provider>`.
13. **App identity binding:**
    - existing connections keep refreshing with their **issuing** app;
    - a default change affects only new authorisations;
    - clearing an override never silently moves connections onto the platform app;
    - ambiguous legacy connections → `reconnect_required` (never guessed).
14. **Callback re-checks** membership, capability and app revocation before the exchange and before storing.
    - Token responses are schema-validated.
    - Refresh writes are fenced on the app epoch and connection version.
15. **Client-auth failure (rotation) is not user-token failure.** `refreshLocked` must not mark connections expired or
    pause flows on `invalid_client`. It fails the step and alerts admins, and retries current → previous within the
    grace window.
16. **Per-workspace override** (B):
    - owner-only `oauthapp.manage`;
    - members see the app's provenance (workspace-managed app, client ID, scopes, configuring owner) before consent;
    - deleting or switching an app marks exactly its connections for reconnect, with the affected count shown first;
    - audited (`oauth_app.*`).

### Runtime, rotation and revocation
17. **The UI/DB is the only runtime source.** No "DB, otherwise env" fallback.
    - Env values move in only through one explicit, audited **Import from environment** per purpose; never
      automatically.
18. **No stale caches.** Resolve per operation, or cache keyed by an immutable revision with a DB status check.
    - Billing's indefinite adapter cache is removed.
    - better-auth becomes a **revision-keyed auth factory** with a request-local snapshot, so rotating sign-in apps
      needs no restart.
19. **Revocation is authoritative in the DB**, and the boundary is stated honestly: in-flight requests can't be
    recalled.
    - Provider-specific revocation adapters are used where available (GitHub's revoke URL needs its own adapter).
    - A dual-secret window applies only where the provider supports overlap; interruption is shown honestly otherwise.

### Audit and leakage
20. **A `platform_audit_event` table:**
    - it doesn't cascade from workspaces and is excluded from `pruneOnce` (kept ≥ 730 days);
    - written in the same transaction as the change;
    - typed fields (actor, assurance, action, target, purpose, old/new revision, result, request id);
    - never values, suffixes, bodies, ciphertext or raw provider errors;
    - metadata-only notifications to other admins, via an outbox.
21. **Bounded internal error codes everywhere,** including `statusReason` and callback redirects (no provider
    `error_description` in URLs).
    - Caddy redacts OAuth `code`, `state` and `error*` query values.
    - Auth callback and secret-admin responses use `Referrer-Policy: no-referrer`.
22. **Social-login tokens stored by better-auth are encrypted,** through a tested adapter transformation. Enabling the
    library flag alone is not evidence.

## 3. Where the reviews differed, and the decision

| Topic | Fable 5.1 | Codex gpt-6-astra | Decision |
|---|---|---|---|
| OAuth credential check | Bogus-grant token probe: `invalid_client` vs `invalid_grant` | A probe doesn't prove the secret; require a real Connect | **Both.** The probe gives early rejection only; "Verified" requires a real Connect for that revision |
| First admin | CLI grants directly | CLI issues a one-use challenge; solve the email bootstrap first | **Codex:** challenge + email-first setup + MFA, then atomic grant |
| Envelope (data key + wrapping) | SHOULD | MUST | **MUST** |
| Sign-in credential rotation | SHOULD rebuild better-auth (or document a restart) | MUST revision-keyed factory | **MUST**, subject to the owner decision in §5 |

## 4. Delivery plan

On branch `ai-hub`, after Wave A lands; it shares crypto v2.

| Step | Scope |
|---|---|
| S1 | Crypto v2 envelope + AAD + key rings + strict parser; migrate existing ciphertext users; AI BYOK on v2 (sent to Wave A) |
| S2 | `platform_admin`, bootstrap challenge, MFA/step-up, `platform_audit_event` + notifications outbox |
| S3 | Platform credentials UI + resolution: integration OAuth apps (`connections.ts`), email, Paddle (drop the cache), sign-in (auth factory); Import-from-env; remove runtime env reads |
| S4 | OAuth hardening: state binding, callback re-checks, token schema, refresh fencing, `invalid_client` handling, bounded errors, Caddy redaction, social-token encryption |
| S5 | Per-workspace OAuth app override (B) + consent provenance + switch/delete impact |
| S6 | Tests (below) + Codex review + Chrome QA |

**Required tests:**
- **AAD swaps:** row, table, workspace, provider and purpose each fail.
- **v1 downgrade** refused in migrated domains.
- **Canary secret** absent from responses, HTML/RSC, browser storage, logs, audit, telemetry, the email outbox,
  artifacts and screenshots (CI grep).
- **Non-admin gets 404,** including with an API-key bearer and a workspace owner of several workspaces.
- **Rotation** with web and worker running: no restart and no paused flows.
- **Revoked secret** fails closed even with the env var still set.
- **App switch** expires exactly its own connections.
- **Callback** after membership removal is refused.
- **Refresh vs revoke race** never resurrects `active`.

## 5. Owner decisions (2026-09-29)

1. **TOTP is required for platform admins from day one.** The panel stays locked until an authenticator is enrolled,
   and step-up uses TOTP.
2. **Sign-in app rotation is live, with no restart.** better-auth becomes a revision-keyed auth factory with a
   request-local snapshot and callback dispatch bound to the initiating revision (MUST, fully tested).
3. **The email recipient allowlist and the billing plans list move to the admin panel now.** They are validated
   platform settings (not secrets), versioned and audited, and take effect with no restart.
   - Live-payment enablement (`FLOWLINE_BILLING_ALLOW_LIVE`) **stays in operator env**, as a safety switch that isn't
     one click away.
   - Paddle's sandbox/live mode stays guarded as before.
