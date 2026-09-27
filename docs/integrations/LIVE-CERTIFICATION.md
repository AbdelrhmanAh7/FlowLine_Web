# Live Certification Suite (REL-LIVE-SUITE)

The certification suite proves each SaaS adapter end-to-end against a **real sandbox
account** — connect, identity, read, write, verify, cleanup, revocation, errors — and can
prove *itself* against the local provider test double without any credentials (dry-run).

- `tests/live/certification.test.ts` — the vitest entry point (one test per provider).
- `tests/live/certify/framework.ts` — env parsing, check recording, dry-run inputs.
- `tests/live/certify/scenarios.ts` — the per-provider scenario code (shared by both modes).
- `tests/live/record.ts` — result recording (extended with an output-file parameter).

## Running

```bash
pnpm test:live:dryrun   # no credentials, loopback only, verifies the suite itself
pnpm test:live:saas     # real sandbox accounts, env from .env
```

### Dry-run mode

`pnpm test:live:dryrun` sets `FLOWLINE_LIVE_DRYRUN=1`, starts `e2e/fakes/provider-server.ts`
in-process on an ephemeral loopback port, sets `FLOWLINE_ENV=test` +
`FLOWLINE_PROVIDER_OVERRIDE` + the egress allowlist, and runs the same scenario code with
fake tokens (`test-token`, revoked `revoked-token`, Stripe `sk_test_fake` / revoked
`sk_test_revoked`). Results go to `artifacts/phase-3/live-dryrun-results.json` as
`DRYRUN_PASS` / `DRYRUN_FAIL` / `N/A` — never to the real results file, never as `PASS`.

### Real mode

`pnpm test:live:saas` reads `.env` and runs every provider for which credentials exist.
Results go to `artifacts/phase-3/live-results.json` with statuses:

- `PASS` — the check actually ran against the provider and succeeded.
- `FAIL` — it ran and failed (fails the vitest run too).
- `BLOCKED` — it could not run, with the reason:
  - no `FLOWLINE_LIVE_<PROVIDER>` → every check BLOCKED ("missing credentials")
  - no `FLOWLINE_LIVE_<PROVIDER>_TARGET` → write/verify/cleanup (and reads that need a
    target) BLOCKED ("missing test target")
  - no `FLOWLINE_LIVE_<PROVIDER>_REVOKED` → revocation BLOCKED
- `N/A` — the check does not exist for the provider (Snowflake write/verify/cleanup).

Credential, target and revoked-credential **values are never logged or recorded** — only
account labels, created object ids and error kinds/messages.

Every check is recorded as `<provider>.<check>`: `connect`, `identity`, `read`, `write`,
`verify`, `cleanup`, `revocation`, `errors`.

- **connect** — credentials are constructed and accepted by the provider (first
  authenticated call). Token refresh is not exercised: the env inputs carry access
  tokens/API keys only.
- **identity** — `ProviderDef.identity` returns a non-empty accountId/label.
- **read** — a permitted read action (or a direct read via `ctx.http` where the adapter
  exposes none — noted per provider below).
- **write** — a safe write against a dedicated test target; the artifact carries a unique
  `flowline-cert-…` marker.
- **verify** — the action's own `verify` (idempotency marker) where it exists, plus a
  read-back comparing the created object's fields.
- **cleanup** — delete/archive/close the created artifact via the provider API, then
  confirm it is gone. Where a provider has no delete, this would record "manual cleanup
  required"; all providers below support cleanup.
- **revocation** — the separately supplied revoked/invalid credential must produce a
  `ProviderError` of kind `auth`.
- **errors** — a deliberately invalid request must produce a useful `ProviderError` kind
  and message.

## Providers

JSON shapes below are the values of the env vars (never commit real values).

### Google Sheets

- **Account**: a Google account with a dedicated test spreadsheet containing a tab for
  the suite (e.g. `FlowlineCert`).
- **Env**: `FLOWLINE_LIVE_GOOGLE_SHEETS={"token":"<OAuth access token>"}`
  `FLOWLINE_LIVE_GOOGLE_SHEETS_TARGET={"spreadsheetId":"…","tab":"FlowlineCert"}`
  `FLOWLINE_LIVE_GOOGLE_SHEETS_REVOKED={"token":"<revoked or expired token>"}`
- **Scopes**: `https://www.googleapis.com/auth/spreadsheets`.
- **Checks**: read = `read_range` of `Tab!A1:Z100`; write = `append_row` of a marked row;
  verify = append `verify` + read-back of the row; cleanup = `values.clear` on the appended
  row via `ctx.http` (the adapter has no delete) and confirm the marker is gone;
  errors = `read_range` on a nonexistent spreadsheet → `not_found`.

### Gmail

- **Account**: a dedicated test Gmail account.
- **Env**: `FLOWLINE_LIVE_GMAIL={"token":"<OAuth access token>"}`
  `FLOWLINE_LIVE_GMAIL_TARGET={"to":"optional-recipient@…"}` (default: send to self)
  `FLOWLINE_LIVE_GMAIL_REVOKED={"token":"<revoked token>"}`
- **Scopes**: `gmail.readonly`, `gmail.send`. Cleanup permanently deletes the sent message
  (`messages.delete`), which needs the full `https://mail.google.com/` scope — without it
  cleanup fails honestly and the message must be removed by hand (it is addressed to self,
  subject is the marker).
- **Checks**: read = `search_messages` (`in:inbox`); write = `gmail.send` to self with the
  marker as subject; verify = send `verify` (rfc822msgid lookup) + `get_message` subject
  comparison; cleanup = `messages.delete` via `ctx.http`, confirmed by a `not_found`
  re-read; errors = `get_message` on a bogus id → `not_found`.

### Slack

- **Account**: a test workspace with a bot token and a dedicated test channel.
- **Env**: `FLOWLINE_LIVE_SLACK={"token":"xoxb-…"}`
  `FLOWLINE_LIVE_SLACK_TARGET={"channel":"C0…"}` (channel ID)
  `FLOWLINE_LIVE_SLACK_REVOKED={"token":"<revoked token>"}`
- **Scopes**: `chat:write`, `channels:read`, `channels:history`.
- **Checks**: read = `list_channels`; write = `post_message` with marker text; verify =
  post `verify` (idempotency metadata) + history read-back; cleanup = `chat.delete` via
  `ctx.http`; errors = `post_message` to an unknown channel ID → `client`
  (`channel_not_found`). Revoked tokens surface as Slack's HTTP-200 `ok:false`
  (`token_revoked`) which the adapter maps to `auth`.

### HubSpot

- **Account**: a HubSpot sandbox with a private-app token.
- **Env**: `FLOWLINE_LIVE_HUBSPOT={"token":"pat-…"}`
  `FLOWLINE_LIVE_HUBSPOT_REVOKED={"token":"<revoked token>"}` — no target needed.
- **Scopes**: `crm.objects.contacts.read`, `crm.objects.contacts.write`.
- **Checks**: write = `upsert_contact` creating `flowline-cert-…@example.com` (runs first;
  the read action needs an existing contact); read = `get_contact`; verify = field
  comparison (email/firstname/lastname); cleanup = `DELETE /crm/v3/objects/contacts/{id}`
  via `ctx.http` (archives the contact), confirmed by `not_found`; errors = `get_contact`
  for a missing email → `not_found`.

### Zendesk

- **Account**: a Zendesk sandbox (subdomain), an agent email and API token.
- **Env**: `FLOWLINE_LIVE_ZENDESK={"email":"agent@…","token":"…","subdomain":"…"}`
  `FLOWLINE_LIVE_ZENDESK_REVOKED={"email":"agent@…","token":"<revoked>","subdomain":"…"}`
  — no target needed.
- **Checks**: read = `list_tickets`; write = create a ticket (subject = marker, tag
  `flowline-cert`) via `ctx.http` (the adapter exposes no create); verify = `GET
  /api/v2/tickets/{id}.json` field comparison; cleanup = `DELETE` the ticket, confirmed by
  `not_found`; errors = `update_ticket` on ticket 999999999 → `not_found`.

### Airtable

- **Account**: a test base with a table that has a text field (default `Name`).
- **Env**: `FLOWLINE_LIVE_AIRTABLE={"token":"pat…"}`
  `FLOWLINE_LIVE_AIRTABLE_TARGET={"baseId":"app…","table":"…","field":"Name"}`
  `FLOWLINE_LIVE_AIRTABLE_REVOKED={"token":"<revoked token>"}`
- **Scopes**: `data.records:read`, `data.records:write`.
- **Checks**: read = `list_records`; write = `create_record` with the marker in `field`;
  verify = list read-back with field comparison; cleanup = `DELETE
  /v0/{base}/{table}/{recordId}` via `ctx.http`; errors = DELETE of a nonexistent record →
  `not_found`.

### Snowflake

- **Account**: a Snowflake account with a programmatic access token for a read-only user.
- **Env**: `FLOWLINE_LIVE_SNOWFLAKE={"accountUrl":"https://<acct>.snowflakecomputing.com","token":"<PAT>"}`
  `FLOWLINE_LIVE_SNOWFLAKE_REVOKED={"accountUrl":"…","token":"<revoked PAT>"}`
- **Checks**: read = `snowflake.query` (`SELECT CURRENT_USER(), CURRENT_ACCOUNT()`);
  write/verify/cleanup = **N/A** — the adapter is read-only by design; errors = a `DROP
  TABLE` statement is refused by the read-only guard → `client`.

### GitHub

- **Account**: a PAT (or OAuth token) for a test repository with a throwaway issue (and
  optionally a PR).
- **Env**: `FLOWLINE_LIVE_GITHUB={"token":"ghp_…"}`
  `FLOWLINE_LIVE_GITHUB_TARGET={"owner":"…","repo":"…","issue":"1","pr":"1"}` (`pr`
  optional — without it the read check lists the target issue's comments via `ctx.http`)
  `FLOWLINE_LIVE_GITHUB_REVOKED={"token":"<revoked token>"}`
- **Scopes**: `repo`.
- **Checks**: read = `get_pull_request` (or issue comment listing); write =
  `create_issue_comment` on the target issue; verify = comment `verify` (idempotency
  marker) with id comparison; cleanup = `DELETE /repos/…/issues/comments/{id}` via
  `ctx.http`; errors = `get_pull_request` for PR 999999999 → `not_found`.

### Stripe

- **Account**: any Stripe account, **TEST mode only**. The suite refuses to run unless the
  key starts with `sk_test_` (everything is BLOCKED otherwise), and the adapter itself
  rejects non-test keys before any request.
- **Env**: `FLOWLINE_LIVE_STRIPE={"token":"sk_test_…"}`
  `FLOWLINE_LIVE_STRIPE_REVOKED={"token":"sk_test_<revoked>"}` (must also be `sk_test_`
  shaped to reach the API and produce `auth`)
- **Checks**: read = `list_charges`; write = create a customer (`email` = marker address,
  `metadata[flowline_cert]` = marker) via `ctx.http` (the adapter exposes no customer
  action); verify = `GET /v1/customers/{id}` field comparison; cleanup = `DELETE` the
  customer, confirmed by `not_found`; errors = `GET /v1/charges/ch_missing_…` →
  `not_found`.

### Notion

- **Account**: an internal integration token, a dedicated parent page shared with the
  integration (and optionally a database).
- **Env**: `FLOWLINE_LIVE_NOTION={"token":"ntn_…"}`
  `FLOWLINE_LIVE_NOTION_TARGET={"parentPageId":"…","databaseId":"…"}` (`databaseId`
  optional — without it the read check lists the parent page's children via `ctx.http`)
  `FLOWLINE_LIVE_NOTION_REVOKED={"token":"<revoked token>"}`
- **Capabilities**: read content, insert content.
- **Checks**: read = `query_database` (or block children listing); write = `create_page`
  under the parent with the marker as title; verify = `GET /v1/pages/{id}` title
  comparison; cleanup = `PATCH` `archived: true` (Notion deletes by archiving), confirmed
  by re-read; errors = `GET /v1/pages/<zero-uuid>` → `not_found`.

### Linear

- **Account**: a personal API key for a test workspace with a dedicated team.
- **Env**: `FLOWLINE_LIVE_LINEAR={"token":"lin_api_…"}`
  `FLOWLINE_LIVE_LINEAR_TARGET={"teamId":"…"}`
  `FLOWLINE_LIVE_LINEAR_REVOKED={"token":"<revoked key>"}`
- **Scopes**: `read`, `write`.
- **Checks**: read = `list_teams` (also asserts the target team exists); write =
  `create_issue` titled with the marker; verify = create `verify` (description marker
  search) with id comparison; cleanup = `issueDelete` mutation via `ctx.http`, confirmed
  by `verify` returning `happened:false`; errors = `create_issue` in a nonexistent team →
  `client`.

## Notes

- Postgres is already live-verified by `tests/live/postgres.test.ts` and is not part of
  this suite; `tests/live/ai-ollama.test.ts` and the phase-2 identity suite
  (`tests/live/saas.test.ts`) are unchanged and still write `artifacts/phase-2/live-results.json`.
- The fake provider server gained additive endpoints to support the dry-run
  (values `:clear`, Gmail/HubSpot/Zendesk/Airtable/GitHub/Stripe deletes, Stripe customers,
  Notion page read/archive and block children, Linear `issueDelete`, Slack `chat.delete`,
  and a revoked `sk_test_revoked` fixture token). Existing contract tests are unaffected.
