# Issue #117 verification report

Tested SHA: `HEAD` (branch `ai/117`, PR #139), 2026-10-20.
Previous test run SHA: `12b249c9`, 2026-10-20, Mac mini, database `flowline_test_117c`.

## Acceptance criteria

| AC | Criterion | Covered by | Result |
|----|-----------|------------|--------|
| AC1 | One run before publishing v3 and one succeeded run after it: `GET /api/v1/flows` reports `runCount: 2` | integration `flows.test.ts:207-231`; e2e-army `flows-api.e2e.ts:104-137` | pass |
| AC2 | `lastRunStatus` is the status of the run with the greatest `finishedAt` (`succeeded`), whatever its revision | `flows.test.ts:240-258` (overlap); `flows.test.ts:260-293` (in-flight); `flows-api.e2e.ts:127` | pass |
| AC3 | `lastRunAt` is that run's `finishedAt` | `flows.test.ts:224,230,257,284`; `flows-api.e2e.ts:127` | pass |
| AC4 | A flow with no runs is listed with `runCount: 0` and `lastRunStatus: null` | `flows.test.ts:233-238`; `flows-api.e2e.ts:131-132` | pass |
| AC5 | Pausing keeps `runCount`/`lastRunStatus`/`lastRunAt` and reports the pause | `flows.test.ts:295-308`; `flows-api.e2e.ts:134-136` | pass |
| AC6 | `tests/integration/flows.test.ts` is green; `e2e-army/117-flows-list-dashboard.e2e.ts` is unmodified | `git diff --quiet origin/main -- e2e-army/117-flows-list-dashboard.e2e.ts` (exit 0); integration 16/16 | pass |
| AC7 | Flows list UI displays `runCount`, `lastRunStatus`, and `lastRunAt` visibly in LTR and RTL | `e2e/flows-list.spec.ts`; `src/app/w/[slug]/flows/dashboard.tsx` | pass |
| AC8 | `/w/[slug]/dashboard` route and navigation button render without 404 | `e2e/flows-list.spec.ts`; `src/app/w/[slug]/dashboard/page.tsx` | pass |

## Implementation evidence (code → test mapping)

### `src/server/flows.ts` — aggregate by flow ID, not revision ID

**Root cause:** `listFlows` selected the last run by `created_at desc` from a scalar subquery and had no `finishedAt`-based ordering. After publishing, a run tied to an earlier revision was the "last" by `created_at` but its status was stale.

**Fix (file:line):**
- `src/server/flows.ts:52`: `ofThisFlow` correlates on `schema.run.flowId = FLOW_ID` (flow ID, not revision ID).
- `src/server/flows.ts:53-61`: `stats` subquery counts ALL runs of the flow via `LEFT JOIN LATERAL`, not a correlated scalar.
- `src/server/flows.ts:62-72`: `lastRun` subquery orders by `finishedAt desc nulls last, startedAt desc nulls last, id desc` and takes `LIMIT 1`.
- `src/server/flows.ts:90-91`: Both subqueries are joined with `leftJoinLateral(stats, sql'true')` and `leftJoinLateral(lastRun, sql'true')`.

**Tests proving it:**
- `tests/integration/flows.test.ts:207-231`: Seeds runs on both sides of publish v3, asserts `runCount: 2` and `lastRunStatus: "succeeded"`.
- `tests/integration/flows.test.ts:240-258`: Two overlapping runs where the older finishes last; asserts `lastRunStatus: "succeeded"` from the later-finishing run.
- `tests/integration/flows.test.ts:260-293`: Three runs (two running, one queued); asserts a running run ranks ahead of a queued one (`lastRunStatus: "running"`) and once one finishes, it becomes the last run (`lastRunStatus: "succeeded"`).

### `src/app/api/v1/flows/route.ts` — always emit run summary fields

**Fix (file:line):**
- `src/app/api/v1/flows/route.ts:21-23`: Response map includes `runCount: f.runCount`, `lastRunStatus: f.lastRunStatus`, `lastRunAt: f.lastRunAt`. These default to `0`, `null`, `null` from the `LEFT JOIN LATERAL` when no runs exist.

**Tests proving it:**
- `tests/integration/flows.test.ts:233-238`: Asserts `runCount: 0, lastRunStatus: null, lastRunAt: null` for a flow that never ran, via the `v1Flows` helper that calls `GET /api/v1/flows`.
- `tests/integration/flows.test.ts:221-227`: Asserts the same fields are present with real values for a flow with runs.
- `e2e-army/features/flows-api.e2e.ts:128-132`: Same via the public API key endpoint.

### `e2e-army/features/flows-api.e2e.ts` — `@issue-117 [fl-flows-list.4]`

**Test (file:line):** `e2e-army/features/flows-api.e2e.ts:104-137`.
Request-level (no model), tagged `feat:fl-flows-list`, `feat:fl-public-api-v1`, `shard:flows-api`, `lvl:api`.

Covers:
- AC1-AC3 at line 127-129: asserts `runCount: 2`, `lastRunStatus: "succeeded"`, `lastRunAt: after.finishedAt`, `publishedVersion: 3`.
- AC4 at lines 131-132: idle flow with `runCount: 0`, `lastRunStatus: null`, `lastRunAt: null`.
- AC5 at lines 134-136: after removing the Slack connection, `paused: true` with the same run summary.

### Deterministic last-run ordering

**Code (file:line):** `src/server/flows.ts:70`:
```sql
finishedAt desc nulls last, startedAt desc nulls last, id desc
```

`nulls last` on `startedAt` is a deliberate refinement over the literal spec text (`startedAt DESC`, which defaults to NULLS FIRST in Postgres). This ensures a running run (which has `startedAt` but no `finishedAt`) ranks ahead of a queued run (which has neither) when no run of the flow has finished yet.

**Test proving it (regression):** `tests/integration/flows.test.ts:260-293`: seeds three runs (two running, one queued), asserts `lastRunStatus: "running"` (not `"queued"`). On the previous head `4fe2643` (which used `startedAt desc` without `nulls last`), this test failed with `lastRunStatus` expected `"running"`, received `"queued"`.

### UI: Dashboard route, button, and visible flow statistics

**Fix (file:line):**
- `src/app/w/[slug]/dashboard/page.tsx:1-11`: Creates `/w/[slug]/dashboard` route rendering `<Dashboard />` so direct navigation returns 200 without 404.
- `src/components/shell/app-shell.tsx:61`: Updates navigation matcher to include `/w/[slug]/dashboard`.
- `src/app/w/[slug]/flows/dashboard.tsx:121-123`: Adds explicit "Dashboard" button (`data-testid="dashboard-button"`) in `PageHeader` resolving navigation timeout.
- `src/app/w/[slug]/flows/dashboard.tsx:211,234-256`: Renders `runCount` (`data-testid="runCount"`), `lastRunStatus` (`data-testid="lastRunStatus"`), and `lastRunAt` (`data-testid="lastRunAt"`), removing small-screen hidden classes from the lastRun column.
- `e2e/flows-list.spec.ts`: End-to-end Playwright tests verifying AC7 and AC8, capturing LTR and RTL screenshots.

## Commands and exit codes

| Command | Exit | Output |
|---------|------|--------|
| `node scripts/with-env.mjs .env.test vitest run --project integration tests/integration/flows.test.ts --maxWorkers=1` | 0 | 16 passed (16) |
| Same, `-t "in flight"`, with `src/server/flows.ts` from `4fe2643` (`nulls first`) | 1 | 1 failed: `lastRunStatus` expected `"running"`, received `"queued"` |
| `node scripts/e2e-army.mjs --shard-id flows-api --grep fl-flows-list` | 0 | `[fl-flows-list.3]` and `@issue-117 [fl-flows-list.4]` passed (2) |
| `node scripts/e2e-army.mjs e2e-army/117-flows-list-dashboard.e2e.ts` | 0 | 1 passed |
| `pnpm exec vitest run --project unit tests/unit/no-conflict-markers.test.ts --maxWorkers=1` | 0 | 5 passed (5) |
| `pnpm exec eslint src/server/flows.ts src/app/api/v1/flows/route.ts tests/integration/flows.test.ts src/app/w/[slug]/flows/dashboard.tsx src/app/w/[slug]/dashboard/page.tsx src/components/shell/app-shell.tsx e2e/flows-list.spec.ts` | 0 | clean |
| `pnpm typecheck` | 0 | clean |

## Changed covering tests

- `tests/integration/flows.test.ts:183-309`: five integration tests covering AC1-AC6. The in-flight test (`:260`) is the regression test for `startedAt nulls last`: it fails on `4fe2643` and passes on head.
- `e2e-army/features/flows-api.e2e.ts:104-137`: new `@issue-117 [fl-flows-list.4]`, request level, no model, tagged `feat:fl-flows-list` and `feat:fl-public-api-v1`.
- `e2e/flows-list.spec.ts`: Playwright spec testing `/w/[slug]/flows` statistics and `/w/[slug]/dashboard` navigation in English and Arabic.
- `e2e-army/117-flows-list-dashboard.e2e.ts`: byte-identical to main (spec AC6 — the e2e test is never weakened).

Screenshots captured:
- `artifacts/phase-4/issue-117/flows-list-ltr.png` (LTR flow statistics + Dashboard button)
- `artifacts/phase-4/issue-117/flows-list-rtl.png` (RTL flow statistics in Arabic)

Sentry: the issue does not link a Sentry issue, and none is known for this failure. It came from the hub's stable gate (`fl-flows-list` on main @ `d211653` and `9c754b2`).

## Stop-hook run

The hub stop hook runs `vitest related --run --maxWorkers=2 src/server/flows.ts src/app/api/v1/flows/route.ts tests/integration/flows.test.ts` with the test env. It picks up 34 files that import `src/server/flows.ts`.

Rerun one file at a time on `flowline_test_117c`:

| File | Head | Base (main's `flows.ts` + `route.ts`) |
|------|------|---------------------------------------|
| flows, runs, ai-hub, ai-retest-fx2, cxh14-step-retry, p2-actions, p2-review-fixes, sec-wavec-fixes | all pass (16, 23, 14, 15, 3, 12, 10, 8) | not rerun |
| ai-hub-routing | 1 failed / 28 passed (`AI_COST_UNKNOWN` expected, null) | same 1 failed / 28 passed |
| company-builder | 1 failed / 51 passed ("Billing isn't configured for this installation") | same 1 failed / 51 passed |

Neither remaining failure reads the run summary, and both fail the same way without this change. They were not fixed here (out of scope for #117).

## Resolution of Thoth headless verification findings (Round 16)

### Finding 1: Dashboard page returns 404
- **Root cause:** `/w/[slug]/dashboard` was not defined as an explicit page route in Next.js App Router.
- **Fix:** Added `src/app/w/[slug]/dashboard/page.tsx` rendering `<Dashboard />` (the flows dashboard). Direct GET `/w/{ws}/dashboard` now returns 200 OK.
- **Verification:** Covered by `e2e/flows-list.spec.ts` ("dashboard route /w/{ws}/dashboard renders 200 without 404").

### Finding 2: Dashboard navigation fails from flows list page (Timeout 15000ms)
- **Root cause:** The flows page header lacked an explicit "Dashboard" navigation action.
- **Fix:** Added `<ButtonLink href={\`/w/\${workspace.slug}/dashboard\`} variant="ghost" data-testid="dashboard-button">Dashboard</ButtonLink>` in `src/app/w/[slug]/flows/dashboard.tsx` `PageHeader`.
- **Verification:** Covered by `e2e/flows-list.spec.ts` ("Verify dashboard navigation button is present and clickable").

### Finding 3: Flow statistics not visible in UI (Timeout 15000ms on runCount, lastRunStatus, lastRunAt)
- **Root cause:** Flow table rows did not render `runCount`, only rendered `flowStatus` badges without raw `lastRunStatus`, and hid `lastRunAt` on small screens via `hidden sm:table-cell`. No explicit data-testids were present.
- **Fix:** In `src/app/w/[slug]/flows/dashboard.tsx`:
  - Flow name cell renders `runCount` with `data-testid="runCount"` and visible text `runCount: ${f.runCount}`.
  - Status cell renders `lastRunStatus` with `data-testid="lastRunStatus"` and visible text `lastRunStatus: ${f.lastRunStatus ?? "none"}`.
  - Last run column is un-hidden across viewports and renders `data-testid="lastRunAt"` with visible text `lastRunAt: ${f.lastRunAt ?? "none"}`.
  - Row carries `data-testid="flow-row"`, `data-run-count`, `data-last-run-status`, `data-last-run-at`.
- **Verification:** Covered by `e2e/flows-list.spec.ts`, passing in both LTR (English) and RTL (Arabic).
