# Flowline

Visual workflow automation with AI agents. You build flows on a canvas, run them on a real backend worker, and inspect
every step. Agents can use your published workflows and knowledge, within permissions the backend enforces.

## What's in it

- **Builder:** canvas editing with keyboard shortcuts, autosave, undo/redo, offline drafts, conflict detection,
  validation, and a JSONata expression sandbox.
- **Execution:** a PostgreSQL-backed queue and a separate worker. It supports retries and backoff, re-running from a
  step without duplicating side effects, cancellation, concurrency and queue limits, and an "outcome unknown" review
  for lost responses.
- **Triggers:** manual, webhook (signed, deduplicated, replay-safe), schedule, and an authenticated API (`/api/v1`,
  scoped API keys).
- **Integrations:** Google Sheets, Gmail, Slack, HubSpot, Zendesk, Airtable, Snowflake, GitHub, Stripe, Notion,
  PostgreSQL and Linear. They come with OAuth or API-key connections, encrypted credentials, private connections, and
  repair and revocation handling.
- **AI:**
  - AI nodes (Ollama or Anthropic).
  - **Agents** with tool permissions ALLOW/ASK/DENY enforced in the backend. ASK pauses for a human decision tied to
    the exact call and workflow version.
  - **Knowledge:** text, Markdown, CSV, JSON and PDF, with retrieval and citations.
  - **Copilot:** you describe a flow, and it produces a validated proposal and diff, saved as a draft only after you
    approve. It never runs anything.
- **Collaboration:** invites, owner/editor/viewer roles (one permission matrix, enforced server-side), sharing a copy
  without credentials, version history, rollback, and an audit log.
- **Operations:**
  - A usage ledger (tokens, cost, executions, agent steps) with budgets and plan caps.
  - Billing through a Stripe-compatible adapter (**test mode only**).
  - OIDC SSO per workspace.
  - Health reporting (revision and schema version), a release image, a staging stack, and scripts for backup/restore
    and rollback.

## Status (honest)

| Area | State |
|---|---|
| Phases 1–3 | Delivered. Details and evidence: [`SCOPE_MATRIX.md`](SCOPE_MATRIX.md), [`docs/implementation/RELEASE_REPORT.md`](docs/implementation/RELEASE_REPORT.md) |
| Release verdicts | CODE COMPLETE **yes** · STAGING VERIFIED **yes, with limits** · PRODUCTION APPROVED **no** |
| The 12 integrations | Implemented and contract-tested against provider test doubles. **Live verification of 11 SaaS providers is BLOCKED** until sandbox credentials are provided (PostgreSQL is live-verified). |
| Billing | Verified against a Stripe-compatible test double only. No real Stripe test-mode run yet, and **no live payments**. |
| SSO | Verified against a test identity provider only. Not offered in production until a real IdP is configured and tested. |
| Copilot | Proposals are always validated. With the local `qwen2.5:7b` model: 12/12 on the tuned request set, 7/12 on held-out requests (invalid proposals are rejected with reasons). |
| Not built | Password reset / email verification (needs an email provider), live presence on the canvas, light mode |

## Requirements

- Node.js ≥ 22 (developed on 25.6) and pnpm 10 (`npm i -g pnpm@10`; Node 25 no longer ships corepack)
- Docker (PostgreSQL 17, the release image, and the WebKit test runner)
- Optional: [Ollama](https://ollama.com) for local AI (for example `ollama pull qwen2.5:7b`)

## Quick start (development)

```bash
pnpm install --frozen-lockfile
cp .env.example .env            # set BETTER_AUTH_SECRET and FLOWLINE_ENCRYPTION_KEY (see the comments in the file)
pnpm db:up                      # PostgreSQL on 127.0.0.1:5433 (creates flowline + flowline_test)
pnpm db:migrate
pnpm dev                        # web on http://localhost:3000 + worker
```

Open http://localhost:3000 and create an account; onboarding creates a workspace and your first flow. The worker
(`pnpm worker`, started by `pnpm dev`) executes runs. If it isn't running, the app says so and runs wait in the queue.

Use `127.0.0.1` rather than `localhost` in `DATABASE_URL` on Windows + WSL2 + Docker Desktop. The reason is in
`artifacts/phase-3/p3-15/INVESTIGATION.md`.

## Release image and local staging

```bash
docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t flowline:<sha> .
# .env.staging (never committed): STAGING_DB_PASSWORD, BETTER_AUTH_SECRET, FLOWLINE_ENCRYPTION_KEY, FLOWLINE_AI_* …
FLOWLINE_IMAGE=flowline:<sha> docker compose -f docker-compose.staging.yml --env-file .env.staging up -d
curl http://localhost:3200/api/health      # revision, schemaVersion, db, worker
```

One image runs the web app, the worker (`tsx worker/index.ts`) and migrations (`tsx src/db/migrate.ts`, expand-only).
The release scripts run against staging:

| Script | Checks |
|---|---|
| `node scripts/release/rollback.mjs --from <img> --to <img>` | deploy N+1, roll back to N with no down migrations |
| `node scripts/release/backup-restore.mjs --image <img>` | pg_dump → a clean PostgreSQL → full verification |
| `node scripts/release/db-outage.mjs --image <img>` | DB stall and outage behaviour |
| `node scripts/load/run.mjs` | load targets L-1…L-6 from `docs/implementation/TEST_PLAN.md` |

## Tests

`.env.test` points at the separate `flowline_test` database, enables test-only features (`FLOWLINE_ENV=test`), and
routes providers to local test doubles (fake SaaS APIs, Stripe, OAuth and OIDC on `:4010`; a fake Ollama on `:4011`).
Start from `.env.example` and set:

```
DATABASE_URL=postgres://flowline:flowline_local_only@127.0.0.1:5433/flowline_test
BETTER_AUTH_URL=http://localhost:3100
FLOWLINE_PUBLIC_URL=http://localhost:3100
FLOWLINE_ENV=test
BETTER_AUTH_SECRET=<a different random value>
FLOWLINE_ENCRYPTION_KEY=<base64 of 32 random bytes>
FLOWLINE_EGRESS_ALLOWLIST=127.0.0.1:4010,127.0.0.1:4011
FLOWLINE_PROVIDER_OVERRIDE=http://127.0.0.1:4010
FLOWLINE_AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:4011
FLOWLINE_AI_MODEL=fake-model
# fake OAuth apps + test-mode billing against the fake Stripe (test values only):
GOOGLE_OAUTH_CLIENT_ID=fake-google-client
GOOGLE_OAUTH_CLIENT_SECRET=fake-google-secret
SLACK_OAUTH_CLIENT_ID=fake-slack-client
SLACK_OAUTH_CLIENT_SECRET=fake-slack-secret
FLOWLINE_BILLING_STRIPE_KEY=sk_test_fake_billing
FLOWLINE_BILLING_WEBHOOK_SECRET=<any test value>
FAKE_STRIPE_WEBHOOK_SECRET=<the same value>
FAKE_STRIPE_WEBHOOK_URL=http://localhost:3100/api/billing/webhook
FLOWLINE_BILLING_PLANS=<JSON array of test plans — see .env.example>
FLOWLINE_BILLING_FREE_PLAN=<id of the free test plan>
```

| Check | Command |
|---|---|
| Lint / typecheck | `pnpm lint` / `pnpm typecheck` |
| Unit | `pnpm test` |
| Contract (adapters against the provider doubles) | `pnpm test:contract` |
| Integration (real PostgreSQL, real worker code) | `pnpm test:integration` (refuses to run while a test-stack worker is up: `pnpm stop:test`) |
| E2E, Chromium + Firefox (starts the test stack on :3100) | `pnpm test:e2e` (first time: `npx playwright install chromium firefox`) |
| E2E, WebKit (Linux Playwright container; needs `pnpm dev:test` running) | `bash e2e/tools/webkit-docker.sh` |
| Live (real local Ollama + PostgreSQL; SaaS need `FLOWLINE_LIVE_*` sandbox credentials, else BLOCKED) | `pnpm test:live`, `pnpm test:live:saas`, `pnpm test:live:dryrun` |
| Everything except E2E | `pnpm check` |

Results on the release revision: unit 105, contract 97, integration 262, E2E Chromium + Firefox 63/63, WebKit 14/14.

## Security notes

- Every server access goes through `src/server/access.ts`: non-members get 404, and missing capabilities get 403.
  A capability × role test (`tests/integration/p3-matrix.test.ts`) pins the matrix.
- Credentials are encrypted at rest and never returned by the API. API keys are stored hashed and shown once. Audit
  entries contain no secrets.
- Outbound requests go through an SSRF guard (`src/server/egress.ts`). Cookie-authenticated writes are
  origin-checked. Uploads and webhook bodies are capped while streaming.
- AI output is treated as data. Tool permissions are enforced by the backend, not by prompts.
- Independent reviews: `artifacts/phase-3/codex-review/`, `artifacts/phase-3/security-review/`,
  `artifacts/phase-3/codex-qa/`.

## Layout

```
src/app            Next.js routes (UI + /api, incl. /api/v1 public API)
src/components     UI: shell, builder (canvas, drawers, run dock, Copilot, history), primitives
src/engine         Node definitions, validation, JSONata sandbox, executor (shared by web + worker)
src/server         Data access with permission checks; runs, approvals, agents, knowledge, Copilot, SSO, API keys, usage, audit
src/billing        Payment adapter (Stripe-compatible, test mode only), plans, webhooks, reconciliation
src/integrations   Provider adapters (12) and their registry
src/ai             AI providers, tool-calling chat, untrusted-content framing
src/db             Drizzle schema and migration runner
worker/            Separate execution worker (runs, agents, indexing, schedules)
drizzle/           SQL migrations (expand-only)
e2e/               Playwright specs; e2e/fakes = provider-boundary test doubles; e2e/tools = WebKit runner
tests/             Vitest unit, contract, integration, live
scripts/           Test stack, release (rollback, backup/restore, DB outage), load, diagnostics
docs/              Implementation plans, test plan, release report, integration certification
artifacts/         Evidence per phase (test output, screenshots, reviews, release checks)
design-reference/  Design slide renders and extracted tokens
```

Project rules for contributors and agents: [`AGENTS.md`](AGENTS.md).
