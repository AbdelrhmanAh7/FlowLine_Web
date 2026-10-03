# Flowline — privacy & safety (private beta, DRAFT)

**Status:** an operational draft for the invitation-only private beta. It is **not legal advice** and **not a
certification**. Flowline has **no** SOC 2, ISO 27001, GDPR certification or similar attestation, and this document must
not be read as claiming one. It needs review by a qualified person before any public launch.

## 1. Data inventory

"Content" means data a user or their integrations put into Flowline. It is stored to run their workflows, and is never
used for analytics or model training by Flowline.

| Data | Where (table) | Why | Sensitive? |
|---|---|---|---|
| Account: name, email, email-verified flag, password hash (scrypt via better-auth), OAuth account links | `user`, `account`, `verification` | sign-in | email = personal data; hash never leaves the server |
| Sessions (token, IP, user agent, expiry) | `session` | stay signed in | yes (token) |
| Federated MFA pending state and session assurance (hashed cookie/session token, user id, factor/account hashes, destination, provider/workspace authority fences) | `verification` | prevent session use before local MFA and reject stale pending sign-ins | authentication metadata; pending state expires after 10 minutes, assurance at its recorded session expiry; no raw TOTP code or pending cookie stored; see [MFA behavior](../security/FEDERATED_MFA.md) |
| Settings, onboarding choices, locale | `user_settings` | product behaviour | low |
| Workspaces, members, roles, invitations (email, hashed token) | `workspace`, `workspace_member`, `workspace_invite` | collaboration | email |
| Workflows and versions (graphs, node configuration, expressions) | `flow`, `flow_version` | the product | may contain business data typed into steps |
| Runs, steps, events (inputs/outputs of steps, errors) | `run`, `run_step`, `run_event` | execution history | **content**: whatever the workflow processed (can include personal data) |
| Webhook endpoints (token, **encrypted** signing secret) and deliveries (payload, signature) | `webhook_endpoint`, `webhook_event` | triggers | content + secrets (encrypted) |
| Schedules | `schedule`, `schedule_fire` | triggers | low |
| Connections to apps (**encrypted** credentials, account id/label, status) and OAuth state | `connection`, `oauth_state` | integrations | **secrets**: AES-256-GCM with `FLOWLINE_ENCRYPTION_KEY` |
| Approvals (arguments shown to approver, decision, approver) | `approval` | human review | content |
| Key-value store, uploaded files | `kv_entry`, `file_object` | workflow data | content |
| Knowledge sources and chunks (text + search index) | `knowledge_source`, `knowledge_chunk` | agent retrieval | **content** (documents) |
| Agents, versions, conversations, runs, steps (messages, tool calls) | `agent*` tables | agents | content |
| Copilot proposals (request text, proposed graph) | `copilot_proposal` | Copilot | content |
| Usage ledger (tokens, cost, provider/model) | `usage_event`, `usage_report` | limits, billing | low |
| Billing account (provider customer/subscription ids, plan, status) and provider events | `billing_account`, `billing_event` | subscriptions | low (no card data — the payment provider holds it) |
| Audit log (actor, action, target, non-secret details) | `audit_event` | accountability | email/actor ids |
| API keys (**hash** only, prefix, scopes) | `api_key` | public API | secret stored as hash |
| SSO configuration (**encrypted** client secret) and state | `sso_config`, `sso_state` | SSO | secret encrypted |
| Beta access codes (**hash** only) | `beta_access_code` | beta gate | low |
| Product telemetry (event name, ids, allow-listed scalar properties, correlation id) | `product_event` | beta funnel | **no content** by design (see §3) |
| Worker heartbeat | `worker_heartbeat` | health | none |
| Application logs (stdout, rotated) | container logs | operations | request ids, error codes; secrets and tokens are redacted |

## 2. Retention (beta defaults; to be confirmed)

| Data | Beta retention |
|---|---|
| Account and workspace data | until the account/workspace is deleted |
| Run history (steps, events, approvals), agent runs | 90 days after they finish (`FLOWLINE_RETENTION_RUN_DAYS`); queued/running/waiting runs are never pruned |
| Webhook deliveries | 30 days (`FLOWLINE_RETENTION_WEBHOOK_DAYS`) |
| Audit log | 1 year (`FLOWLINE_RETENTION_AUDIT_DAYS`) |
| Product telemetry | 180 days (`FLOWLINE_RETENTION_TELEMETRY_DAYS`) |
| Sessions, verification tokens, OAuth/SSO states | deleted once expired |
| Database backups | `BACKUP_RETENTION_DAYS` (default 14 days) on the beta host |
| Container logs | 5 × 20 MB per service (rotated) |

Pruning runs hourly in the worker (`src/server/retention.ts`; one worker at a time via an advisory lock). The usage ledger and billing records are deliberately **not** pruned (billing history).

## 3. What telemetry never contains
Only allow-listed scalar properties are stored (`status`, `code`, `provider`, `via`, `templateId`, `trigger`,
`decision`, `valid`, `attempts`, `kind`, `httpStatus`, `goal`, `event`, `mode`). That rules out payloads, prompts,
document text, email addresses, tokens and keys. This is enforced in `src/server/telemetry.ts` and covered by a test.

## 4. Deletion
- **Account deletion:** requested in account settings and confirmed by an emailed single-use link (P4-06). It deletes
  the user, their sessions and OAuth links. Workspaces they solely own are deleted with their content. The last owner
  of a shared workspace must transfer ownership first. Audit entries keep the actor id, not the email.
- **Workspace deletion:** cascades to its flows, runs, connections (credentials destroyed), knowledge, agents and
  billing account records.
- **Backups:** deleted data persists in backups until they rotate out (≤ `BACKUP_RETENTION_DAYS`).

## 5. External providers (subprocessors) used by the beta

| Provider | Purpose | Data sent | Configured? |
|---|---|---|---|
| Hosting provider (VPS) | runs the beta stack | everything (at rest, on the server) | pending owner choice |
| Resend (or Postmark) | transactional email | recipient email, email content (verification, reset, invitations, notices) | pending account |
| Paddle (sandbox in this phase) | subscription billing (Merchant of Record) | customer email, plan, subscription events | pending sandbox account |
| Anthropic (or the configured AI provider) | AI steps, agents, Copilot | the text those features send to the model | pending key |
| Google, Slack, GitHub (and other integrations users connect) | the integrations themselves | whatever the user's workflow sends | per user |
| Google / GitHub sign-in | authentication | OAuth profile (name, email) | pending OAuth apps |
| Sentry (optional) | error monitoring | error type, stack, request id (no bodies) | optional |

## 6. Security contact
Report security issues to **security@<beta-domain>** (to be created by the owner). Until then, the owner's contact
address in the beta invitation. No bounty programme.

## 7. Incident handling checklist (beta)
1. **Contain:** revoke affected keys and tokens, disable affected connections, or stop the stack (`docker compose stop web worker`).
2. **Preserve evidence:** copy logs (`docker compose logs --since …`) and take a DB snapshot (`pg_dump`) before changing anything.
3. **Assess:** what data, which workspaces/users, since when. Correlation ids link API errors to log lines.
4. **Rotate:** `BETTER_AUTH_SECRET` (signs everyone out), `FLOWLINE_ENCRYPTION_KEY` (rotation keeps the old key in
   `FLOWLINE_ENCRYPTION_KEYS_OLD` until re-encryption), provider keys, webhook secrets.
5. **Notify:** affected beta users, promptly and plainly: what happened, what data, what we did, what they should do.
   Check the notification duties that apply to the owner's jurisdiction.
6. **Fix and verify:** deploy the fix through the normal release process (image, smoke, rollback ready).
7. **Write up:** timeline, root cause, actions. Store it with the release evidence (no secrets).

## 8. Backup policy (beta)
- Nightly `pg_dump -Fc` by the `backup` service in `deploy/beta/docker-compose.beta.yml`, kept
  `BACKUP_RETENTION_DAYS` days. `LAST_OK` / `LAST_FAILED` markers are checked by monitoring.
- **Off-host copy:** the owner must configure one (e.g. an object store or a second machine). A backup only on the
  same disk is not a real backup.
- **Encryption key:** `FLOWLINE_ENCRYPTION_KEY` is backed up **separately** from the database (a password manager).
  Without it, restored credentials and webhook secrets are unusable (verified in Phase 3).
- **Restore:** `scripts/release/backup-restore.mjs` proves a restore into a clean PostgreSQL. It's re-run for the beta
  artifact, and a restore drill is repeated monthly during the beta.
