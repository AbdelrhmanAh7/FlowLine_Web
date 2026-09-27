# Flowline

Visual workflow automation: build flows on a canvas, run them on a real backend worker, and inspect every step.
This is **Phase 1** (interface and foundation). See `SCOPE_MATRIX.md` for what's in and out of scope.

## Requirements

- Node.js ≥ 22 (developed on 25.6) and pnpm 10 (`corepack enable`)
- Docker (for PostgreSQL 17)

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env            # then set BETTER_AUTH_SECRET (see comment in the file)
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

`.env.test` must point at the separate test database and enable test-only features:

```
DATABASE_URL=postgres://flowline:flowline_local_only@localhost:5433/flowline_test
BETTER_AUTH_URL=http://localhost:3100
FLOWLINE_ENV=test
BETTER_AUTH_SECRET=<a different random value>
```

| Check | Command |
|---|---|
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Unit (engine) | `pnpm test` |
| Integration (real Postgres, `flowline_test`) | `pnpm test:integration` |
| E2E (Playwright, starts the test stack on :3100) | `pnpm test:e2e` (first time: `npx playwright install chromium`) |
| All but E2E | `pnpm check` |
| Stop a leftover test stack (frees :3100) | `pnpm stop:test` |

## Layout

```
src/app          Next.js routes (UI + /api)
src/components   UI: shell, builder (canvas, drawer, run dock), primitives
src/engine       Node definitions, validation, JSONata sandbox, executor (shared by web + worker)
src/server       Data access with workspace permission checks
src/db           Drizzle schema, migrations runner
worker/          Separate execution worker process
drizzle/         SQL migrations
e2e/             Playwright acceptance specs
tests/           Vitest unit + integration
design-reference Slide renders + extracted text/tokens
docs/implementation  Phase plan + progress
artifacts/phase-1    Test evidence, screenshots, review reports
```
