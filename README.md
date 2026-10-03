# Flowline

Visual workflow automation with AI agents. You build flows on a canvas, run them on a real backend worker, and inspect
every step. Agents can use your published workflows and knowledge, within permissions the backend enforces.
Arabic is the default language (RTL), with English as a secondary language throughout the product.

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
  repair and revocation handling. Per-workspace owners can also override the OAuth app used for a provider
  (Settings → OAuth apps).
- **AI hub:** cloud-only, multi-provider. Each workspace brings its own keys in **Settings → AI Providers** — never
  in `.env`, never a platform-funded fallback. Local inference (Ollama) has been removed from execution; legacy
  Ollama workspace and agent settings are kept, listed in a migration banner, and their AI steps fail with
  `AI_LOCAL_MIGRATION_REQUIRED` until moved to a cloud model (`docs/ai/MIGRATION.md`).
  - 26 registry entries: 15 core + 8 expansion candidate providers, of which 20 are connectable, 3 are judged
    unsuitable (OpenCode Zen, Command Code Provider API, NVIDIA trial catalogue), 3 enterprise clouds (Bedrock, Azure,
    Vertex) are documented only, and 1 retired provider (GitHub Models) is recorded but not registered. Five
    protocols: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Gemini, Cohere v2.
  - Routing policies MANUAL, FALLBACK, FREE_ONLY and LOW_COST, with retries, a circuit breaker, streaming,
    cancellation, and per-attempt usage/budget metering (`docs/ai/ROUTING.md`).
  - **Agents** with tool permissions ALLOW/ASK/DENY enforced in the backend. ASK pauses for a human decision tied to
    the exact call and workflow version.
  - **Knowledge:** text, Markdown, CSV, JSON and PDF, with retrieval and citations.
  - **Copilot:** you describe a flow, and it produces a validated proposal and diff, saved as a draft only after you
    approve. It never runs anything. Quality is **experimental** — see Status.
- **Platform admin (`/admin`):** a separate admin principal (TOTP sign-in, and a fresh authenticator code — step-up, valid 10 minutes — before writes) where
  operators enter Flowline's own service credentials in the UI — OAuth apps (Google/Slack/GitHub), sign-in apps,
  email provider, and Paddle billing — instead of environment variables. See `docs/security/CREDENTIALS_DESIGN.md`.
- **Collaboration:** invites, owner/editor/viewer roles (one permission matrix, enforced server-side), sharing a copy
  without credentials, version history, rollback, and an audit log.
- **Private beta:** invitation-only sign-up (`FLOWLINE_BETA_MODE=invite_only`), required email verification on every
  sign-up path, and Arabic-first RTL UI with English secondary.
- **Operations:**
  - A usage ledger (tokens, cost, executions, agent steps) with budgets and plan caps.
  - Billing through Paddle (Merchant of Record), **sandbox only**; live keys and tokens are refused. Stripe remains
    only as a customer workflow integration.
  - OIDC SSO per workspace.
  - Health reporting (revision and schema version), a release image, a staging/beta stack, and scripts for
    backup/restore and rollback.

## Status (honest)

| Area | State |
|---|---|
| Phases 1–3 | Delivered. Details: [`SCOPE_MATRIX.md`](SCOPE_MATRIX.md) |
| Phase 4 (private beta) | Core implementation done and gated. Verdicts: CODE COMPLETE **PASS** · BETA INFRA VERIFIED **BLOCKED** · PRIVATE BETA READY **NO** · PUBLIC PRODUCTION APPROVED **NO**. Details: [`docs/implementation/PHASE4_BETA_REPORT.md`](docs/implementation/PHASE4_BETA_REPORT.md) |
| AI provider hub | Core implementation **DONE** (contract-tested against protocol-accurate test doubles). **LIVE CLOUD VERIFICATION IS BLOCKED**: no owner API keys have been entered through the UI and no spend budget is approved, so every real-provider call, all 5 protocol adapters, routing over priced routes, and key verification are **NOT RUN**. Details: [`docs/ai/AI_HUB_REPORT.md`](docs/ai/AI_HUB_REPORT.md) |
| Copilot | **EXPERIMENTAL.** Only benchmark to date is the historical local `qwen2.5:7b` run (5/12 vs a target of ≥10/12, predates the AI hub). A hosted-model benchmark (12 frozen cases, EN+AR) is specified but not run, pending an owner-approved budget. |
| Integrations | Implemented and contract-tested against provider test doubles. PostgreSQL is live-verified (Phase 2). The other 11 (Google Sheets, Gmail, Slack, HubSpot, Zendesk, Airtable, Snowflake, GitHub, Stripe, Notion, Linear) are **not** live-verified — blocked on dedicated test accounts and OAuth apps. |
| Billing | Paddle adapter verified against contract tests and a fake Paddle only. No real Paddle sandbox run yet (needs a sandbox account + client-side token). No live payments. |
| Private beta readiness | **NOT READY.** Blocked on owner-supplied externals: a domain + VPS for `beta.<domain>`, a real email provider (Resend/Postmark), a Paddle sandbox account, and SaaS test accounts + OAuth apps for live integration certification. |
| Public production | **NOT APPROVED.** Owner authorisation only. |

Never presented as live-verified: nothing above claims a real provider, OAuth exchange, or payment has actually run.

## Requirements

- Node.js 22 LTS and pnpm 10 (`npm i -g pnpm@10`); CI and the release image use the same supported Node major.
- Docker (PostgreSQL 17, the release image, and the WebKit test runner)
- No provider credentials in `.env`: AI keys are added per workspace (Settings → AI Providers); OAuth apps, email and
  Paddle billing are entered through `/admin` after bootstrap (`scripts/admin/bootstrap.mts`).

## Quick start (development)

```bash
pnpm install --frozen-lockfile
cp .env.example .env            # set BETTER_AUTH_SECRET, FLOWLINE_ENCRYPTION_KEY and FLOWLINE_PLATFORM_ENCRYPTION_KEY (see the file)
pnpm db:up                      # PostgreSQL on 127.0.0.1:5433 (creates flowline + flowline_test)
pnpm db:migrate
pnpm dev                        # web on http://localhost:3000 + worker
```

Open http://localhost:3000 and create an account; onboarding creates a workspace and your first flow. The worker
(`pnpm worker`, started by `pnpm dev`) executes runs. If it isn't running, the app says so and runs wait in the queue.

Use `127.0.0.1` rather than `localhost` in `DATABASE_URL` on Windows + WSL2 + Docker Desktop. The reason is in
`artifacts/phase-3/p3-15/INVESTIGATION.md`.

To exercise the platform admin panel locally: `node scripts/with-env.mjs .env npx tsx scripts/admin/bootstrap.mts --email <you>`,
then verify the email and enrol TOTP at `/admin`.

## Release image and local staging

```bash
docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t flowline:<sha> .
# .env.staging (never committed): STAGING_DB_PASSWORD, BETTER_AUTH_SECRET, FLOWLINE_ENCRYPTION_KEY,
# FLOWLINE_PLATFORM_ENCRYPTION_KEY … (no provider credentials: AI keys per workspace, service credentials in /admin)
FLOWLINE_IMAGE=flowline:<sha> docker compose -f docker-compose.staging.yml --env-file .env.staging up -d
curl http://localhost:3200/api/health      # revision, schemaVersion, db, worker
```

One image runs the web app, the worker and migrations (expand-only). Upgrading an existing Phase 4 deployment has a
required order (platform key, admin bootstrap, import, rewrap): `docs/ai/MIGRATION.md`. Release scripts:

| Script | Checks |
|---|---|
| `node scripts/release/smoke.mjs` | post-deploy smoke checks |
| `node scripts/release/rollback.mjs --from <img> --to <img>` | deploy N+1, roll back to N with no down migrations |
| `node scripts/release/backup-restore.mjs --image <img>` | pg_dump → a clean PostgreSQL → full verification |
| `node scripts/release/db-outage.mjs --image <img>` | DB stall and outage behaviour |
| `node scripts/load/run.mjs` | load targets from `docs/implementation/TEST_PLAN.md` |

## Tests

`.env.test` points at the separate `flowline_test` database, enables test-only features (`FLOWLINE_ENV=test`), and
routes providers to local test doubles (fake SaaS APIs, OAuth and OIDC on `:4010`; an OpenAI-compatible AI provider
double and a fake Paddle, used only when `FLOWLINE_ENV=test` — tests still add the AI key through the app, like a
customer). Start from `.env.example` for the shape of `.env.test`.

| Check | Command |
|---|---|
| Lint / typecheck | `pnpm lint` / `pnpm typecheck` |
| Unit | `pnpm test` |
| Contract (adapters against the provider doubles) | `pnpm test:contract` |
| Integration (real PostgreSQL, real worker code) | `pnpm test:integration` (refuses to run while a test-stack worker is up: `pnpm stop:test`) |
| E2E, Chromium + Firefox, dev server (starts the test stack on :3100) | `pnpm test:e2e` (first time: `npx playwright install chromium firefox`) |
| E2E against a production build instead of `next dev` | `FLOWLINE_TEST_NEXT=start pnpm test:e2e` (runs `next build` once, then `next start`; recommended for release gates — see `scripts/dev-test.mjs`) |
| E2E, WebKit (Linux Playwright container; needs `pnpm dev:test` running) | `bash e2e/tools/webkit-docker.sh` |
| Live (real PostgreSQL; SaaS/AI need real credentials, else BLOCKED) | `pnpm test:live`, `pnpm test:live:saas`, `pnpm test:live:dryrun` |
| Everything except E2E | `pnpm check` |

Gate results and the exact revisions they were run on are recorded in `docs/implementation/PHASE4_BETA_REPORT.md` and
`docs/ai/AI_HUB_REPORT.md` (no immutable image has been built for the AI hub work yet — gates ran against the local
test stack and a manually run production build, not a pushed release image).

## Security notes

- Every server access goes through `src/server/access.ts`: non-members get 404, and missing capabilities get 403.
- Credentials use a v2 encryption envelope (per-secret data key, AES-256-GCM with AAD, separate key rings for
  platform and workspace secrets); API keys are stored hashed and shown once (`docs/security/CREDENTIALS_DESIGN.md`).
- Platform admin access requires a dedicated `platform_admin` principal, TOTP, and a session-bound step-up
  (10 minutes) before writes; it is never derived from workspace roles or SSO.
- Outbound requests go through an SSRF guard (`src/server/egress.ts`), including a per-AI-provider host allowlist.
  AI output is treated as data; tool permissions are enforced by the backend, not by prompts.
- Independent reviews: `artifacts/phase-3/`, `artifacts/phase-4/`, `artifacts/ai-hub/`.

## Layout

```
src/app            Next.js routes (UI + /api, incl. /api/v1 public API, /admin platform panel)
src/components     UI: shell, builder (canvas, drawers, run dock, Copilot, history), primitives
src/engine         Node definitions, validation, JSONata sandbox, executor (shared by web + worker)
src/server         Data access with permission checks; runs, approvals, agents, knowledge, Copilot, SSO, API keys,
                   usage, audit, beta gating, platform admin access
src/billing        Payment adapter (Paddle, sandbox only), plans, webhooks, reconciliation
src/integrations   Provider adapters (12) and their registry
src/ai             AI provider hub: registry, routing, protocols, connections, pricing (src/ai/hub/)
src/db             Drizzle schema and migration runner
worker/            Separate execution worker (runs, agents, indexing, schedules)
drizzle/           SQL migrations (expand-only)
e2e/               Playwright specs; e2e/fakes = provider-boundary test doubles; e2e/tools = WebKit runner
tests/             Vitest unit, contract, integration, live
scripts/           Test stack, release (rollback, backup/restore, DB outage), load, admin bootstrap/rewrap, diagnostics
docs/              Implementation plans, test plan, AI hub report/providers/routing/migration, security design, releases
artifacts/         Evidence per phase (test output, screenshots, reviews, release checks)
design-reference/  Design slide renders and extracted tokens
```

## Key docs

- [`SCOPE_MATRIX.md`](SCOPE_MATRIX.md) — full scope and PASS/BLOCKED status per item
- [`docs/implementation/PHASE4_BETA_REPORT.md`](docs/implementation/PHASE4_BETA_REPORT.md) — private beta verdicts and blockers
- [`docs/ai/AI_HUB_REPORT.md`](docs/ai/AI_HUB_REPORT.md) — AI hub verdicts, evidence and owner actions needed
- [`docs/ai/PROVIDERS.md`](docs/ai/PROVIDERS.md), [`docs/ai/CONNECTING.md`](docs/ai/CONNECTING.md), [`docs/ai/ROUTING.md`](docs/ai/ROUTING.md), [`docs/ai/MIGRATION.md`](docs/ai/MIGRATION.md) — provider coverage, how to connect a key, routing policies, migration off local inference
- [`docs/security/CREDENTIALS_DESIGN.md`](docs/security/CREDENTIALS_DESIGN.md) — platform admin panel and credential domains
- [`NEXT_ACTION.md`](NEXT_ACTION.md) — current resume state and outstanding owner actions
- [`AGENTS.md`](AGENTS.md) — project rules for contributors and agents
