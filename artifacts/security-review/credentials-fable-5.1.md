# Flowline — moving platform and integration credentials into secure UI inputs

Security design + threat review. Author: Fable 5.1 (independent security architect). Read-only review of
`FlowLine` (branch `phase-4`, HEAD 1a9883f) and `FL-wt-aihub` (branch `ai-hub`, HEAD 6838bdb). Every file:line below was
read in those trees. Priority tags: **MUST** (ship-blocking for the feature), **SHOULD** (do before the private beta uses
it for real accounts), **COULD** (nice to have).

## 0. Executive summary

The pieces that already exist are the right shape: AES-256-GCM at rest with key ids (`src/server/crypto.ts:32-50`),
a write-only per-workspace OAuth secret with an "unverified until a real sign-in succeeds" gate (`src/server/sso.ts:36-48,
110-135, 501-506`), a masked-hint pattern (`FL-wt-aihub/src/ai/hub/credentials.ts:21-23`), a same-origin CSRF check on
every `route()` handler (`src/server/http.ts:70-86`), a DB-backed sliding-window rate limiter (`src/server/rate-limit.ts:14-27`),
allow-listed telemetry props (`src/server/telemetry.ts:21`), key-name redaction in audit data (`src/server/audit.ts:53`,
`src/server/redact.ts:34`) and an SSRF-safe egress path that refuses to follow a token-exchange body to a different origin
(`src/server/egress.ts:183-188`).

What is missing, in order of severity:

1. **No platform-admin identity exists.** `FLOWLINE_BETA_ADMINS` is a sign-up allowlist only (`src/server/beta.ts:79`);
   nothing in `src/server/access.ts` or `src/lib/permissions.ts` knows an instance-level role. A new, separate trust
   boundary is needed (§1).
2. **`crypto.ts` has no AAD and no envelope.** `createCipheriv` is called without `setAAD` (`crypto.ts:35`), so any
   `secret_enc` ciphertext decrypts under any row, table, workspace or purpose as long as `key_id` matches. A DB-level
   attacker (backup file, SQL injection, a misplaced `UPDATE`) can swap ciphertexts between rows. Fix in §2.
3. **OAuth client credentials are read from `process.env` at four points in `src/server/connections.ts`**
   (`245-247`, `295`, `312`, and transitively `227`/`344`), and better-auth's social providers are frozen at module load
   (`src/lib/auth.ts:16-18`). The billing adapter is cached forever (`src/billing/service.ts:26,34`). Rotation without a
   restart needs all of these to become read-through (§6).
4. **A secret rotation would today cascade into paused flows.** `refreshLocked()` treats every token-endpoint error as a
   dead refresh token and *commits* `status=expired` + pauses flows (`connections.ts:218-228`). If the client secret
   changes between read and request, every expiring connection would be marked expired. The retry/dual-secret logic in
   §6 is a MUST.
5. The append-only audit table requires a `workspace_id` (`src/db/schema.ts:602-604`) and is pruned after 365 days
   (`src/server/retention.ts:14,35`); platform events need their own table and retention (§8).

## 1. Trust boundary: who is a "platform admin"

### 1.1 Model (MUST)

- New table `platform_admin(user_id pk → user.id, granted_at, granted_by text, revoked_at, totp_required bool default
  true)`. Membership is **a row**, checked on every request (no caching in the session), so revocation is immediate.
- Platform admin is orthogonal to workspace roles. `requireWorkspace()` (`access.ts:45-55`) and the capability matrix
  (`permissions.ts:9-33`) are never consulted for the panel, and `platform_admin` is never consulted for workspace
  routes. No `role === "owner"` shortcut anywhere.
- Non-admins get **404** on every `/api/platform/*` route and on the panel pages, mirroring `access.ts:41-44` and the
  ops route (`src/app/api/ops/status/route.ts:16`). Do not return 403 (it confirms the panel exists).
- Panel routes accept **session cookies only**. Workspace API keys (`audit.ts:9` has an `apikey` actor) must be rejected:
  `requirePlatformAdmin()` calls `getCurrentUser()` (`access.ts:29-33`), never the API-key resolver.
- The admin's account must have `emailVerified = true` (`sso.ts:451` shows the column exists) — refuse otherwise.

New module `src/server/platform-access.ts`:

```ts
export async function requirePlatformAdmin(): Promise<CurrentUser & { adminSince: Date }>  // 404 if not a live row
export async function requireStepUp(user, opts: { maxAgeMs: 10 * 60_000 }): Promise<void>  // 403 STEP_UP_REQUIRED
```

### 1.2 Bootstrapping the first admin

- **MUST: a CLI grant, not an env allowlist, is the source of truth.** `scripts/admin/grant.mjs <email>` (run on the host
  with `DATABASE_URL`, the same way `scripts/db-peek.mjs:4` already connects) inserts the `platform_admin` row after
  checking the user exists and is email-verified, and writes a `platform_audit_event` with `actor = "cli"`. It refuses
  when `FLOWLINE_ENV=test` is not set and the DB name is `flowline_test` (keeps test/dev separated). Later admins are
  added from the panel by an existing admin under step-up.
- **MUST NOT reuse `FLOWLINE_BETA_ADMINS`.** It bypasses invite-only sign-up (`beta.ts:79`), so an entry there lets a new
  account be *created*; conflating it with authorization means "can register" ⇒ "controls every OAuth app and the
  billing key". Keep it a sign-up list. Add a comment in `beta.ts` saying so.
- **COULD:** `FLOWLINE_PLATFORM_ADMIN_BOOTSTRAP=<email>` consumed **only while `platform_admin` is empty** and only for a
  verified account, then ignored forever (log a warning if it is still set afterwards). Useful for automated staging.
- **COULD:** a one-time setup token printed to the server log on first boot. Not recommended for this deployment: the
  container logs are retained (`deploy/beta/docker-compose.beta.yml:20`) and the CLI path already exists.

### 1.3 Step-up, session age, MFA

- **MUST: step-up before any write** (create / replace / rotate / revoke / import / test). Implementation that fits the
  code today: a `platform_stepup(session_token_hash pk, user_id, method, verified_at, expires_at)` row created by
  `POST /api/platform/step-up` after re-verifying either the account password or a TOTP code. Password verification
  can use better-auth's own context, as `sso.ts:498` already does for sessions: `const ctx = await auth.$context;
  ctx.password.verify({ hash, password })` against the `account` row with `providerId = "credential"`. TTL 10 minutes,
  bound to the sha256 of the current session token (so a copied cookie on another session isn't stepped up).
- **MUST: TOTP for platform admins.** better-auth 1.7.6 ships the `two-factor` plugin
  (`node_modules/better-auth/dist/plugins/two-factor/`). Enable it in `src/lib/auth.ts:85` `plugins`, and make
  `requirePlatformAdmin()` refuse (404 → after sign-in a dedicated "enrol TOTP" page) when the admin has no enrolled
  second factor. Social-only admins (Google/GitHub sign-in, no password) step up with TOTP; password admins may use
  either. Recovery codes are shown once and stored hashed (the plugin does this).
- **MUST: shorter panel session.** The app session is 7 days with a 1-day sliding update (`auth.ts:49-52`). Don't shorten
  it globally; instead require the session's `createdAt` to be ≤ 24 h old for the panel (older ⇒ sign in again). The
  session row has `createdAt` via the drizzle adapter (`auth.ts:24-27`).
- **SHOULD:** re-check step-up on the *server* for every mutating call, never trust a "stepped up" flag in the client.
- **COULD:** IP allowlist for `/admin/*` and `/api/platform/*` in `deploy/beta/Caddyfile` (add to the `@internal`
  matcher style block at line 6) for the beta host.

### 1.4 Escalation paths to close

| Path | Why it matters | Mitigation |
|---|---|---|
| Workspace owner invents "platform" capability | `permissions.ts` matrix is client-readable and drives disabled controls only | Platform checks live in `platform-access.ts`, not in `CAPABILITIES` (MUST) |
| SSO-created accounts | `sso.ts:444-470` creates users; `defaultRole` may be `owner` (`sso.ts:100`) | Workspace-only effect; `platform_admin` is keyed by `user_id` and never inserted from SSO/invite/sign-up paths (MUST) |
| Account takeover of an admin via email change | would inherit the row | better-auth `changeEmail` stays disabled (not enabled in `auth.ts`); reset-password links are single-use tokens (`auth.ts:34-36`); TOTP covers the panel anyway |
| Admin removed from `platform_admin` but session alive | stale privilege | row checked per request; also delete `platform_stepup` rows on revoke (MUST) |
| Test-only endpoints (`/api/test/*`) seeding an admin | `FLOWLINE_ENV=test` gates them (`src/server/faults.ts:13`); Caddy 404s them (`Caddyfile:6-7`) | keep; the grant script's DB-name guard prevents accidents on dev DB |

## 2. Storage

### 2.1 What `crypto.ts` does today and what to change

Read: `src/server/crypto.ts`

- Key from env, id = first 12 hex of sha256(key) (`14-18`); old keys for decryption only (`25-28`). Good.
- `encryptSecret` → `v1.<iv>.<tag>.<ct>` with **no AAD** (`34-38`). `decryptSecret` trusts the caller's `keyId` and the
  format only (`41-50`).
- One key domain for everything: connection secrets, webhook secrets, PKCE verifiers (`connections.ts:281`,
  `sso.ts:239`), SSO client secrets (`sso.ts:116`), AI keys (`FL-wt-aihub/src/ai/hub/credentials.ts:18`).
- Consequence: **ciphertext is portable across rows and tables.** Concretely, `UPDATE connection SET secret_enc = (select
  secret_enc from connection where id = <victim>)` on an attacker's row in another workspace decrypts the victim's token
  in the attacker's workspace at the next run (`connections.ts:197`). The workspace check at `connections.ts:185`
  compares the *row's* workspace, not the ciphertext's origin, so it does not catch this.

Changes (MUST unless marked):

```ts
// src/server/crypto.ts (additions; keep v1 decrypt for existing rows)
export interface Aad { table: string; id: string; scope: "platform" | "workspace"; owner: string /* "platform" | workspaceId */; provider: string; purpose: string }
export function aadString(a: Aad) { return `flowline:v2:${a.table}:${a.id}:${a.scope}:${a.owner}:${a.provider}:${a.purpose}`; }

export function encryptSecretV2(value: unknown, aad: Aad, ring: "workspace" | "platform" = "workspace"): { ciphertext: string; keyId: string }
export function decryptSecretV2<T>(ciphertext: string, keyId: string, aad: Aad): T   // throws AAD_MISMATCH on tag failure
```

- **AAD (MUST):** `cipher.setAAD(Buffer.from(aadString(aad)))` before `update`, and the same on decrypt. The row id must
  exist before encryption: generate it with `randomUUID()` in the service and pass it to `.values({ id, ... })` instead of
  relying on `defaultRandom()` (`schema.ts:313`). Re-encrypt on every write with the *same* AAD; a swapped ciphertext then
  fails the GCM tag.
- **Envelope (SHOULD):** per-secret 32-byte DEK, payload = AES-256-GCM(DEK, iv, AAD); DEK wrapped = AES-256-GCM(KEK, iv2,
  AAD = `kek:${keyId}:${aadString}`). Format: `v2.<kekId>.<wrappedDek>.<iv2>.<tag2>.<iv>.<tag>.<ct>`. Benefit: master-key
  rotation re-wraps DEKs without touching payloads, and a future KMS/HSM only has to wrap 32 bytes. For this beta the
  honest note is that AAD is the security win; envelope is operational hygiene.
- **Two key rings (SHOULD):** `FLOWLINE_PLATFORM_ENCRYPTION_KEY` (+ `_OLD`) for the platform table, defaulting to the
  workspace key when unset so nothing breaks; refuse to start in `FLOWLINE_ENV=beta|production` if both are the same
  value. Separate rings mean a leaked workspace-side dump + key does not expose the OAuth app secrets.
- **Purpose separation for existing callers (SHOULD):** move `oauth_state.code_verifier_enc` (`schema.ts:353`, stored as
  JSON of `{ciphertext,keyId}` at `connections.ts:281`) and `sso_state` to v2 with `purpose: "pkce"`; connections to
  `purpose: "connection"`; webhook to `purpose: "webhook"`. A migration script re-encrypts in batches under the row lock;
  until then `decryptSecret` (v1) still works, so this can be phased.
- **Key-id check (MUST):** `decryptSecretV2` refuses a `keyId` not in the ring *and* refuses a v1 blob for a v2 row once
  migrated (prevents downgrade by replacing a row's blob with an old, un-AAD'd one from a backup).
- Keep `sha256Hex`, `canonicalJson`, `randomToken` as they are.

### 2.2 Tables (MUST) — platform and workspace secrets never share a table

```
platform_secret
  id uuid pk (generated app-side), purpose text unique   -- e.g. "oauth_signin:google", "oauth_app:google", "oauth_app:slack",
                                                            "oauth_app:github", "email:resend", "email:postmark",
                                                            "billing:paddle_api", "billing:paddle_webhook"
  public_id text                                            -- client id / sender address / non-secret half (nullable)
  secret_enc text, key_id text                              -- current
  prev_secret_enc text, prev_key_id text, prev_valid_until timestamptz   -- dual-secret window (§6)
  secret_hint text                                          -- "••••" + last 4, only when secret length ≥ 32; else null
  cred_version int default 1, set_at, set_by text (user id), verified_at, verified_via text ("probe" | "connect" | null)
  revoked_at timestamptz, revoked_by text
  settings jsonb                                            -- non-secret: paddle env, allowed recipients, from address…

platform_setting (non-secret instance config, e.g. FLOWLINE_BILLING_PADDLE_CLIENT_TOKEN which is public by design, .env.example:71-76)

workspace_oauth_app
  id uuid pk, workspace_id → workspace (cascade), provider text, client_id text
  client_secret_enc, key_id, prev_* (same trio), secret_hint, cred_version, set_at, set_by, verified_at, verified_via
  enabled bool default false           -- can't be enabled until verified (mirror sso.ts:129-135)
  unique(workspace_id, provider)

connection      + oauth_app_id uuid null   -- null = platform app; else → workspace_oauth_app.id (on delete set null)
                + oauth_app_client_id text -- snapshot of the client id the tokens were issued to
oauth_state     + oauth_app_id uuid null, + client_id text   -- the app that started this flow (see §6.4)

platform_admin, platform_stepup           -- §1
platform_audit_event                       -- §8
```

AAD for a platform row: `{table:"platform_secret", id, scope:"platform", owner:"platform", provider:"google",
purpose:"oauth_app"}`; for a workspace app: `{table:"workspace_oauth_app", id, scope:"workspace", owner:workspaceId,
provider, purpose:"oauth_app"}`. Because `owner` is inside the AAD, moving a ciphertext to another workspace's row fails
even if ids were guessed.

Migration via `pnpm db:generate` (project rule). Backups: the nightly `pg_dump` (`docker-compose.beta.yml:83-103`)
contains these ciphertexts; the AAD change does not alter the backup threat model (key still lives only in env) but does
stop row-swap on a restored copy.

## 3. Write-only inputs

- **MUST: no read path returns secret material.** A projection function per table, exactly like `publicSsoConfig`
  (`sso.ts:36-48`) and `publicConnection` (`connections.ts:27-44`): `{ purpose, publicId, hasSecret, secretHint, setAt,
  setBy: {email}, verifiedAt, verifiedVia, credVersion, prevValidUntil, revokedAt }`. Server Components must only ever
  receive this projection (never the row), and the `select()` in the service must list columns, not `select()` all.
- **MUST: masked indicator.** Store `secret_hint` at write time (the ai-hub `keyHint` pattern,
  `FL-wt-aihub/src/ai/hub/credentials.ts:21-23`, and `key_hint` column at `FL-wt-aihub/src/db/schema.ts:1036`). Rule:
  last 4 only when the secret is ≥ 32 characters (Google `GOCSPX-…` secrets and provider API keys qualify; short GitHub
  40-hex secrets do too; anything shorter shows "set on <date> by <email>" only). Client ids are not secrets and are shown
  in full (they appear in authorize URLs anyway, `connections.ts:295`).
- **MUST: replace vs clear semantics.** `PUT /api/platform/secrets/:purpose` with body `{ publicId?, secret?: string,
  settings? }`: `secret` present and non-empty ⇒ replace (cred_version+1, previous kept for the grace window); `secret`
  absent/undefined ⇒ keep (the `sso.ts:115-123` rule). An empty string is a **400**, never "clear". Clearing is a separate
  `DELETE …/secret` (= revoke, §6). Zod: `secret: z.string().min(8).max(4096).optional()` — never `.default("")`.
- **MUST: never echo input in errors.** `route()` returns `details: result.error.issues` for validation failures
  (`http.ts:57,106`). Zod 4 issues omit `input` by default, but a custom `refine` message could include it. Validate the
  secret with plain `z.string().min().max()` and keep the human message fixed ("Paste the secret exactly as the provider
  shows it"). Add a unit test that a failing 5-char secret is not in the 400 body.
- **MUST: browser handling.**
  - `<input type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore
    name="platformSecretValue" spellCheck={false}>` — `autocomplete="off"` alone is ignored by Chrome for password fields;
    `new-password` stops autofill, the vendor attributes stop 1Password/LastPass/Bitwarden capture. Never `name="password"`.
  - Hold the value in an uncontrolled `ref`, submit as JSON body over POST/PUT, clear the ref and reset the form on
    success **and** failure. No `useSearchParams`, no `router.push` with the value, no `localStorage`/`sessionStorage`/
    IndexedDB draft persistence for these forms (grep the panel for `localStorage` in CI, see §10).
  - Response of the write returns the projection only (`hasSecret: true`), never the value.
  - Add `Cache-Control: no-store` on every `/api/platform/*` response (the ops route does this at
    `src/app/api/ops/status/route.ts:18`).
- **MUST: server-side leak channels.**
  - Logs: wrap everything in `safeErrorText`/`redactString` as `http.ts:111` and `worker/index.ts:35` already do, and pass
    the plaintext to `redactString(…, [secret])` when logging around a probe so exact-match redaction applies
    (`redact.ts:38`).
  - Audit: pass only the projection fields to `audit()`; `redact()` masks `client_secret`/`secret`/`token` keys anyway
    (`redact.ts:34`) but that is defence, not design.
  - Telemetry: `cleanProps` only stores allow-listed scalar keys (`telemetry.ts:21,34-42`); add no new keys for this
    feature beyond `provider`, `status`, `code`.
  - Errors: probe failures map to fixed codes (`OAUTH_APP_REJECTED`, `PROVIDER_UNREACHABLE`) exactly like
    `identify()` (`connections.ts:57-69`); never forward provider response bodies.
  - **COULD:** Next.js `experimental.taint` + `experimental_taintUniqueValue(secret)` right after decrypt so an accidental
    pass to a Client Component throws at render.
- **MUST: CSRF/Origin.** All routes go through `route()` (`http.ts:89-97`), which enforces `Sec-Fetch-Site`/`Origin` for
  cookie-bearing mutations (`70-86`). Additionally require `Content-Type: application/json` on writes (a `<form>` cannot
  send it cross-site without CORS preflight), and set `SameSite=Lax` stays as configured by better-auth.
- **MUST: rate limits.** `checkRate("platform-probe:" + adminUserId, 5, 60)` on "Test"; `checkRate("platform-write:" +
  adminUserId, 20, 60)` on writes; `checkRate("stepup:" + userId, 5, 300)` on step-up attempts (a wrong TOTP/password is
  an oracle otherwise). Same limiter as runs (`rate-limit.ts:14-27`, global across instances).

## 4. Validation and "Test"

- **MUST: fixed endpoints only.** `OAuthConfig.authorizeUrl/tokenUrl/revokeUrl` stay code constants in
  `src/integrations/providers/*.ts` (`types.ts:128-138`; e.g. `google_sheets.ts:21-23`). The UI accepts **client id and
  client secret only** for both platform and workspace apps. No custom authorize/token/issuer URL fields; GitHub
  Enterprise Server or Slack GovSlack are shown as a disabled control with `disabledReason` (project honesty rule). The
  test-stack override at `connections.ts:249-253` stays gated on `FLOWLINE_ENV=test`.
- **MUST: probe that cannot leak.** A token-endpoint call with a *bogus grant* through `safeFetch` to the fixed
  `tokenUrl`, classifying only the error code:
  - Google `oauth2.googleapis.com/token`, `grant_type=refresh_token&refresh_token=invalid` → `invalid_client` = bad
    id/secret; `invalid_grant` = credentials OK.
  - GitHub `github.com/login/oauth/access_token`, bogus `code` → `incorrect_client_credentials` vs `bad_verification_code`.
  - Slack `slack.com/api/oauth.v2.access`, bogus `code` → `invalid_client_id` / `bad_client_secret` vs `invalid_code`.
  Result stored as `verified_via = "probe"`; the first successful real Connect upgrades it to `"connect"`. Never store or
  show the provider's message body. Same timeout (15 s) and `maxBytes` small (16 KiB) as `email/index.ts:61`.
  For the sign-in app (`platform_secret.purpose = "oauth_signin:google"`), the probe is identical (same Google token
  endpoint); for email keys, Resend/Postmark have authenticated no-op endpoints (`GET /domains`, `GET /server`) — use
  those, never send a message; for Paddle sandbox, `GET /event-types` with the key. Each probe is one fixed URL constant.
- **MUST: show the exact redirect URIs to register**, computed server-side from the same functions the flows use:
  integrations `redirectUri()` (`connections.ts:255-257`, = `FLOWLINE_PUBLIC_URL + /api/oauth/callback`); sign-in
  `${BETTER_AUTH_URL}/api/auth/callback/google` and `/github` (better-auth's default paths). Display with a copy button and
  a warning if `FLOWLINE_PUBLIC_URL` is unset or `http:`. The per-workspace app uses the **same** callback URL (the
  `state` row identifies the app, §6.4).
- **SHOULD: shape checks** before any network call: Google client id ends with `.apps.googleusercontent.com`; GitHub client
  id matches `^(Iv1\.|Ov23li)[A-Za-z0-9]+$|^[a-f0-9]{20}$`; Slack `^\d+\.\d+$`. Cheap, no leak, better UX.
- **SHOULD:** "verified" is provider-side only. Like `sso.ts:129-135`, a workspace app cannot be **enabled** (used for
  Connect) until `verified_at` is set, and changing `client_id` clears `verified_at` (`sso.ts:126-128`).

## 5. Per-workspace "use my own OAuth app" — threat review

Precedent: `sso_config` is already a per-workspace client id/secret (`schema.ts:911-926`) with the rules above, so the
codebase knows how to do this.

| Threat | Analysis against the code | Mitigation |
|---|---|---|
| Malicious owner phishes members via their own app | Tokens are exchanged by Flowline (`completeOAuth`, `connections.ts:330-379`) and land in **that workspace's** rows; the owner already controls workspace-visible connections. Private connections (`visibility = "private"`, `connections.ts:188`) still cannot be *read* by the owner (no API returns secrets) but *were authorized to an app the owner administers*, so the owner can see who consented in the provider console and can revoke. | UI shows members a persistent note on the consent step: "This workspace uses its own OAuth app **<client id>** instead of Flowline's — you'll see that app's name on the provider's consent screen." (MUST). Members' private connections under a workspace app get a badge (SHOULD). |
| Consent-screen spoofing (app named "Flowline") | Provider-side branding is outside our control; Google marks unverified apps. | Store and show the client id, not a free-text name; the note above; the audit event carries the client id (MUST). |
| Token-endpoint secret sent to attacker host | Only possible if URLs were configurable. They are not (§4). `safeFetch` also refuses to carry the body across an origin-changing redirect (`egress.ts:183-186`). | Keep endpoints constant (MUST). |
| Mixing tokens across apps | A refresh token is bound to the client that issued it; refreshing with a different `client_id` yields `invalid_grant`/`unauthorized_client`, which `refreshLocked` would turn into `expired` + paused flows (`connections.ts:226-228`). | `connection.oauth_app_id` + `oauth_app_client_id` snapshot; `tokenRequest` resolves the app **from the connection row**, never from "the workspace's current app" (MUST). |
| App switched or rotated | Existing connections issued under the old app keep working *for refresh* only while that app's secret is valid at the provider; a secret rotation with grace keeps them alive; **deleting/replacing the app** strands them. | On app delete or client-id change: `markConnectionUnhealthy(db, id, "expired", "The workspace OAuth app changed — reconnect")` for every connection with that `oauth_app_id` (`connections.ts:169-174` already pauses only the flows using them), show the affected-connections count before confirming (MUST). Switching back to the platform app is the same operation. |
| Cross-workspace use | `oauth_state` binds `workspaceId` (`schema.ts:344-359`); `completeOAuth` reads the app from the state row. | Add `oauth_app_id` to `oauth_state`; `startOAuth` refuses an app whose `workspace_id ≠ opts.workspaceId` (MUST). |
| Who may configure | `sso.manage` is owner-only (`permissions.ts:32`). | New capability `"integration.oauth_app": ["owner"]` in `permissions.ts` and enforced via `requireWorkspace(user, ws, "integration.oauth_app")` (MUST). No step-up required for workspace owners (they don't have TOTP), but require re-entering the password/TOTP if the workspace has it — COULD. |
| Audit | `AuditAction` union (`audit.ts:15-42`) | Add `oauth_app.configured`, `oauth_app.verified`, `oauth_app.secret_rotated`, `oauth_app.removed`, `oauth_app.probe_failed`, with `{ provider, clientId, secretUpdated, affectedConnections }` (MUST). |

## 6. Rotation, revocation, cache invalidation

### 6.1 Read-through, no long-lived caches (MUST)

- New `src/server/platform-secrets.ts`: `getPlatformSecret(purpose)` does one indexed `select` and decrypts per use — the
  ai-hub rule "no in-memory client or key cache" (`FL-wt-aihub/src/ai/hub/credentials.ts:9-11`). Token exchanges and
  refreshes are rare; one row read is negligible.
- New `src/server/oauth-apps.ts`: `resolveOAuthApp(db, { workspaceId, providerId, connection? })` → `{ id | null,
  clientId, secret: { current, previous?, previousValidUntil? }, source: "platform" | "workspace" }`. Precedence: a
  connection's own `oauth_app_id` (if set, and it must still exist and be enabled) → the workspace's enabled app →
  the platform app → `OAUTH_NOT_CONFIGURED`.
- `connections.ts`: replace `oauthConfigured()` (`245-247`) with `await resolveOAuthApp(...) !== null`; `startOAuth`
  (`295`) uses `app.clientId` and stores `oauth_app_id`/`client_id` on the `oauth_state` row; `tokenRequest(provider,
  params, app)` (`310-328`) takes the resolved app; `completeOAuth` (`339-344`) resolves the app **from the state row**
  and writes `oauth_app_id`/`oauth_app_client_id` on the new connection (`362-377`); `refreshLocked` (`227`) resolves from
  the connection row. Also fix the error message at `262` — it leaks the env var name; say "not configured by the platform
  admin" instead.
- `src/lib/auth.ts`: `socialProviders` are computed at import (`16-18`). Two options: **SHOULD** turn `auth` into a
  memoised factory `getAuth()` keyed on `platform_secret.cred_version` for the two sign-in purposes (rebuild the
  better-auth instance when the version changes; cheap, adapter is stateless) and update callers (`access.ts:30`,
  `sso.ts:498,539`, the auth route handler); or **fallback** keep a restart for sign-in apps only, documented in the panel
  as "takes effect after the next deploy" (honesty rule). I recommend the factory; the version check is one row read per
  request and can be cached for 30 s safely because sign-in is not a token exchange.
- `src/billing/service.ts:26,33-49`: cache keyed by `(purpose row id, cred_version)`; re-read the row's `cred_version`
  (cheap) before returning the cached adapter; `checkout-page.ts:33-35` reads `platform_setting` instead of env.
- `src/server/email/index.ts:22-44`: `config()`/`getEmailProvider()` become `async` and read `email:*` from
  `platform_secret`; `sendEmail` (`73-76`) is already async.

### 6.2 Dual-secret rotation with no downtime (MUST)

- Rotate = write the new secret as `current`, move the old one to `prev_*` with `prev_valid_until = now + 7 days` (Google
  and GitHub allow two client secrets to coexist; Slack regenerates and the old one stops working immediately, so the
  panel shows per-provider guidance from a constant table). `cred_version += 1`.
- `tokenRequest` tries `current`; on **exactly** `invalid_client` / `incorrect_client_credentials` / `bad_client_secret`
  (a new `TokenError.kind === "client_auth"` classified from the provider error string at `connections.ts:326`) it
  retries once with `previous` if within the window. Any other error is passed through unchanged.
- **MUST fix the cascade**: `refreshLocked` (`connections.ts:226-228`) must *not* call `deny()` on a `client_auth`
  failure. It should re-resolve the app once (the secret may have rotated between the read and the request), retry, and
  if still `client_auth`, throw `ConnectionError("CONNECTION_PROVIDER", "Flowline's <provider> app credentials are
  rejected — a platform admin must fix them")` **without** marking the connection expired or pausing its flows, and emit
  a platform audit/alert (`platform_secret.rejected_by_provider`). The refresh token itself is intact; the run should fail
  this step, not the connection.
- Expire the previous secret automatically when `prev_valid_until` passes (a nullable-column check, no job needed).

### 6.3 Revocation (MUST)

- Revoke = `secret_enc = NULL, revoked_at, revoked_by`, `prev_*` cleared, `cred_version += 1`. Reads then return
  `OAUTH_NOT_CONFIGURED` / `EMAIL_NOT_CONFIGURED` / `BILLING_NOT_CONFIGURED` (`service.ts:62,68` already have that path).
- The panel also shows the provider console link "Revoke the secret at the provider too" — Flowline cannot revoke a
  client secret remotely; say so (honesty rule).
- Revoking a **workspace app** runs the affected-connections routine from §5.

### 6.4 Cross-process invalidation and in-flight requests

- Web and worker are separate containers (`docker-compose.beta.yml:60-67`). With read-through there is nothing to
  invalidate for OAuth/email; the only caches are the billing adapter and the optional `getAuth()` factory, both version
  keyed. **COULD:** additionally `pg_notify('flowline_config', purpose)` after each write; the worker already holds a
  LISTEN client (`worker/index.ts:115-119`), so subscribing to a second channel is a one-liner and lets the worker drop
  its billing-adapter cache instantly.
- **In-flight requests:** an OAuth flow started before the rotation carries `client_id` and `oauth_app_id` in
  `oauth_state`; `completeOAuth` exchanges with the app row's *current* secret (and `previous` on `client_auth`), so a
  rotation mid-consent does not break the callback. A refresh in `refreshLocked` holds the row lock (`213`) for the
  request duration; the retry logic above covers the race. Restart is never required.
- Bumping `cred_version` on `platform_secret` also lets the UI show "rotated N times".

## 7. Env compatibility — recommendation: UI only, one explicit import, no runtime fallback (MUST)

- **No tenant or platform path reads a UI-managed secret from `process.env` at runtime.** This mirrors the owner's
  ai-hub rule (`FL-wt-aihub/docs/ai/IMPLEMENTATION_PLAN.md:95-98`: "No tenant path reads a model-provider env var",
  "Legacy env keys are not imported"). A silent env fallback would mean "the UI says revoked, but the app still works with
  the env value" — a fake state, which the project's honesty rule forbids.
- **Migration:** the panel's first screen offers **"Import from environment"** per purpose when the corresponding env var
  is set and the row is empty. Under step-up, it copies the value once, records `platform_audit_event
  platform_secret.imported_from_env { purpose, envVar }`, and then shows a persistent warning listing the env vars that
  should now be removed from `.env.beta` (`docker-compose.beta.yml:10`). Never auto-import on boot; never re-import.
- **Never** import in `FLOWLINE_ENV=test` from real env; the E2E stack sets its own values through the UI (as the ai-hub
  acceptance requires, `IMPLEMENTATION_PLAN.md:112`) or through a `/api/test/*` seed that is already blocked by Caddy.
- Startup check (SHOULD): if any legacy var from the table in §9 is still set in `FLOWLINE_ENV=beta|production`, log one
  warning line naming the var (not its value) so the operator cleans up.

## 8. Audit and alerting

- **MUST: separate `platform_audit_event`** table: `id bigserial, actor_user_id, actor_label, action, target_type,
  target_id, data jsonb (redacted via redact()), request_id (from correlationId(), telemetry.ts:30), ip_hash, at`.
  Reason: `audit_event.workspace_id` is NOT NULL (`schema.ts:602-604`) and the retention job prunes it after
  `AUDIT_DAYS=365` (`retention.ts:14,35`). Platform security events must **not** be pruned by `pruneOnce`; keep them for
  ≥ 2 years (a `FLOWLINE_RETENTION_PLATFORM_AUDIT_DAYS` with a floor of 730) — and never delete `admin.*` events.
- Actions: `admin.granted`, `admin.revoked`, `admin.totp_enrolled`, `admin.stepup` (success/failure with method),
  `platform_secret.set`, `platform_secret.rotated`, `platform_secret.revoked`, `platform_secret.imported_from_env`,
  `platform_secret.probe` (result code only), `platform_secret.rejected_by_provider` (from §6.2), `oauth_app.*` for
  workspace apps go to the **workspace** audit (the owner must see them there).
- Data recorded: purpose, provider, public id, hint, `credVersion` before/after, `secretUpdated: true/false`. Never the
  value; the writer must build the object by hand (no `...input`).
- **MUST: notify the other admins** by email on every `platform_secret.*` and `admin.*` event, after the transaction
  commits, through `sendEmail` (`email/index.ts:73`). Caveats to handle: (a) if the *email* secret is what changed, send
  with the new configuration; (b) `recipientAllowed` (`email/index.ts:74`, `sandbox.ts:1`) may block admin addresses on
  the beta stack — the sandbox list must include the admins, and the panel shows a disabled reason if not; (c) failure to
  notify is logged, never blocks the change.
- **SHOULD:** also post to `FLOWLINE_ALERT_WEBHOOK_URL` (the ops monitor already uses it, `scripts/ops/monitor.mjs:10`) via
  `safeFetch` with the same fixed payload shape.
- Panel view: a read-only list of the last 200 platform events, filterable by purpose.

## 9. Every env var the code reads today — UI input or env?

Source: `grep process.env` over `src/`, `worker/`, `scripts/` (plus `.env.example`). "UI-secret" = `platform_secret`,
"UI-setting" = `platform_setting`, "env" = stays operator environment.

| Var | Read at | Class | Decision | Note |
|---|---|---|---|---|
| `DATABASE_URL` | `src/db/index.ts:8`, `migrate.ts:6`, `worker/index.ts:115`, `scripts/db-peek.mjs:4` | bootstrap | **env** | needed before DB |
| `BETTER_AUTH_SECRET` | `src/lib/auth.ts:22` | bootstrap | **env** | signs sessions |
| `FLOWLINE_ENCRYPTION_KEY`, `_KEYS_OLD` | `crypto.ts:21,25` | bootstrap | **env** | KEK; add `FLOWLINE_PLATFORM_ENCRYPTION_KEY(_OLD)` |
| `BETTER_AUTH_URL`, `FLOWLINE_PUBLIC_URL` | `auth.ts:23`, `http.ts:77`, `connections.ts:256`, `sso.ts:189`, `publish.ts:74`, `members.ts:15`, `email/flows.ts:15`, oauth/sso routes | bootstrap/security | **env** | origin allow-list for CSRF and redirect URIs must not be DB-editable |
| `FLOWLINE_ENV`, `NODE_ENV` | many (`beta.ts:24`, `faults.ts:13`, `http.ts`, …) | bootstrap | **env** | gates test-only code |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | `auth.ts:12-18` | sign-in OAuth app | **UI-secret** `oauth_signin:google|github` | §6.1 factory |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `SLACK_OAUTH_*`, `GITHUB_OAUTH_*` | via `clientIdEnv` in providers, read at `connections.ts:246,295,312` | integration OAuth apps | **UI-secret** `oauth_app:<provider>` | remove `clientIdEnv/clientSecretEnv` from `OAuthConfig` (`types.ts:136-137`) |
| `FLOWLINE_EMAIL_PROVIDER`, `FLOWLINE_EMAIL_FROM` | `email/index.ts:23,30` | email config | **UI-setting** | non-secret; edited on the same panel page |
| `FLOWLINE_EMAIL_RESEND_KEY`, `FLOWLINE_EMAIL_POSTMARK_TOKEN` | `email/index.ts:43` | email key | **UI-secret** `email:resend|postmark` | |
| `FLOWLINE_EMAIL_ALLOWED_RECIPIENTS` | `email/sandbox.ts:1` | safety | **env** (SHOULD) | it is a guard against sending to real people from beta; keep out of the UI so an admin click can't widen it; COULD UI later with step-up |
| `FLOWLINE_EMAIL_*_TEST_URL`, `FLOWLINE_EMAIL_TEST_TIMEOUT_MS` | `email/index.ts:49,60` | test | **env** | test stack only |
| `FLOWLINE_BILLING_PROVIDER`, `_PADDLE_ENV`, `_PLANS`, `_FREE_PLAN` | `service.ts:35,41`, `plans.ts:33-34` | billing config | **UI-setting** (SHOULD) | plans JSON is large; could stay env for beta |
| `FLOWLINE_BILLING_PADDLE_KEY`, `_PADDLE_WEBHOOK_SECRET`, `_STRIPE_KEY`, `_WEBHOOK_SECRET` | `service.ts:37-43` | billing secrets | **UI-secret** `billing:*` | adapter refuses live keys (`.env.example:64-66`) — keep that check in the service, not the UI |
| `FLOWLINE_BILLING_ALLOW_LIVE` | `service.ts:43`, `checkout-page.ts:39` | safety | **env** | live payments need owner approval (project rule); a UI toggle would make that a click |
| `FLOWLINE_BILLING_PADDLE_CLIENT_TOKEN` | `checkout-page.ts:35` | public token | **UI-setting** | public by design (`.env.example:71-74`) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `FLOWLINE_AI_PROVIDER`, `FLOWLINE_AI_MODEL` | `src/ai/provider.ts:90-190`, `chat.ts:52-135` (phase-4); superseded on `ai-hub` | AI | **removed** — BYOK via Settings → AI Providers (owner decision 1; `IMPLEMENTATION_PLAN.md:95`) | `OPENAI_API_KEY` is in `.env.example` but never read |
| `FLOWLINE_AI_TEST_OVERRIDE`, `FLOWLINE_PROVIDER_OVERRIDE` | `integrations/http.ts:10`, `connections.ts:251`, billing adapters | test | **env** | test stack only |
| `FLOWLINE_EGRESS_ALLOWLIST` | `egress.ts:63` | security | **env** | widening SSRF exceptions must not be a UI action |
| `FLOWLINE_BETA_MODE`, `FLOWLINE_BETA_ADMINS` | `beta.ts:28,51` | sign-up policy | **env** now; COULD UI-setting for mode later | never authorization (§1.2) |
| `FLOWLINE_SUPPORT_EMAIL`, `FLOWLINE_FEEDBACK_URL` | `beta.ts:38-39` | product | **UI-setting** (COULD) | validated shapes already (`beta.ts:42-43`) |
| `FLOWLINE_TELEMETRY` | `telemetry.ts:46` | ops | **env** | |
| `FLOWLINE_OPS_TOKEN`, `_OPS_DATA_DIR`, `_OPS_BACKUP_DIR`, `FLOWLINE_RELEASE_SHA` | `ops/status/route.ts:13,17`, `ops.ts:84`, `health/route.ts:22` | ops | **env** | internal network only (Caddy 404) |
| `FLOWLINE_CODE_IMAGE`, `FLOWLINE_CODE_SANDBOX` | `code-sandbox.ts:12,19` | runtime | **env** | host-level |
| `FLOWLINE_WORKER_CONCURRENCY`, `FLOWLINE_RUN_SEGMENT_TIMEOUT_MS` | `worker/index.ts:24`, `runner.ts:16` | runtime | **env** | |
| `FLOWLINE_RETENTION_*` | `retention.ts:19` | ops | **env** | |
| `FLOWLINE_LIVE_*` | `.env.example:80-104`, `scripts/live-dryrun.mjs` | test credentials | **env** (CI only) | never in the product DB |
| `OPS_BASE`, `OPS_INTERVAL_MS`, `FLOWLINE_ALERT_WEBHOOK_URL` | `scripts/ops/monitor.mjs:8-11` | ops | **env** | monitor container |
| `NEXT_DIST_DIR`, `NODE_TLS_REJECT_UNAUTHORIZED`, `PATH`, `SystemRoot` | `scripts/dev-test.mjs:7`, `verify-beta-stack.mjs:20`, `code-sandbox.ts:61` | tooling | **env** | |
| `BETA_DOMAIN`, `BETA_DB_PASSWORD`, `BACKUP_RETENTION_DAYS`, `FLOWLINE_IMAGE` | compose file only | deploy | **env** | |

## 10. Tests to prove it

All under the existing gates (`pnpm test`, `test:contract`, `test:integration`, `test:e2e`), test DB only, canary value
`FLCANARY_<random>` that never appears in fixtures elsewhere.

**Unit (`crypto.ts`)**
1. `encryptSecretV2` → `decryptSecretV2` round-trips with identical AAD; fails with `AAD_MISMATCH` when any of table / id /
   owner / provider / purpose differs (five separate cases).
2. Ciphertext from row A placed into row B (same table, different id) fails; row A in another workspace fails; a
   `platform_secret` blob placed in `workspace_oauth_app` fails.
3. v1 blob refused for a v2-migrated row; v1 still decrypts for un-migrated rows.
4. Key rotation: `FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD` decrypts, re-wrap writes the new `key_id`; unknown `key_id` throws.

**Integration (API)**
5. Non-admin (workspace owner of two workspaces) → `GET/PUT /api/platform/*` = **404**, panel page = 404; API-key bearer
   auth → 404; admin without step-up → 403 `STEP_UP_REQUIRED` on writes, 200 on reads; step-up expires at 10 min.
6. Wrong TOTP/password 6 times → 429 from `checkRate`.
7. Canary leak scan after set + rotate + probe + revoke: assert canary absent from every API response body and header,
   from the rendered admin HTML (fetch the page as the admin), from `audit_event`/`platform_audit_event.data`,
   `product_event.props`, `email_outbox` bodies, and from captured stdout of web + worker (the test runner already
   captures logs). The 400 for a too-short secret must not echo it.
8. Cross-workspace isolation: workspace A's `workspace_oauth_app` is invisible to B (404); A's `oauth_state` cannot be
   completed by B's member (`connections.ts:334` path) and cannot reference B's app id.
9. Replace vs clear: omitted `secret` keeps `cred_version`; `""` is 400; `DELETE` sets `revoked_at` and the next
   `startOAuth` returns `OAUTH_NOT_CONFIGURED`.
10. Rotation without restart (web + worker as separate processes, as `test:integration` already runs them): connection
    with `accessExpiresAt` in 30 s → rotate platform secret (fake provider accepts old for a window, then only new) →
    run executes, refresh succeeds with `previous`, then with `current`; connection stays `active`; **no flow paused**.
11. Provider rejects both secrets (`invalid_client`) → step fails with `CONNECTION_PROVIDER`; connection **not** marked
    expired; `platform_secret.rejected_by_provider` audited; admin email notification queued.
12. Revoked secret stops working: after `DELETE`, a queued refresh fails closed and `startOAuth` refuses; no env fallback
    even when `GOOGLE_OAUTH_CLIENT_SECRET` is set in the test process env.
13. Import-from-env: works once, audited, second call = 409; refused when the row is non-empty.
14. Workspace app switch: 3 connections under app X, owner deletes X → all 3 `expired` with the reconnect reason and only
    their flows paused (`pauseFlowsUsingConnection` semantics), other flows untouched; audit has
    `affectedConnections: 3`.
15. Probe classification against the fake provider (`FLOWLINE_PROVIDER_OVERRIDE`): `invalid_client` → `OAUTH_APP_REJECTED`,
    `invalid_grant` → verified; 5 probes/min then 429; probe body never contains the secret in the fake provider's
    request log except in the `client_secret` form field (assert it is sent **only** to the fixed token URL).
16. Platform audit rows survive `pruneOnce` with `FLOWLINE_RETENTION_AUDIT_DAYS=1`.

**E2E (Chromium + Firefox, WebKit via the docker script)**
17. Admin enters canary in the panel → after save, `localStorage`, `sessionStorage`, IndexedDB, the URL, `document.body
    .innerHTML` and all network responses (Playwright `page.on("response")`) do not contain it; the input is cleared; the
    field has `type=password`, `autocomplete=new-password`, `data-1p-ignore`.
18. Screenshot evidence under `artifacts/phase-N/` is greppable: add a CI step that greps the artifacts dir (including
    Playwright traces/HARs) for the canary and fails on a hit.
19. Non-admin visiting `/admin` sees the app's 404 page, not a redirect that reveals the route.
20. Member of a workspace with its own Google app sees the "you'll see <client id>'s app name" note before Connect.

## 11. Threat model (asset → threat → mitigation)

| Asset | Threat | Mitigation (section) |
|---|---|---|
| Platform OAuth client secrets | Read by a workspace owner via any API | write-only projections; 404 for non-admins; session-only auth (§1, §3) |
| | Swapped between rows in a DB dump or via SQL injection | AAD binding (§2.1) |
| | Exfiltrated by a copied admin cookie | TOTP + step-up bound to session hash + 24 h session age for the panel (§1.3) |
| | Logged / audited / telemetered | fixed error codes, `redactString` with exact match, allow-listed telemetry, hand-built audit data (§3) |
| | Leaked through the browser | `new-password`, vendor ignore attrs, uncontrolled ref, no drafts, `no-store` (§3) |
| | Sent to an attacker-controlled endpoint | endpoints are code constants; `safeFetch` refuses cross-origin body redirects (§4, §5) |
| | Rotation causes outage / pauses flows | dual secret + `client_auth` classification + no `deny()` on client-auth (§6.2) |
| | Revoked in UI but still used from env | no runtime env fallback (§7) |
| Sign-in OAuth app | Stale credentials after rotation | `getAuth()` factory keyed on `cred_version` (§6.1) |
| Workspace OAuth app | Owner phishing members / consent spoof | fixed redirect to Flowline, client id shown to members, owner-only capability, audit (§5) |
| | Token mix-up across apps | `connection.oauth_app_id` snapshot; resolve from the row (§5, §6.1) |
| Admin identity | Escalation from workspace owner | separate table, never derived from roles or SSO/invite paths (§1.4) |
| | Bootstrap abuse | CLI grant with DB-name guard; no reuse of `FLOWLINE_BETA_ADMINS` (§1.2) |
| Master keys | Compromise of one ring exposes all | separate platform ring; envelope for cheap rotation (§2.1) |
| Audit trail | Pruned or missing | dedicated table, ≥ 730-day retention, admin notifications (§8) |
| Email/billing keys | Same as OAuth secrets; plus live-mode enablement by click | `FLOWLINE_BILLING_ALLOW_LIVE` and recipient sandbox stay env (§9) |

## 12. Specific code changes (checklist)

MUST unless noted.

- `src/server/crypto.ts`: `Aad`, `aadString`, `encryptSecretV2`, `decryptSecretV2` (+ envelope SHOULD, platform ring
  SHOULD); keep v1 read path.
- `src/db/schema.ts` + migration: `platform_admin`, `platform_stepup`, `platform_secret`, `platform_setting`,
  `platform_audit_event`, `workspace_oauth_app`; `connection.oauth_app_id`, `connection.oauth_app_client_id`;
  `oauth_state.oauth_app_id`, `oauth_state.client_id`.
- `src/server/platform-access.ts` (new): `requirePlatformAdmin`, `requireStepUp`.
- `src/server/platform-secrets.ts` (new): get/set/rotate/revoke/probe/importFromEnv, projections, audit + notify.
- `src/server/oauth-apps.ts` (new): `resolveOAuthApp`, workspace app CRUD, affected-connections routine.
- `src/server/connections.ts`: `oauthConfigured` (245), `startOAuth` (262, 283-296), `tokenRequest` (310-328),
  `refreshLocked` (226-228 — no deny on client-auth), `completeOAuth` (338-377), `deleteConnection` (386-389 unchanged).
- `src/integrations/types.ts:136-137`: drop `clientIdEnv`/`clientSecretEnv`; providers `google_sheets.ts:27-28`,
  `gmail.ts:29-30`, `slack.ts:42-43`, `github.ts:164-165` lose those lines.
- `src/lib/auth.ts:11-18`: `oauthConfig`/`socialProviders` from `platform_secret` via `getAuth()` (SHOULD) and add the
  `twoFactor()` plugin at line 85.
- `src/server/email/index.ts:22-44`: async config from `platform_secret`/`platform_setting`.
- `src/billing/service.ts:26-49`, `src/billing/checkout-page.ts:33-35`: version-keyed adapter; settings from DB.
- `src/lib/permissions.ts`: `"integration.oauth_app": ["owner"]`.
- `src/server/audit.ts:15-42`: `oauth_app.*` actions; `src/server/retention.ts:35`: leave `platform_audit_event` alone.
- `src/server/beta.ts:50-54`: comment that this list is sign-up only, never authorization.
- `src/app/api/platform/**` (new, all via `route()`), `src/app/admin/**` (new pages, 404 for non-admins).
- `scripts/admin/grant.mjs` (new) + `pnpm admin:grant`.
- `.env.example`: remove the UI-managed vars, add the platform key ring, document the import step.
- `deploy/beta/Caddyfile`: COULD IP-restrict `/admin*` and `/api/platform*`.

## 13. Open points for the owner

- Whether sign-in OAuth apps must rotate without restart (factory, SHOULD) or a documented restart is acceptable.
- Whether the email recipient sandbox and billing plan JSON move to the UI now (I recommend not yet).
- TOTP as a hard requirement for the panel from day one (recommended) versus password step-up only during beta.
