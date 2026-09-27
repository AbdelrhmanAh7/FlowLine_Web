# Flowline — Phase 3 test plan (release)

Written **before** the load test was run (p3§21). Targets are for the environment we actually have: one laptop,
a single web process, a single worker (concurrency 4), PostgreSQL 17 in Docker capped at 512 MB. They are
**not** capacity claims for production, and the results support no statement about enterprise scale or an SLA.

## 1. Gates (every commit)

`pnpm lint && pnpm typecheck && pnpm test && pnpm test:contract && pnpm test:integration`, and `pnpm test:e2e`
for UI changes. Skipped or flaky tests count as failures.

## 2. Browsers and viewports (p3§22)

| Suite | Chromium | Firefox | WebKit |
|---|---|---|---|
| Full cumulative E2E (Phase 1 + 2 + 3) | all specs | — | — |
| Critical journeys (`@critical`: sign-up → first run, builder save/run, approvals, members/viewer, API key, Copilot approve, agent ASK) | yes | yes | yes |

Responsive checks at 1440, 1024, 375 (+ 320 edge) for the monitor-first pages. Keyboard: every critical journey
reachable by keyboard; shortcuts don't fire while typing.

## 3. Performance and load targets (p3§21)

Measured against the **production build** (the release image), not `next dev`. The tool is
`scripts/load/run.mjs` (plain Node `fetch`, no extra dependency); raw numbers go to `artifacts/phase-3/load/`.

| ID | Scenario | Load | Target |
|---|---|---|---|
| L-1 | `GET /api/health` | 20 concurrent, 30 s | p95 < 150 ms, 0 errors |
| L-2 | Authenticated reads (flow list, run list, flow detail), 10 users | 10 concurrent, 60 s | p95 < 400 ms, p99 < 1 s, 0 5xx |
| L-3 | Run submission via `/api/v1` (API keys; 10 keys × 25 runs, 3-step flow) | 250 runs, 10 concurrent | 100 % answered 202 (or 429 once a key passes 30 runs/min); 0 5xx; p95 enqueue < 500 ms |
| L-4 | Queue drain of L-3 on one worker | 250 runs | all terminal ≤ 180 s; 0 stuck; **0 duplicate executions** (one `run_step` set per run, one usage `execution` event per run) |
| L-5 | Rate limit under load | 1 key, 60 submissions in < 10 s | exactly 30 accepted, the rest 429 with a clear message; no 5xx |
| L-6 | Resource use during L-2…L-4 | — | web RSS < 1.2 GB, worker RSS < 600 MB, DB connections < 40 (limit 50) |

A target that is missed is reported as missed, with the numbers. Targets aren't changed after the run.

## 4. Failure testing (p3§23)

One test per item, listed with its evidence in `SCOPE_MATRIX.md` (P3-31): model timeout, provider 429, provider 5xx,
worker crash, DB outage, revoked integration, expired OAuth token, invalid webhook signature, duplicate webhook,
queue saturation, billing provider failure, agent step limit, agent cost limit, invalid Copilot patch, indexing
failure, permissions changed mid-run, approval expired, membership revoked mid-session.

## 5. Release checks (p3§19–20)

- **Backup/restore:** `pg_dump` of the staging DB, restore into a new, empty PostgreSQL container. Row counts and
  spot checks for users, workspaces, memberships, flows, versions, runs, agents, knowledge metadata, billing state and
  encrypted connection refs. Then the restored app signs in, loads a flow and executes it with the original key.
- **Rollback:** deploy release N+1 over N (expand-only migrations), then redeploy N's image against the migrated
  DB. Check health (revision, schema version), sign-in, workflow load and execute. No down migrations.

## 6. Independent QA (p3§15)

Codex reviews code, tests and security, and does agent-driven exploratory browser testing against the running
stack. Findings are fixed and retested. This is not human UAT.
