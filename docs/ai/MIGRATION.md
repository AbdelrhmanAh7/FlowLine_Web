# Migrating to the AI provider hub

**Applies to:** existing workspaces/deployments upgrading from pre-hub data to the cloud AI hub now in the repository.
The original Wave A branch was `ai-hub`; follow the deployed migration journal, not that historical branch name.

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
  - Active assignments have been removed from `.env.example`, `docker-compose.staging.yml` and `deploy/beta/.env.beta.example`;
    comments may still name them as ignored legacy configuration.
  - Tenant execution does not read them. Historical diagnostic scripts/comments are not a supported runtime path.
- **Still managed by operators, and never shown in customer settings:** database, auth, `FLOWLINE_ENCRYPTION_KEY`
  (which also encrypts AI keys), and the separate platform key ring. Service OAuth apps, email and billing are
  operator-managed in `/admin`. Platform ZITADEL also accepts the server-only environment tuple in `.env.example`.
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

1. For an authorized deployment, run the migration service before web/worker startup (the staging/beta Compose
   stacks enforce this order). A bare web container does not run migrations automatically.
2. Remove the AI variables listed above from your environment files. They are ignored anyway.
3. Tell workspace owners to open **Settings → AI Providers** and add a connection (see `CONNECTING.md`).

## Upgrading an existing Phase 4 deployment: required order

This release also moves Flowline's own service credentials into the UI (`docs/security/CREDENTIALS_DESIGN.md`). An
installation configured through env **stops using those env values** until the operator completes these steps. Details
are in the private beta runbook.

1. **Before deploying:** set `FLOWLINE_PLATFORM_ENCRYPTION_KEY`, a key that differs from every workspace key. Take a
   backup.
2. **Deploy:** run all pending migrations in `drizzle/meta/_journal.json` (through `0024` in this checkout), not only
   the hub/security range `0012`–`0019`. That range includes expand-only schema changes and data steps that mark legacy ciphertext and
   invalidate unproven prices and key verifications. They are tested from a Phase 4 database in
   `tests/integration/sec-upgrade.test.ts`.
3. **Bootstrap the first platform admin:**
   - `scripts/with-env.mjs` never overrides a variable that is already set in the shell (even an empty one), so an
     inherited value beats the env file. Run steps 3 and 5 in a fresh shell, or unset the target variables first
     (POSIX: prefix with `env -u DATABASE_URL -u FLOWLINE_ENCRYPTION_KEY -u FLOWLINE_ENCRYPTION_KEYS_OLD -u
     FLOWLINE_PLATFORM_ENCRYPTION_KEY -u FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD`). Bootstrap uses `DATABASE_URL` (and
     `FLOWLINE_ENV` in its test-database guard); rewrap also uses the four key variables.
   - `node scripts/with-env.mjs .env.staging pnpm exec tsx scripts/admin/bootstrap.mts --email <admin>` prints a
     one-time code; redeem it at `/admin/setup`. Substitute the intended deployment's protected env file.
   - Configure email first if needed, verify the address, enrol TOTP.
4. **Import from environment,** once per credential, in `/admin`: Google/Slack/GitHub OAuth apps, sign-in apps,
   email, Paddle. It is explicit and audited, and runtime never falls back to env afterwards.
5. **Re-encrypt:** run `node scripts/with-env.mjs .env.staging pnpm exec tsx scripts/admin/rewrap.mts` with the intended
   deployment's env file, in a clean environment (step 3). Repeat until every table reports `remaining=0`,
   `failed=0` and "Rotation complete"; it exits non-zero while anything still needs an old key. Only then retire old
   keys. On a large database this is a long-running maintenance job.
6. **Existing Google/Slack/GitHub connections** have no recorded issuing app. They reconnect at their next refresh,
   unless you run the backfill with the client ID that is proven to have issued them (the `--backfill-oauth-app`
   option of the rewrap script). Unproven ones are never guessed.
7. **Customers** add their AI keys under Settings → AI Providers. Nothing is imported from the server's old AI env
   variables.

## Historical records

- The Phase 2 live checks against a local Ollama model are kept verbatim in
  `docs/ai/history/ai-ollama.live-test.ts.txt`. Their results remain in `artifacts/phase-2/`.
- That suite can't run any more, because local inference is not executed.
