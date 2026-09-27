# Phase 2 — automation platform: how it is built

Phase 2 turns the Phase 1 editor into a working automation platform. This document is the map; `SCOPE_MATRIX.md` maps every requirement to its evidence, and `artifacts/phase-2/REPORT.md` has the gate result.

## Execution engine

| Piece | Where | What it guarantees |
|---|---|---|
| Queue + claim | `worker/runner.ts` `claimNextRun` | `FOR UPDATE SKIP LOCKED` under a transaction advisory lock; per-workspace concurrency limit enforced at claim time. |
| Leases | `worker/runner.ts` | Every step/run write is guarded by `locked_by = worker AND status = 'running'`; a lost lease raises `LeaseLostError` and writes nothing. Heartbeat + 1 s cancel poll; 15-minute segment timeout. |
| Stale recovery | `recoverStaleRuns` | Runs whose worker stopped heart-beating are requeued; `attempts` counts **lost workers only** (approval resumes don't use it up); 3 losses → `WORKER_LOST`. |
| Checkpoints / resume | `processRun` | Finished steps are kept; a step left `running` is *interrupted*. The real step I/O for resume/rerun is stored AES-GCM encrypted (`run_step.data_enc`); users only ever see the redacted columns. |
| Immutable versions | `drizzle/0002_flow_version_immutable.sql` | A trigger blocks `UPDATE` on `flow_version`. Each run stores its `flow_version_id`, input and permission policy (`actingUserId`, connections). |
| Graph execution | `src/engine/execute.ts` | DAG waves with bounded parallelism, merge/join, conditions skip branches, a pause blocks only its dependants, `$steps.<id>` bindings, bounded loops, versioned subflows (published + pinned version, same workspace, depth/cycle limits). |
| Validation | `src/engine/validate.ts` | Types, connections (cycles, input arity, merge ≥2), `$steps` references must be upstream, cron ≥ 5 min, `REPLACE_WITH_*` setup placeholders, unbounded loops, approval inputs must be deterministic. |
| States | run: queued / running / waiting_approval / succeeded / failed / cancelled; step: + skipped / reused / uncertain (external outcome unknown). |
| Cancellation & limits | `src/server/runs.ts`, `worker/index.ts` | Cancel queued (immediately) or running (mid-request abort; a non-idempotent step in flight becomes *uncertain*). Queue quota, 30 runs/min rate limit, per-workspace concurrency, run timeout. |

## Side effects are never blindly repeated

- Retries: bounded (≤5), exponential backoff with full jitter, `Retry-After` honoured and capped, by error kind (`worker/retry.ts`).
- Non-idempotent action whose response is lost (or whose worker died mid-call): the adapter's `verify()` asks the provider; if it can't tell, the run waits for a human **review** (mark done / retry once / fail). A "retry" decision allows exactly one more attempt. The same applies to non-idempotent HTTP requests and to interrupted subflows/loops with side-effecting children.
- Idempotency keys are derived per run + step and passed to providers that support them.
- Re-run from a step: reuses upstream outputs from the original run, against the run's **original** revision or the **latest** saved flow; the preview lists what re-runs, what is reused, and which steps may repeat an external effect. Authorization (acting user still an editor) and approvals are re-checked when the re-run executes.

## Triggers

- **Manual** — `clientRequestId` dedupes double-clicks.
- **Webhook** (`src/app/api/hooks/[token]/route.ts`) — `x-flowline-signature: t=<unix>,v1=HMAC(secret, "<t>.<event id>.<body>")`, ±5 min; `x-flowline-event-id` dedupe (same id + different body → 409). GitHub scheme: `X-Hub-Signature-256` + `X-GitHub-Delivery`, and an already-accepted signature is refused (replay). The event row and its run are inserted in one transaction (no loss after acceptance); paused flows record events without running them.
- **Schedule** (`worker/scheduler.ts`, `src/engine/schedule-math.ts`) — IANA time zone, DST-correct fire times, missed-run policy skip / run_once / run_all (≤10), unique `(schedule, fire_at)` so concurrent schedulers fire once; paused flows record `skipped_paused` and never catch up.

## Nodes and integrations

- Node registry with versions and schemas (`src/engine/nodes.ts`, `src/integrations/registry.ts`); the catalog count is computed from the adapters that exist.
- Safe HTTP (`src/server/egress.ts`): validation inside the socket DNS lookup (no rebinding), manual redirects re-validated per hop, credentials dropped on cross-origin redirects, private/metadata/loopback/CGNAT/IPv6-mapped ranges blocked, exact `host:port` allowlist (`FLOWLINE_EGRESS_ALLOWLIST`), size and time caps.
- Data nodes: JSON transform, filter, map, merge, CSV parse/build, file (upload / previous step / PDF text via `unpdf` in the sandbox process), key–value store.
- AI nodes (generate / extract / classify) — provider and model come from configuration (`FLOWLINE_AI_PROVIDER`, `FLOWLINE_AI_MODEL`); no model names or prices are hard-coded. Each step records provider, model and token usage; schema-validated JSON (ajv) with one repair attempt. Untrusted content is framed as data, and lines that try to instruct the AI are quarantined before the model sees them (`src/ai/injection.ts`); the step reports how many.
- Code node: only in a Docker sandbox (`--network none --read-only --memory 128m --cpus 0.5 --pids-limit 64 --cap-drop ALL --security-opt no-new-privileges --user 65534`, clean env, hard kill). Without Docker it is shown as unavailable. User code never runs in the server process; expressions and PDF parsing run in a heap-capped child process.
- 12 adapters: Google Sheets, Gmail, Slack, HubSpot, Zendesk, Airtable, Snowflake, GitHub, Stripe, Notion, Postgres, Linear — each declares side effect (none / idempotent / non-idempotent), sensitivity (needs approval), scopes, and `verify()` where the provider allows it. The catalog shows *adapter implemented / contract tested / sandbox-live verified or BLOCKED*.

## Credentials and connections

- Stored separately from flows, AES-256-GCM with key ids for rotation (`FLOWLINE_ENCRYPTION_KEY`), scoped to a workspace; never returned by APIs, never in logs, previews, approvals or errors (`src/server/redact.ts`).
- OAuth: single-use state (10 min, bound to the user) + PKCE S256; refresh under a row lock (one refresh for concurrent users of a rotating token; a denial is committed before the error surfaces); revocation on delete; scopes checked per action.
- An expired/revoked connection pauses **only** the flows that use it (`paused_reason = connection:<id>:<status>`); other flows keep running. Reconnect must be the same external account (and the same provider) and never auto-runs anything.

## Human approvals and usage

- Approvals bind run + version + node + action + canonical args + connection + kind (sha256), expire after 24 h, and the approver must still be an editor when the action executes. Args preview is redacted.
- Usage ledger (`src/server/usage.ts`): one idempotency key per call attempt; reservation under a workspace row lock against the monthly budget (never overshoots under races); settle / release. Prices come only from the workspace price table (`ai:<provider>/<model>`, `action:<id>`, `action:<app>/*`); unpriced usage is counted, not invented.

## Operations UI

Dashboard KPIs and attention items from real data; Runs history with filters, search and pagination; inspector with input/output/log/error tabs, event log, approvals/reviews, re-run dialog with preview; run dock with cancel and degraded states ("Running… 12s · provider slow", "retry 2 (rate limited)"); Integrations (catalog, verification badges, connect/reconnect, broken-connection banner); Templates (six design templates with real requirement status); Settings → Usage & limits.

## Tests

| Suite | Command | Doubles |
|---|---|---|
| Unit | `pnpm test` | none |
| Contract (adapters) | `pnpm test:contract` | fake provider server (provider boundary only) |
| Integration | `pnpm test:integration` | fake providers + fake AI; real Postgres, real worker code, real Docker sandbox |
| E2E (UI) | `pnpm test:e2e` | the same doubles, started by `scripts/dev-test.mjs` on :4010/:4011 |
| Live / sandbox | `pnpm test:live` | none — real local Ollama, real PostgreSQL; SaaS identity checks need `FLOWLINE_LIVE_<PROVIDER>` sandbox credentials and are recorded BLOCKED without them (`artifacts/phase-2/live-results.json`) |

## Helpers used (resource-limited laptop, ≤3 agents, separate worktrees)

| Helper | Task |
|---|---|
| Kimi Code CLI (worktree) | 12 provider adapters, fake provider server, contract tests; design templates delta |
| Codex CLI (worktree `FL-wt-codex`, sandbox `workspace-write`) | Independent agent-driven exploratory UI test and retest |
| Claude Fable 5.1 (read-only subagent) | Critical security/correctness review of the Phase 2 engine — 12 findings, all fixed with regression tests |
| Ollama (`qwen2.5:3b`, one model at a time) | Live AI suite; exposed the prompt-injection weakness fixed by quarantine |
