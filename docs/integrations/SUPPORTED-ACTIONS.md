# Supported provider actions

Status of every provider adapter in `src/integrations/providers/`.

**Verification honesty:** every adapter below is **implemented and contract-tested against the local fake provider server** (`e2e/fakes/provider-server.ts`, see `tests/contract/`). None of them is **live verified** against the real service — **BLOCKED: no sandbox credentials** are configured for any SaaS provider. The only exception is PostgreSQL, which is verified separately by the lead against a local database (it is not served by the fake).

"Verify" means the action can check, after a lost response, whether its effect happened — the engine uses this instead of blindly retrying non-idempotent actions. Actions without verify require human review after a lost response.

## google_sheets — OAuth2 (PKCE), scope `https://www.googleapis.com/auth/spreadsheets`

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `google_sheets.read_range` | none | – | spreadsheets | – | `GET /v4/spreadsheets/{id}/values/{range}` |
| `google_sheets.append_row` | non_idempotent | – | spreadsheets | ✅ reads the range and searches for the idempotency key | `POST /v4/spreadsheets/{id}/values/{range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS` |

Identity: `GET /oauth2/v3/userinfo` on the `https://www.googleapis.com` base. `append_row` writes the run's idempotency key as the last cell of the row (column documented as `flowline_id`).

## gmail — OAuth2 (PKCE), scopes `gmail.readonly`, `gmail.send`

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `gmail.search_messages` | none | – | gmail.readonly | – | `GET /gmail/v1/users/me/messages?q=` |
| `gmail.get_message` | none | – | gmail.readonly | – | `GET /gmail/v1/users/me/messages/{messageId}?format=full` (headers, snippet, attachment metadata walked from `payload.parts`) |
| `gmail.get_attachment` | none | – | gmail.readonly | – | `GET /gmail/v1/users/me/messages/{messageId}/attachments/{attachmentId}` (base64url, 5MB cap) |
| `gmail.send` | non_idempotent | ✅ | gmail.send | ✅ searches `rfc822msgid:{idempotencyKey}@flowline` | `POST /gmail/v1/users/me/messages/send` (base64url RFC822) |

`gmail.send` sets `Message-ID: <{idempotencyKey}@flowline>` on the outgoing message. Identity: `GET /gmail/v1/users/me/profile`.

## slack — OAuth2 bot (no PKCE), scopes `chat:write`, `channels:read`, `channels:history`

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `slack.post_message` | non_idempotent | – | chat:write, channels:history | ✅ `conversations.history?include_all_metadata=true`, searches metadata | `POST /chat.postMessage` (metadata `event_type: flowline_action`, `event_payload.idempotency_key`) |
| `slack.list_channels` | none | – | channels:read | – | `GET /conversations.list` |

Slack returns HTTP 200 with `{ok:false,error}` on failure; the adapter maps `invalid_auth`/`token_revoked`/`token_expired`/`not_authed` → auth, `ratelimited` → rate_limit, anything else → client. Identity: `POST /auth.test`.

## hubspot — private app token (api_key, Bearer)

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `hubspot.upsert_contact` | idempotent | – | crm.objects.contacts.write | – | `POST /crm/v3/objects/contacts/batch/upsert` (`idProperty: "email"`) |
| `hubspot.get_contact` | none | – | crm.objects.contacts.read | – | `GET /crm/v3/objects/contacts/{email}?idProperty=email` |
| `hubspot.create_deal` | non_idempotent | – | crm.objects.deals.write | ❌ (human review) | `POST /crm/v3/objects/deals` |

Identity: `GET /account-info/v3/details`.

## zendesk — basic auth (`{email}/token` + API token), per-subdomain base

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `zendesk.list_tickets` | none | – | tickets:read | – | `GET /api/v2/search.json?query=type:ticket status<solved …` |
| `zendesk.update_ticket` | idempotent | – | tickets:write | – | `PUT /api/v2/tickets/{id}.json` (fields only: priority, tags, group_id — comments are NOT supported) |

Identity: `GET /api/v2/users/me.json`. Base URL: `https://{subdomain}.zendesk.com` (subdomain captured at connect time).

## airtable — personal access token (api_key)

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `airtable.list_records` | none | – | data.records:read | – | `GET /v0/{baseId}/{table}` |
| `airtable.upsert_record` | idempotent | – | data.records:write | – | `PATCH /v0/{baseId}/{table}` with `performUpsert.fieldsToMergeOn` |
| `airtable.create_record` | non_idempotent | – | data.records:write | ❌ (human review) | `POST /v0/{baseId}/{table}` |

Identity: `GET /v0/meta/whoami`.

## snowflake — programmatic access token (api_key) + account URL setting

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `snowflake.query` | none (READ-ONLY enforced) | – | statements:execute | – | `POST /api/v2/statements` |

Read-only guard: after stripping comments/whitespace the statement must start with SELECT, WITH, SHOW, DESCRIBE, DESC or EXPLAIN, and multiple statements (`;` followed by more SQL) are rejected. Results capped at 1000 rows. Every request sends `X-Snowflake-Authorization-Token-Type: PROGRAMMATIC_ACCESS_TOKEN`. Identity: `SELECT CURRENT_USER(), CURRENT_ACCOUNT()` via the statements API.

## github — PAT (api_key) or OAuth2 (PKCE), scope `repo`

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `github.get_pull_request` | none | – | repo | – | `GET /repos/{owner}/{repo}/pulls/{number}` |
| `github.list_pr_files` | none | – | repo | – | `GET /repos/{owner}/{repo}/pulls/{number}/files` |
| `github.create_issue_comment` | non_idempotent | – | repo | ✅ lists comments, searches the hidden marker | `POST /repos/{owner}/{repo}/issues/{number}/comments` |

Every request sends `accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28`. Comments carry a hidden `<!-- flowline:{idempotencyKey} -->` marker. Identity: `GET /user`.

## stripe — secret key (api_key), **test-mode keys only**

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `stripe.list_charges` | none | – | charges:read | – | `GET /v1/charges?limit=` |
| `stripe.create_refund` | idempotent (via `Idempotency-Key` header) | ✅ | refunds:write | – | `POST /v1/refunds` (form-encoded `charge=&amount=`) |

Only keys starting `sk_test_` or `rk_test_` are accepted; live keys are rejected at connect/identity and before every action with a client error. Identity: `GET /v1/account`.

## notion — integration token (api_key)

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `notion.query_database` | none | – | read_content | – | `POST /v1/databases/{id}/query` |
| `notion.create_page` | non_idempotent | – | insert_content | ❌ (human review) | `POST /v1/pages` |

Every request sends `Notion-Version: 2022-06-28`. Identity: `GET /v1/users/me`.

## postgres — connection string (NOT HTTP)

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `postgres.query` | none | – | read | – | SQL inside `BEGIN READ ONLY` + `SET LOCAL statement_timeout = 10000` |
| `postgres.execute` | non_idempotent | ✅ | write | ❌ (human review) | SQL inside a transaction with the same 10s timeout |

Uses the `pg` driver directly. The host/port pass the egress check (`assertHostAllowed`) before connecting; `sslmode` in the URL is honoured. Parameters are always bound as `$1..$n` — never string-interpolated. Results capped at 1000 rows. pg error mapping: `28P01`/`28000` → auth, `57014` (statement timeout) → timeout, `ECONNREFUSED`/`ENOTFOUND`/`ETIMEDOUT`/`ECONNRESET` → network, everything else → client. Identity: `SELECT current_user, current_database(), inet_server_port()`. **Live verification: not run here — the lead verifies it against a local database** (the fake server does not serve postgres).

## linear — API key (api_key, sent raw without `Bearer`), GraphQL

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `linear.list_teams` | none | – | read | – | `POST /graphql` — `{ teams { nodes { id name key } } }` |
| `linear.create_issue` | non_idempotent | – | write | ✅ `issues(filter:{description:{contains:"flowline:{key}"}})` | `POST /graphql` — `mutation issueCreate` |

`create_issue` appends `\n\n<!-- flowline:{idempotencyKey} -->` to the description. Identity: `{ viewer { id name email } }`.

## mizano — scoped API key (api_key, `Authorization: Bearer`), host from the connect setting `baseUrl`

| Action | Side effect | Sensitive | Required scopes | Verify | Real endpoint |
|---|---|---|---|---|---|
| `mizano.list_overdue_invoices` | none | – | invoices:read | – | `GET /api/invoices?status=overdue&asOf=YYYY-MM-DD` |
| `mizano.create_customer` | non_idempotent | – | customers:create | – | `POST /api/customers` |
| `mizano.create_draft_quote` | non_idempotent | – | quotes:create | – | `POST /api/quotes` |

The endpoint and response shape are **assumed** until Mizano's FlowLine integration API (MZ G5) is published; the adapter is covered only by mocked contract tests (`tests/contract/mizano.test.ts`). `baseUrl` must be a bare https origin. `base()` refuses private, loopback, link-local and internal literal hosts before any request is built (`checkUrl`). A hostname is checked again at connect time by the egress guard in `safeFetch` (every resolved address must be public), which covers every request including the per-request `baseUrl`; `tests/contract/mizano.test.ts` proves it for a name that resolves to 10.0.0.5. A test stack on a tailnet host needs `FLOWLINE_EGRESS_ALLOWLIST`. The identity response (`GET /api/me`) must carry a non-empty `id` and `workspaceName`. Amounts pass through as two-decimal strings. The create actions (`mizano.create_customer`, `mizano.create_draft_quote`, #147) reject a malformed Mizano response (missing or non-string `id`, numeric `unitPrice`, lower-case `currency`) with a zod error; `tests/contract/mizano.test.ts` asserts the error path and has a well-formed control case for each (#240).
The endpoint and response shape are **assumed** until Mizano's FlowLine integration API (MZ G5) is published; the adapter is covered only by mocked contract tests (`tests/contract/mizano.test.ts` in-process, and `tests/contract/mizano-http.test.ts` over real HTTP against the fake Mizano API in `e2e/fakes/provider-server.ts`). `baseUrl` must be a bare https origin. `base()` refuses private, loopback, link-local and internal literal hosts before any request is built (`checkUrl`). A hostname is checked again at connect time by the egress guard in `safeFetch` (every resolved address must be public), which covers every request including the per-request `baseUrl`; `tests/contract/mizano.test.ts` proves it for a name that resolves to 10.0.0.5. A test stack on a tailnet host needs `FLOWLINE_EGRESS_ALLOWLIST`. The identity response (`GET /api/me`) must carry a non-empty `id` and `workspaceName`. Amounts pass through as two-decimal strings; the provider sends `Idempotency-Key` from `ctx.idempotencyKey` for the write actions. `mizano.create_draft_quote` needs 1 to 200 lines (an empty quote is rejected before any request), and `mizano.create_customer` leaves `taxId` out of the request body when it is not set. The contract tests assert the header equals `ctx.idempotencyKey` and is identical for a repeated run. Both write actions are declared `non_idempotent` because Mizano honouring `Idempotency-Key` is unverified until MZ G5 ships, so the engine does not retry them blindly after an unknown outcome; the header is sent, but server-side dedup is unverified. Switch them to `idempotent` once the key is confirmed. The e2e-army test covers only the catalog entry (no real Mizano workspace is reachable from the throwaway stack); duplicate prevention is proven against the fake Mizano API over real HTTP (`tests/contract/mizano-http.test.ts`) and in-process against a stateful fake (`tests/contract/mizano.test.ts`), not end to end against the real Mizano API.

The fake provider server (`e2e/fakes/provider-server.ts`, path prefix `/mizano`) answers `GET /api/health` with 200 `{ status: "ok", version: "fake" }` (part of #145, #222) and `GET /api/me` with the workspace identity the adapter parses (part of #147). It serves the two create steps too (part of #147): `POST /api/customers` and `POST /api/quotes` require `Idempotency-Key` (400 without it), insert a record (`201`, `{ id: "cust_fake_N" | "quote_fake_N", ...body }`) and replay that same record with `200` for a key they have already seen for that path, so a repeated run + node key inserts nothing. `GET /__fake/state/mizano` returns `{ customers, quotes }`. It sits behind the server's generic Bearer check, so a missing or unknown token gets 401 `{ message: "Unauthorized" }` for every path. Authenticated requests to any other path or method get 404 `{ message: "Not found" }`. `/api/invoices` is not faked yet. `tests/contract/mizano-fake.test.ts` covers the handler and `tests/contract/mizano-http.test.ts` drives the real adapter through it.
