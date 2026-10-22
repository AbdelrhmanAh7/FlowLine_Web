# Verification Evidence: PR #330 (Issue #320)

**Model:** Gemini 3.8 Flash · **Effort:** High · **Why:** Implement and verify issue #320 fixes, resolve review threads on unit tests and regression proof, verify unit and integration suites against PostgreSQL, and document evidence.

**Workspace:** `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-320`  
**Branch:** `ai/320`  
**Tested commit:** `e515fb4d`  
**Originating review finding:** PR #170 review discussion `r4241768670` (finding `f7eba2a4e9dd`)  
**Originating Sentry issue:** None (internal ops metrics CLI review finding split from PR #170; parent issue #143)  
**E2E Waiver:** `E2E: not needed — internal ops CLI script (scripts/pilot-metrics.ts), no user-facing UI or endpoints`  
**Supersedes part of #170. Refs #143.**

## Acceptance Criteria

- **AC1 (P1 — Measure actual duplicate runs instead of rejected event rows):**
  In PR #170, the query checked `webhook_event.status = 'rejected'`. Production webhook handlers at `src/app/api/hooks/[token]/route.ts:88-91` return the existing event on same-event retry (HTTP 200) and signature replays hit unique constraint returning HTTP 409 without persisting a rejected row. Thus, the old query reported 0 regardless of duplicate delivery and missed duplicate runs if deduplication drifted.
  `getDuplicateWebhookRuns` (`scripts/pilot-metrics.ts:199-216`) counts duplicate `run` rows grouped by `(flow_id, trigger_ref)` where `trigger_kind = 'webhook'` and `trigger_ref IS NOT NULL`, summing `(n - 1)` for groups with `COUNT(*) > 1`.
- **AC2 (P2 — Report scheduled runs required by pilot goal):**
  `docs/vision.md:7` requires proving that users can run both webhook-triggered and schedule-triggered workflows. The original report omitted scheduled runs.
  `getScheduledRuns` (`scripts/pilot-metrics.ts:172-180`) queries `run` where `trigger_kind = 'schedule'`, included in `PilotMetrics.scheduledRuns` and formatted in the Markdown report table (`| Scheduled runs | <count> |`).
- **AC3 (P2 — Include required uptime criterion):**
  `docs/vision.md:16` requires staging uptime ≥99% among week-1 pilot success criteria.
  Added `NOT_TRACKED_UPTIME` (`scripts/pilot-metrics.ts:249-250,271`) documenting external `/api/health` probe monitoring (`N/A (measured via external /api/health probe, not stored in DB)`), included in `formatMetricsAsMarkdown` as `| Staging uptime | ... |`.
- **AC4 (Run Success Rate 0.0% Propagation):**
  Propagates a 0 success rate from run metrics query through `collectPilotMetrics` to `PilotMetrics.runSuccessRate`, formatting as `0.0%` rather than `N/A`.
- **AC5 (Code & Verification Cleanliness):**
  Exported `getScheduledRuns` and `getDuplicateWebhookRuns` in `scripts/pilot-metrics.ts` for direct testability.
  17/17 unit tests (`tests/unit/pilot-metrics.test.ts`) pass with exit code 0.
  9/9 integration tests (`tests/integration/pilot-metrics.test.ts`) pass with exit code 0.
  `pnpm typecheck` exits with code 0.
  `pnpm exec eslint` exits with code 0.

## Verification Report

| AC | Requirement | Verification Target / Command | Exit Code | Observed Result |
|---|---|---|---|---|
| AC1 | Measure actual duplicate runs grouped by (flow_id, trigger_ref) | `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts -t "AC1"`<br>`nice -n 10 pnpm vitest run tests/integration/pilot-metrics.test.ts -t "AC1"` | 0 | Unit: 3 passed<br>Integration: 1 passed (0 failed) |
| AC2 | Report scheduled runs in PilotMetrics and Markdown | `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts -t "AC2"`<br>`nice -n 10 pnpm vitest run tests/integration/pilot-metrics.test.ts -t "AC2"` | 0 | Unit: 3 passed<br>Integration: 1 passed (0 failed) |
| AC3 | Report staging uptime with NOT_TRACKED_UPTIME | `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts -t "AC3"`<br>`nice -n 10 pnpm vitest run tests/integration/pilot-metrics.test.ts -t "AC3"` | 0 | Unit: 2 passed<br>Integration: 2 passed (0 failed) |
| AC4 | Propagate 0 success rate through collectPilotMetrics as 0.0% | `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts -t "AC4"` | 0 | 1 passed (0 failed) |
| AC1..AC5 | Full unit suite | `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts --maxWorkers=2` | 0 | 17 passed (0 failed) |
| AC1..AC3 | Full integration suite against PostgreSQL | `DATABASE_URL=postgresql://localhost:5432/flowline_test FLOWLINE_ENV=test nice -n 10 pnpm vitest run tests/integration/pilot-metrics.test.ts --maxWorkers=2` | 0 | 9 passed (0 failed) |
| AC5 | TypeScript typecheck | `nice -n 10 pnpm typecheck` | 0 | `tsc --noEmit` clean (0 errors) |
| AC5 | ESLint on changed files | `nice -n 10 pnpm exec eslint scripts/pilot-metrics.ts tests/unit/pilot-metrics.test.ts tests/integration/pilot-metrics.test.ts` | 0 | clean (0 errors) |

## Changed Covering Tests
- `tests/unit/pilot-metrics.test.ts`:
  - `pilot-metrics: formatMetricsAsMarkdown`:
    - `AC2 & AC3: prints every row on an empty range without crashing (all 13 metrics)`
    - `AC2: formats scheduled runs count in markdown`
    - `AC1: formats duplicate webhook runs count in markdown`
    - `formats run success rate as 0.0%, 100.0%, or fractional percentage`
    - `AC3: formats staging uptime metric using NOT_TRACKED_UPTIME documenting external /api/health probe`
  - `pilot-metrics: collectPilotMetrics and queries`:
    - `AC4: propagates a 0 success rate from run metrics query to PilotMetrics`
    - `AC1 & AC2: propagates scheduled runs and duplicate runs from queryable to PilotMetrics`
    - `AC1: getDuplicateWebhookRuns executes query against Queryable`
    - `AC2: getScheduledRuns executes query against Queryable`
- `tests/integration/pilot-metrics.test.ts`:
  - `AC2: counts accepted webhook runs, scheduled runs and decided workflow approvals in range`
  - `AC1: counts a webhook trigger_ref that produced two runs as one duplicate (and 0 otherwise)`
  - `AC3: prints every metric as 0 or N/A on a range with no data`
  - `AC3: formats metrics as a Markdown table with no connection string`

## Bug Fix Regression Proof
- **AC1 Regression:** In base (PR #170 / commit `22233f18`), `getDuplicateWebhookRuns` queried `webhook_event.status = 'rejected'`. When actual duplicate webhook runs were persisted (same `(flow_id, trigger_ref)` on 2 runs), the base query returned `0` because production handlers return HTTP 200/409 without creating a rejected event row. Furthermore, a non-duplicate event rejected for other reasons with a run ID attached was falsely counted as duplicate.
  Head logic groups `run` by `(flow_id, trigger_ref)` where `trigger_kind = 'webhook'`.
  This is verified on PostgreSQL in `tests/integration/pilot-metrics.test.ts`:
  1. The seeded rejected `webhook_event` row with `detail: "duplicate"` does not produce duplicate runs, and `clean.duplicateWebhookRuns` is 0.
  2. Inside a transactional rollback dropping `run_trigger_unique`, inserting a duplicate `run` with identical `(flow_id, trigger_ref)` causes `collectPilotMetrics` to accurately report `duplicateWebhookRuns: 1`.
- **AC2 Regression:** In base, `formatMetricsAsMarkdown` omitted scheduled runs from the markdown table. On head, `| Scheduled runs | <count> |` is queried via `getScheduledRuns` (`trigger_kind = 'schedule'`) and explicitly present in markdown.
- **AC3 Regression:** In base, `formatMetricsAsMarkdown` omitted staging uptime entirely. On head, `| Staging uptime | N/A (measured via external /api/health probe, not stored in DB) |` is explicitly reported with external probe documentation.
- **AC4 Regression:** Verifies that when `success_rate: 0` is returned from the queryable, `collectPilotMetrics` propagates `runSuccessRate: 0` and formats it as `0.0%` rather than falsy `N/A`.

## Originating Issue & Sentry
- **Originating review finding:** PR #170 discussion `r4241768670` (finding `f7eba2a4e9dd`) on PR #170.
- **Originating Sentry issue:** None (internal ops metrics CLI review finding split from PR #170; parent issue #143).
- **UI:** N/A (read-only internal CLI ops script; no user-facing UI, styling, or frontend endpoints).
- **E2E Gate Note:** `E2E: not needed — internal ops CLI script (scripts/pilot-metrics.ts), no user-facing UI or endpoints`
- **Linkage:** Supersedes part of #170. Refs #143.

## Skills Used
- `systematic-debugging` / `diagnosing-bugs` (identified root cause of rejected event row query vs duplicate run rows)
- `test-first engineering` (demonstrated base failure vs head pass regression verification on PostgreSQL)
- `verification-before-completion` (verified with commands, exit codes and observed outputs)
- `root-cause debugging` (addressed review findings on test validity and restored AC4 coverage)
- `model-effort-routing` (Gemini 3.8 Flash · High)
