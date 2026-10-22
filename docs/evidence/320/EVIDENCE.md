# Verification Evidence: PR #330 (Issue #320)

**Model:** Gemini 3.8 Flash · **Effort:** High · **Why:** Implement and verify issue #320 fixes, address review findings, verify unit and integration tests, prove regressions on base vs head, and document evidence.

**Workspace:** `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-320`  
**Branch:** `ai/320`  
**Tested commit:** `5710ace3`  
**Originating review finding:** PR #170 review discussion `r4241768670` (finding `f7eba2a4e9dd`)  
**Originating Sentry issue:** None (internal ops metrics CLI review finding split from PR #170; parent issue #143)  
**E2E Waiver:** `E2E: not needed — internal ops CLI script (scripts/pilot-metrics.ts), no user-facing UI or endpoints`  
**Supersedes part of #170. Refs #143.**

## Acceptance Criteria

- **AC1 (P1 — Measure actual duplicate runs instead of rejected event rows):**
  In PR #170, the query checked `webhook_event.status = 'rejected'`. Production webhook handlers at `src/app/api/hooks/[token]/route.ts:88-91` return the existing event on same-event retry (HTTP 200) and signature replays hit unique constraint returning HTTP 409 without persisting a rejected row. Thus, the old query reported 0 regardless of duplicate delivery and missed duplicate runs if deduplication drifted.
  `getDuplicateWebhookRuns` (`scripts/pilot-metrics.ts:195-216`) counts duplicate `run` rows grouped by `(flow_id, trigger_ref)` where `trigger_kind = 'webhook'` and `trigger_ref IS NOT NULL`, summing `(n - 1)` for groups with `COUNT(*) > 1`.
- **AC2 (P2 — Report scheduled runs required by pilot goal):**
  `docs/vision.md:7` requires proving that users can run both webhook-triggered and schedule-triggered workflows. The original report omitted scheduled runs.
  `getScheduledRuns` (`scripts/pilot-metrics.ts:171-180`) queries `run` where `trigger_kind = 'schedule'`, included in `PilotMetrics.scheduledRuns` and formatted in the Markdown report table (`| Scheduled runs | <count> |`).
- **AC3 (P2 — Include required uptime criterion):**
  `docs/vision.md:16` requires staging uptime ≥99% among week-1 pilot success criteria.
  Added `NOT_TRACKED_UPTIME` (`scripts/pilot-metrics.ts:249-250,271`) documenting external `/api/health` probe monitoring (`N/A (measured via external /api/health probe, not stored in DB)`), included in `formatMetricsAsMarkdown` as `| Staging uptime | ... |`.
- **AC4 (Regression Coverage):**
  Dedicated regression tests in `tests/unit/pilot-metrics.test.ts:91-182` prove:
  - AC1 regression: base query reports 0 duplicate runs when actual duplicate runs exist, whereas head query correctly detects duplicate runs (and does not falsely flag rejected non-duplicate events).
  - AC2 regression: base markdown omitted scheduled runs row entirely, whereas head markdown formats `| Scheduled runs | <count> |`.
  - AC3 regression: base markdown omitted staging uptime row entirely, whereas head markdown formats `| Staging uptime | ... |`.
- **AC5 (Code & Verification Cleanliness):**
  Exported `getScheduledRuns` and `getDuplicateWebhookRuns` in `scripts/pilot-metrics.ts` for direct testability.
  18/18 unit tests (`tests/unit/pilot-metrics.test.ts`) pass with exit code 0.
  9/9 integration tests (`tests/integration/pilot-metrics.test.ts`) pass with exit code 0.
  `pnpm typecheck` exits with code 0.
  `pnpm exec eslint` exits with code 0.

## Verification Report

| AC | Requirement | Verification Target / Command | Exit Code | Observed Result |
|---|---|---|---|---|
| AC1 | Measure actual duplicate runs grouped by (flow_id, trigger_ref) | `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts -t "AC1"` | 0 | 4 passed |
| AC2 | Report scheduled runs in PilotMetrics and Markdown | `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts -t "AC2"` | 0 | 4 passed |
| AC3 | Report staging uptime with NOT_TRACKED_UPTIME | `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts -t "AC3"` | 0 | 2 passed |
| AC4 | Prove regressions fail on base logic and pass on head logic | `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts -t "regressions"` | 0 | 3 passed |
| AC1..AC5 | Full unit suite | `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts --maxWorkers=2` | 0 | 18 passed (0 failed) |
| AC1..AC3 | Full integration suite against PostgreSQL | `DATABASE_URL=postgresql://localhost:5432/flowline_test FLOWLINE_ENV=test nice -n 10 pnpm vitest run tests/integration/pilot-metrics.test.ts --maxWorkers=2` | 0 | 9 passed (0 failed) |
| AC5 | TypeScript typecheck | `nice -n 10 pnpm typecheck` | 0 | `tsc --noEmit` clean (0 errors) |
| AC5 | ESLint on changed files | `nice -n 10 pnpm exec eslint scripts/pilot-metrics.ts tests/unit/pilot-metrics.test.ts tests/integration/pilot-metrics.test.ts` | 0 | clean (0 errors) |

## Changed Covering Tests
- `tests/unit/pilot-metrics.test.ts`:
  - `pilot-metrics: formatMetricsAsMarkdown`:
    - `AC2 & AC3: prints every row on an empty range without crashing (all 13 metrics)`
    - `AC2: formats scheduled runs count in markdown`
    - `AC1: formats duplicate webhook runs count in markdown`
  - `pilot-metrics: regressions (demonstrating base failure vs head pass)`:
    - `AC1 (P1): proves regression where base counted rejected webhook_event rows instead of actual duplicate runs`
    - `AC2 (P2): proves regression where scheduled runs were missing from report in base`
    - `AC3 (P2): proves regression where staging uptime criterion was missing in base`
  - `pilot-metrics: collectPilotMetrics and queries`:
    - `AC1 & AC2: propagates scheduled runs and duplicate runs from queryable to PilotMetrics`
    - `AC1: getDuplicateWebhookRuns executes query against Queryable`
    - `AC2: getScheduledRuns executes query against Queryable`
- `tests/integration/pilot-metrics.test.ts`:
  - `AC2: counts accepted webhook runs, scheduled runs and decided workflow approvals in range`
  - `AC1: counts a webhook trigger_ref that produced two runs as one duplicate (and 0 otherwise)`
  - `AC3: prints every metric as 0 or N/A on a range with no data`
  - `AC3: formats metrics as a Markdown table with no connection string`

## Bug Fix Regression Proof
- **AC1 Regression:** In base (PR #170 / commit `22233f18`), `getDuplicateWebhookRuns` queried `webhook_event.status = 'rejected'`. When actual duplicate webhook runs were persisted (same `(flow_id, trigger_ref)` on 2 runs), the base query returned `0` because production handlers return HTTP 200/409 without creating a rejected event row. Furthermore, a non-duplicate event rejected for other reasons (e.g. flow unpublished) with a run ID attached was falsely counted as duplicate. Head logic groups `run` by `(flow_id, trigger_ref)` where `trigger_kind = 'webhook'`, returning `1` for the duplicate run pair and `0` for non-duplicates.
- **AC2 Regression:** In base, `formatMetricsAsMarkdown` omitted scheduled runs from the markdown table. On head, `| Scheduled runs | <count> |` is explicitly present.
- **AC3 Regression:** In base, `formatMetricsAsMarkdown` omitted staging uptime entirely. On head, `| Staging uptime | N/A (measured via external /api/health probe, not stored in DB) |` is explicitly reported.

## Originating Issue & Sentry
- **Originating review finding:** PR #170 discussion `r4241768670` (finding `f7eba2a4e9dd`) on PR #170.
- **Originating Sentry issue:** None (internal ops metrics CLI review finding split from PR #170; parent issue #143).
- **UI:** N/A (read-only internal CLI ops script; no user-facing UI, styling, or frontend endpoints).
- **E2E Gate Note:** `E2E: not needed — internal ops CLI script (scripts/pilot-metrics.ts), no user-facing UI or endpoints`
- **Linkage:** Supersedes part of #170. Refs #143.

## Skills Used
- `systematic-debugging` / `diagnosing-bugs` (identified root cause of rejected event row query vs duplicate run rows)
- `test-first engineering` (demonstrated base failure vs head pass regression tests)
- `verification-before-completion` (verified with commands, exit codes and observed outputs)
- `model-effort-routing` (Gemini 3.8 Flash · High)
