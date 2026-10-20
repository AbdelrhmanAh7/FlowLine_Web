# Evidence — Issue #320: fix: pilot-metrics.ts — measure actual duplicate runs, scheduled runs, and uptime

Supersedes part of #170. Refs #143.

Workspace: `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-320`  
Branch: `ai/320`  
Tested commit: `749955a4`  
Originating review finding: PR #170 review discussion `r4241768670` (finding `f7eba2a4e9dd`)  
Originating Sentry issue: None (internal ops script review finding split from PR #170)  
E2E Waiver: `E2E: not needed — internal ops CLI script (scripts/pilot-metrics.ts), no user-facing UI or endpoints`

## Acceptance Criteria

1. **AC1 (P1 — Measure actual duplicate runs instead of rejected event rows)**:
   In PR #170 (`scripts/pilot-metrics.ts:22233f18`), the query counted `webhook_event` rows where `status = 'rejected'`. Production webhook handlers at `src/app/api/hooks/[token]/route.ts:88-91` return the existing event on same-event retry (status 200) and signature replays hit the unique constraint returning status 409 without persisting a rejected row. Thus, the old query reported 0 regardless of duplicate delivery and would miss duplicate runs if deduplication drifted.
   `getDuplicateWebhookRuns` now counts duplicate `run` rows grouped by `(flow_id, trigger_ref)` where `trigger_kind = 'webhook'` and `trigger_ref IS NOT NULL`, summing `(n - 1)` for groups with `COUNT(*) > 1`.
2. **AC2 (P2 — Report scheduled runs required by pilot goal)**:
   `docs/vision.md:7` requires proving that users can run both webhook-triggered and schedule-triggered workflows. The original report omitted scheduled runs.
   Added `getScheduledRuns` querying `run` where `trigger_kind = 'schedule'`, included in `PilotMetrics.scheduledRuns` and formatted in the Markdown report table (`| Scheduled runs | <count> |`).
3. **AC3 (P2 — Include required uptime criterion)**:
   `docs/vision.md:16` requires staging uptime ≥99% among week-1 pilot success criteria.
   Added `NOT_TRACKED_UPTIME` documenting external `/api/health` probe monitoring (`N/A (measured via external /api/health probe, not stored in DB)`), included in `formatMetricsAsMarkdown` as `| Staging uptime | ... |`.
4. **AC4 (Regression Coverage)**:
   Dedicated regression tests in `tests/unit/pilot-metrics.test.ts` prove:
   - AC1 regression: base query reports 0 duplicate runs when actual duplicate runs exist, whereas head query correctly detects duplicate runs.
   - AC2 regression: base markdown omitted scheduled runs row entirely, whereas head markdown formats `| Scheduled runs | <count> |`.
   - AC3 regression: base markdown omitted staging uptime row entirely, whereas head markdown formats `| Staging uptime | ... |`.
5. **AC5 (Code & Verification Cleanliness)**:
   Exported `getScheduledRuns` and `getDuplicateWebhookRuns` in `scripts/pilot-metrics.ts` for direct testability.
   18/18 unit tests (`tests/unit/pilot-metrics.test.ts`) pass with exit code 0.
   9/9 integration tests (`tests/integration/pilot-metrics.test.ts`) pass with exit code 0.
   `pnpm typecheck` exits with code 0.
   `pnpm lint` exits with code 0.

---

## Verification Matrix

| Acceptance Criterion | Verification Method | Tests / Commands | Observed Exit Code |
|---|---|---|---|
| **AC1 (P1 - Duplicate Runs)** | Unit test `tests/unit/pilot-metrics.test.ts:74-77` & `213-221` (`getDuplicateWebhookRuns`); Integration test `tests/integration/pilot-metrics.test.ts:534-556` (transactional index drop duplicate run test) | `pnpm vitest run tests/unit/pilot-metrics.test.ts`<br>`env FLOWLINE_ENV=test DATABASE_URL=postgres://abdelrahmanahmed@localhost:5432/flowline_test pnpm vitest run tests/integration/pilot-metrics.test.ts` | 0 |
| **AC2 (P2 - Scheduled Runs)** | Unit test `tests/unit/pilot-metrics.test.ts:69-72` & `223-231` (`getScheduledRuns`); Integration test `tests/integration/pilot-metrics.test.ts:525-532` (counts accepted webhook and scheduled runs) | `pnpm vitest run tests/unit/pilot-metrics.test.ts`<br>`env FLOWLINE_ENV=test DATABASE_URL=postgres://abdelrahmanahmed@localhost:5432/flowline_test pnpm vitest run tests/integration/pilot-metrics.test.ts` | 0 |
| **AC3 (P2 - Staging Uptime)** | Unit test `tests/unit/pilot-metrics.test.ts:56-67` (`formatMetricsAsMarkdown` contains `NOT_TRACKED_UPTIME`); Integration test `tests/integration/pilot-metrics.test.ts:558-577` | `pnpm vitest run tests/unit/pilot-metrics.test.ts`<br>`env FLOWLINE_ENV=test DATABASE_URL=postgres://abdelrahmanahmed@localhost:5432/flowline_test pnpm vitest run tests/integration/pilot-metrics.test.ts` | 0 |
| **AC4 (Regression Tests)** | Unit regression test suite in `tests/unit/pilot-metrics.test.ts:91-188` (`AC1 (P1): proves regression where base counted rejected webhook_event rows instead of actual duplicate runs`, `AC2 (P2): proves regression where scheduled runs were missing from report in base`, `AC3 (P2): proves regression where staging uptime criterion was missing in base`) | `pnpm vitest run tests/unit/pilot-metrics.test.ts` | 0 |
| **AC5 (Clean Checks)** | Full unit test suite (18 tests), integration test suite (9 tests), TypeScript typecheck, and ESLint | `pnpm vitest run tests/unit/pilot-metrics.test.ts`<br>`env FLOWLINE_ENV=test DATABASE_URL=postgres://abdelrahmanahmed@localhost:5432/flowline_test pnpm vitest run tests/integration/pilot-metrics.test.ts`<br>`pnpm typecheck`<br>`pnpm lint` | 0 |

---

## Command Outputs

### 1. Unit Tests (`tests/unit/pilot-metrics.test.ts`)

```
$ nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts --maxWorkers=2

 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-320

 ✓ |unit| tests/unit/pilot-metrics.test.ts (18 tests) 274ms
   ✓ pilot-metrics: parseRange (6)
     ✓ reads an inclusive UTC day range 1ms
     ✓ rejects ["--from","2026-10-16"] (missing --to) with a UsageError 0ms
     ✓ rejects ["--to","2026-10-16"] (missing --from) with a UsageError 0ms
     ✓ rejects ["--from","2026-10-16","--to","tomorrow"] (not a date) with a UsageError 0ms
     ✓ rejects ["--from","2026-02-30","--to","2026-03-05"] (nonexistent day JS would roll over) with a UsageError 0ms
     ✓ rejects ["--from","2026-10-23","--to","2026-10-16"] (reversed range) with a UsageError 0ms
   ✓ pilot-metrics: formatMetricsAsMarkdown (4)
     ✓ AC2 & AC3: prints every row on an empty range without crashing (all 13 metrics) 1ms
     ✓ AC2: formats scheduled runs count in markdown 0ms
     ✓ AC1: formats duplicate webhook runs count in markdown 0ms
     ✓ formats run success rate as 0.0%, 100.0%, or fractional percentage 0ms
   ✓ pilot-metrics: regressions (demonstrating base failure vs head pass) (3)
     ✓ AC1 (P1): proves regression where base counted rejected webhook_event rows instead of actual duplicate runs 0ms
     ✓ AC2 (P2): proves regression where scheduled runs were missing from report in base 0ms
     ✓ AC3 (P2): proves regression where staging uptime criterion was missing in base 0ms
   ✓ pilot-metrics: collectPilotMetrics and queries (3)
     ✓ AC1 & AC2: propagates scheduled runs and duplicate runs from queryable to PilotMetrics 0ms
     ✓ AC1: getDuplicateWebhookRuns executes query against Queryable 1ms
     ✓ AC2: getScheduledRuns executes query against Queryable 0ms
   ✓ pilot-metrics: CLI (2)
     ✓ detects direct execution by real path, even for relative paths and spaces 0ms
     ✓ exits non-zero with a usage message on stderr for a reversed range, before touching the DB 270ms

 Test Files  1 passed (1)
      Tests  18 passed (18)
   Duration  651ms
Exit code: 0
```

### 2. Integration Tests (`tests/integration/pilot-metrics.test.ts`)

```
$ nice -n 10 env FLOWLINE_ENV=test DATABASE_URL=postgres://abdelrahmanahmed@localhost:5432/flowline_test pnpm vitest run tests/integration/pilot-metrics.test.ts --maxWorkers=2

 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-320

 ✓ |integration| tests/integration/pilot-metrics.test.ts (9 tests) 887ms
   ✓ pilot-metrics (9)
     ✓ counts sign-ups once per user and takes the median of each user's first verification 154ms
     ✓ reports run success rate and p95 queue-to-start over finished runs 20ms
     ✓ reports 0.0% run success rate when all finished runs in range failed 18ms
     ✓ counts onboarding + workspace within 24h of sign-up, excluding skippers and earlier cohorts 17ms
     ✓ counts a first publication within 3 days of sign-up from immutable publish versions 18ms
     ✓ AC2: counts accepted webhook runs, scheduled runs and decided workflow approvals in range 18ms
     ✓ AC1: counts a webhook trigger_ref that produced two runs as one duplicate (and 0 otherwise) 64ms
     ✓ AC3: prints every metric as 0 or N/A on a range with no data 15ms
     ✓ AC3: formats metrics as a Markdown table with no connection string 18ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  2.90s
Exit code: 0
```

### 3. Typecheck and Lint

Typecheck:
```
$ pnpm typecheck
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-320
> tsc --noEmit
Exit code: 0
```

Lint:
```
$ pnpm lint
> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-320
> eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0
```
