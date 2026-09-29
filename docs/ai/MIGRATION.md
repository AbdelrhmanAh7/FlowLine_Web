# Migrating to the AI provider hub

**Applies to:** the AI provider hub, Wave A (branch `ai-hub`). It covers what changes for existing workspaces and
deployments.

## Summary

| Before | Now |
|---|---|
| AI ran on a server-configured provider (`FLOWLINE_AI_PROVIDER`, `FLOWLINE_AI_MODEL`, `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`) | AI runs **only** on connections that a workspace owner adds in **Settings → AI Providers** |
| Local inference (Ollama) | Not supported: the release is cloud-only |
| Every workspace shared the server's key | Each workspace brings its own key (BYOK); keys are never shared between workspaces |

## Environment variables

- **Ignored for tenants and never imported into workspaces:**
  - `FLOWLINE_AI_PROVIDER`, `FLOWLINE_AI_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY`,
    `OLLAMA_BASE_URL`, `OLLAMA_MODEL`.
  - They have been removed from `.env.example`, `docker-compose.staging.yml` and `deploy/beta/.env.beta.example`.
  - If they are still set, nothing reads them. A test proves that a bogus global key is never sent.
- **Still managed by operators, and never shown in customer settings:** database, auth, `FLOWLINE_ENCRYPTION_KEY`
  (which also encrypts AI keys), OAuth apps, email and billing.
- **Test environment only:**
  - `FLOWLINE_AI_TEST_OVERRIDE` sends provider calls to the local test double.
  - It is honoured only with `FLOWLINE_ENV=test`. Staging and beta never set that.
- **Platform-funded AI:** Flowline paying for AI on a platform key is **not implemented**. If it is ever wanted, it
  needs separate owner approval. It would be an explicit, budgeted option, never an implicit fallback.

## Existing data (preserved, never converted)

| Legacy value | What happens |
|---|---|
| `workspace.ai_provider = 'ollama'` (and `ai_model`) | Kept as-is and listed in the **migration banner**. AI steps without a cloud model fail with `AI_LOCAL_MIGRATION_REQUIRED`. |
| `workspace.ai_provider = 'anthropic'` (the old server key) | Kept as-is. It no longer has any effect; the owner picks a workspace default model. |
| An AI step with a `model` string and no route | Runs only if the workspace default connection lists **exactly** that model. On a legacy Ollama workspace it fails with `AI_LOCAL_MIGRATION_REQUIRED`. Otherwise it fails with `AI_ROUTE_MIGRATION_REQUIRED`. |
| `agent_version.provider = 'ollama'` | Fails with `AI_LOCAL_MIGRATION_REQUIRED` and is listed in the banner. Saving the agent again moves it to the workspace model. |
| `agent_version.provider = 'anthropic'` | Fails with `AI_ROUTE_MIGRATION_REQUIRED`. Saving the agent again moves it to the workspace model. |

- Nothing is converted silently. Every migration step is an explicit choice in the UI.
- The schema change (`drizzle/0012_ai_hub.sql`) is expand-only: four new tables and two new workspace columns. Rolling
  back the image leaves the old columns untouched.

## For people upgrading a deployment

1. Deploy. The migration runs automatically.
2. Remove the AI variables listed above from your environment files. They are ignored anyway.
3. Tell workspace owners to open **Settings → AI Providers** and add a connection (see `CONNECTING.md`).

## Upgrading an existing Phase 4 deployment: required order

This release also moves Flowline's own service credentials into the UI (`docs/security/CREDENTIALS_DESIGN.md`). An
installation configured through env **stops using those env values** until the operator completes these steps. Details
are in the private beta runbook.

1. **Before deploying:** set `FLOWLINE_PLATFORM_ENCRYPTION_KEY`, a key that differs from every workspace key. Take a
   backup.
2. **Deploy:** migrations `0012`–`0019` run. They are expand-only, plus data steps that mark legacy ciphertext and
   invalidate unproven prices and key verifications. They are tested from a Phase 4 database in
   `tests/integration/sec-upgrade.test.ts`.
3. **Bootstrap the first platform admin:**
   - `scripts/admin/bootstrap.mts --email <admin>` prints a one-time code; redeem it at `/admin/setup`.
   - Configure email first if needed, verify the address, enrol TOTP.
4. **Import from environment,** once per credential, in `/admin`: Google/Slack/GitHub OAuth apps, sign-in apps,
   email, Paddle. It is explicit and audited, and runtime never falls back to env afterwards.
5. **Re-encrypt:** run `scripts/admin/rewrap.mts`. Repeat until it reports `remaining=0` and "rotation complete"; it
   exits non-zero while anything still needs an old key. Only then retire old keys. On a large database this is a
   long-running maintenance job.
6. **Existing Google/Slack/GitHub connections** have no recorded issuing app. They reconnect at their next refresh,
   unless you run the backfill with the client ID that is proven to have issued them (the `--backfill-oauth-app`
   option of the rewrap script). Unproven ones are never guessed.
7. **Customers** add their AI keys under Settings → AI Providers. Nothing is imported from the server's old AI env
   variables.

## Historical records

- The Phase 2 live checks against a local Ollama model are kept verbatim in
  `docs/ai/history/ai-ollama.live-test.ts.txt`. Their results remain in `artifacts/phase-2/`.
- That suite can't run any more, because local inference is not executed.
