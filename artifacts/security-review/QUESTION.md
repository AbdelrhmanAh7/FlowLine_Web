# Security design question: moving integration and platform credentials from env into secure UI inputs

**Context (Flowline).**
- Next.js 16 + better-auth + Drizzle/PostgreSQL + a worker. Invite-only private beta, Arabic-first.
- Repos, read-only for you:
  - `C:\Users\Abdelrahman\Desktop\Personal_Project\FlowLine` (branch `phase-4`, the current product);
  - `C:\Users\Abdelrahman\Desktop\Personal_Project\FL-wt-aihub` (branch `ai-hub`, the AI provider hub in progress;
    read `docs/ai/IMPLEMENTATION_PLAN.md` §3a).
- Existing pieces to study:
  - `src/server/crypto.ts` (`encryptSecret` / `decryptSecret`, `key_id`);
  - the `connection` table in `src/db/schema.ts` (per-workspace SaaS connections via OAuth consent or API key,
    `secret_enc`, `cred_version`);
  - `src/server/connections.ts` (OAuth authorize/callback, `redirectUri()` = `FLOWLINE_PUBLIC_URL` +
    `/api/oauth/callback`, `state` handling);
  - `src/integrations/providers/*.ts` (`oauth.clientIdEnv` such as `GOOGLE_OAUTH_CLIENT_ID`,
    `SLACK_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_ID`, and matching secrets);
  - `src/lib/auth.ts` (Google/GitHub sign-in reads `GOOGLE_CLIENT_ID` / `GITHUB_CLIENT_ID` from env);
  - `src/server/email/`, `src/billing/` (Paddle keys from env);
  - `src/server/access.ts`, `src/lib/permissions.ts` (roles owner/editor/viewer; non-members get 404);
  - `src/server/egress.ts` (`safeFetch` SSRF guard);
  - `src/server/beta.ts` (`FLOWLINE_BETA_ADMINS` allowlist);
  - `src/server/telemetry.ts`, `src/server/audit.ts`;
  - `deploy/beta/` (Caddy, internal network).

**Owner decisions.**
1. **AI provider keys (BYOK)** are entered only through the workspace UI (Settings → AI Providers). They are already
   being built this way; no `.env`.
2. **New:** "Everything Google, Slack or whatever should be set on inputs and fully secure." The owner chose **BOTH**:
   - **(a) A platform admin panel.** Instance-level, for Flowline platform admins only. Flowline's own OAuth app
     credentials (Google client id/secret for sign-in and for the Sheets/Gmail integration, Slack, GitHub, and the
     other OAuth integrations), the email-provider key and the Paddle sandbox keys are entered once in the UI, stored
     encrypted, rotatable with no restart. Every workspace then just clicks Connect.
   - **(b) An optional per-workspace "use my own OAuth app" override,** for advanced or enterprise customers: a
     workspace owner pastes their own client id/secret for, e.g., Google or Slack.
3. **Bootstrap secrets cannot live in the UI:** `DATABASE_URL`, the master encryption key(s), `BETTER_AUTH_SECRET`,
   and anything needed before the DB is readable. They stay operator env.

**What we need from you (read-only):** a concrete, implementable security design, and a threat review of it. Cover:
1. **Trust boundary and identity of a "platform admin".**
   - How to bootstrap the first admin safely: env allowlist? a one-time setup token? `FLOWLINE_BETA_ADMINS`?
   - Step-up auth or re-authentication for secret changes, session age, and whether MFA should be required before the
     panel unlocks.
   - Preventing a workspace owner from escalating to platform admin.
2. **Storage.**
   - Envelope encryption: data key per secret, wrapped by the master key; `key_id` rotation; AAD binding each
     ciphertext to its record id, scope, provider and purpose, so a ciphertext can't be swapped between rows or
     workspaces.
   - Keeping platform secrets separate from workspace secrets (tables and keys).
   - Is the existing `crypto.ts` sufficient? Read it and say exactly what to change.
3. **Write-only inputs.**
   - The secret is never returned: masked indicator only, e.g. the last 4 characters stored separately, or just
     "set at <date> by <admin>".
   - Replace vs clear semantics, and no browser autofill or password-manager capture on the wrong fields.
   - No secrets in React state that persists to localStorage or offline drafts, URLs, telemetry, error reports, logs
     or audit data.
   - CSRF and Origin checks on the endpoints; a rate limit on "test".
4. **Validation and test.**
   - How to validate an OAuth client id/secret without leaking it (e.g. a token-endpoint probe, or only validating on
     the first real Connect).
   - Show the exact redirect URI to register.
   - SSRF: for per-workspace custom OAuth apps, are custom authorize/token URLs allowed? Recommend fixed provider
     endpoints only.
5. **Per-workspace override risks.**
   - A malicious workspace OAuth app phishing its own members.
   - Consent-screen spoofing.
   - The token-endpoint secret being sent to an attacker-controlled host.
   - Mixing tokens across apps; refresh tokens bound to the app that issued them.
   - What happens to existing connections when the app is switched or rotated.
   - Which roles may configure it (owner only?), and audit events.
6. **Rotation and revocation.**
   - Rotating a platform OAuth secret with no downtime (dual-secret window).
   - Revoking a compromised secret.
   - Cache invalidation across web and worker processes (no restart).
   - What in-flight refresh-token requests do.
7. **Env compatibility.** Is env allowed as the initial seed with the UI value overriding it, or UI only? Recommend
   one approach, with migration: import once? never auto-import?
8. **Audit and alerting:** who changed which secret and when (never the value), notifications to other admins, and
   the log retention of those events.
9. **Everything else that should move to UI inputs versus stay in env,** as a table covering every env var the code
   reads today. Grep `process.env` across `src/`, `worker/` and `scripts/`, and classify each one.
10. **Tests to prove it:** a canary secret never leaks (responses, HTML, browser storage, logs, audit, telemetry,
    screenshots); cross-workspace isolation; a non-admin gets 404; rotation works without a restart; a revoked secret
    stops working; AAD swap attacks fail.

**Output.**
- A markdown report with the recommended design, threat model (asset → threat → mitigation), specific code changes
  (files and functions) and the test list.
- Mark each recommendation MUST / SHOULD / COULD.
- Do NOT edit any files other than your report path.
