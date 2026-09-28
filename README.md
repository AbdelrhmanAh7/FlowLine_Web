# Flowline

Visual workflow automation: build flows on a canvas, run them on a real backend worker, and inspect every step.
Phase 2 (automation platform) is built on the Phase 1 interface: queue + worker, published versions, webhook/schedule triggers,
retries and human review, approvals, 12 app integrations, AI nodes, templates and a usage ledger. See `SCOPE_MATRIX.md`
for what's in and out of scope and `docs/implementation/PHASE-2.md` for how it works.

## Requirements

- Node.js ≥ 22 (developed on 25.6) and pnpm 10 (`corepack enable`)
- Docker (for PostgreSQL 17)

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env            # then set BETTER_AUTH_SECRET and FLOWLINE_ENCRYPTION_KEY (see comments)
cp .env.example .env.test       # test env: see "Tests" below for the 4 values to change
pnpm db:up                      # Postgres on localhost:5433 (creates flowline + flowline_test)
pnpm db:migrate                 # dev DB
pnpm db:migrate:test            # test DB
pnpm dev                        # web on http://localhost:3000 + worker
```

Open http://localhost:3000, click **Start free**, and create an account. Onboarding creates a workspace and your first flow.

The worker (`pnpm worker`, started by `pnpm dev`) executes runs. If it isn't running, the app shows a
"worker offline" banner and new runs wait in the queue.

## Tests

`.env.test` must point at the separate test database, enable test-only features, and route providers to the local
test doubles (fake SaaS APIs on :4010 and a fake Ollama on :4011, started with the test stack):

```
DATABASE_URL=postgres://flowline:flowline_local_only@127.0.0.1:5433/flowline_test
BETTER_AUTH_URL=http://localhost:3100
FLOWLINE_ENV=test
BETTER_AUTH_SECRET=<a different random value>
FLOWLINE_ENCRYPTION_KEY=<base64 of 32 random bytes>
FLOWLINE_EGRESS_ALLOWLIST=127.0.0.1:4010,127.0.0.1:4011
FLOWLINE_PROVIDER_OVERRIDE=http://127.0.0.1:4010
FLOWLINE_AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:4011
FLOWLINE_AI_MODEL=fake-model
FLOWLINE_PUBLIC_URL=http://localhost:3100
GOOGLE_OAUTH_CLIENT_ID=fake-google-client      # test-only values; OAuth goes to the fake
GOOGLE_OAUTH_CLIENT_SECRET=fake-google-secret
SLACK_OAUTH_CLIENT_ID=fake-slack-client
SLACK_OAUTH_CLIENT_SECRET=fake-slack-secret
```

| Check | Command |
|---|---|
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Unit (engine) | `pnpm test` |
| Contract (12 adapters vs the fake provider server) | `pnpm test:contract` |
| Integration (real Postgres, `flowline_test`, real worker code, Docker code sandbox) | `pnpm test:integration` |
| Live / sandbox (real local Ollama + PostgreSQL; SaaS need `FLOWLINE_LIVE_<PROVIDER>` sandbox credentials, else BLOCKED) | `pnpm test:live` |
| E2E (Playwright, starts the test stack on :3100) | `pnpm test:e2e` (first time: `npx playwright install chromium`) |
| All but E2E | `pnpm check` |
| Stop a leftover test stack (frees :3100) | `pnpm stop:test` |

## Layout

```
src/app          Next.js routes (UI + /api)
src/components   UI: shell, builder (canvas, drawer, run dock), primitives
src/engine       Node definitions, validation, JSONata sandbox, executor (shared by web + worker)
src/server       Data access with workspace permission checks; egress, credentials, approvals, usage
src/integrations Provider adapters (12) and their registry
src/ai           AI providers (Ollama / Anthropic), untrusted-content framing and quarantine
src/db           Drizzle schema, migrations runner
worker/          Separate execution worker process
drizzle/         SQL migrations
e2e/             Playwright acceptance specs; e2e/fakes = provider-boundary test doubles
tests/           Vitest unit, contract, integration, live
design-reference Slide renders + extracted text/tokens
docs/implementation  Phase plan + progress
artifacts/phase-1    Test evidence, screenshots, review reports
```
