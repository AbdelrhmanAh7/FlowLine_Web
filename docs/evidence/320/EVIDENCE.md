# Evidence — Issue #320: fix pilot-metrics.ts: measure actual duplicate runs, scheduled runs and uptime

Supersedes part of #170. Refs #143.

Branch: `ai/320-p2`
Tested commit (HEAD of ai/320-p2): `ca480a87`
Originating review finding: PR #170 discussion `r4241768670` (finding `f7eba2a4e9dd`)
Originating Sentry issue: None (internal ops script review finding split from PR #170)
E2E Waiver: `E2E: not needed — internal ops CLI script (scripts/pilot-metrics.ts), no user-facing UI or endpoints`

## Acceptance Criteria

**AC1 (P1 — Measure actual duplicate runs instead of rejected event rows)**
In PR #170 the query counted `webhook_event` rows where `status = 'rejected'`. Production webhook handlers at
`src/app/api/hooks/[token]/route.ts:88-91` return the existing event for same-event retries (HTTP 200), and
signature replays hit the unique constraint at lines 118-121 returning HTTP 409 without persisting a rejected row.
Consequently the old query reported 0 regardless of duplicate delivery activity, and would also miss duplicate `run`
rows if database enforcement drifted.
Fix: `getDuplicateWebhookRuns` counts duplicate `run` rows grouped by `(flow_id, trigger_ref)` where
`trigger_kind = 'webhook'` and `trigger_ref IS NOT NULL`, summing `(n - 1)` for groups with `COUNT(*) > 1`.

**AC2 (P2 — Report scheduled runs required by pilot goal)**
`docs/vision.md:7` defines the pilot as proving that users can run both webhook-triggered and schedule-triggered
workflows, but the PR #170 report had no scheduled run count.
Fix: `getScheduledRuns` queries `run` where `trigger_kind = 'schedule'` within the date range;
`PilotMetrics.scheduledRuns` carries the count; `formatMetricsAsMarkdown` renders `| Scheduled runs | <n> |`.

**AC3 (P2 — Include required uptime criterion)**
`docs/vision.md:16` requires staging uptime ≥99% among the week-1 pilot success criteria, but the report omitted it.
Fix: `NOT_TRACKED_UPTIME` constant = `"N/A (measured via external /api/health probe, not stored in DB)"`;
`formatMetricsAsMarkdown` includes `| Staging uptime | ${NOT_TRACKED_UPTIME} |`.

**AC4 — Unit test coverage**
`tests/unit/pilot-metrics.test.ts` covers: range parsing (valid, invalid, reversed, nonexistent dates),
Markdown table formatting for all 13 required metrics without empty cells, regression tests (AC1/AC2/AC3:
base failure → head pass), direct execution detection, and exit code 2 on invalid CLI arguments before DB connection.

**AC5 — Integration test coverage**
`tests/integration/pilot-metrics.test.ts` verifies against PostgreSQL (`flowline_test`, synthetic 2001-03 window):
scheduledRuns (1 counted), duplicateWebhookRuns (0 clean, 1 via transactional index drop), runSuccessRate,
signups, onboardingAndWorkspaceDay1, publishedFlowWithin3Days, and scoped cleanup (only removes seeded rows).

## Verification Report

| AC# | Criterion | Test / Command | Result | Exit Code |
|-----|-----------|----------------|--------|-----------|
| AC1 | `getDuplicateWebhookRuns` counts duplicate `run` rows, not rejected `webhook_event` rows | `tests/unit/pilot-metrics.test.ts` — "AC1 (P1): proves regression where base counted rejected webhook_event rows"; `tests/integration/pilot-metrics.test.ts` — transactional index-drop duplicate detection | PASS (18/18 unit, 9/9 integration) | 0 |
| AC2 | `getScheduledRuns` in `PilotMetrics` and `formatMetricsAsMarkdown` | `tests/unit/pilot-metrics.test.ts` — "AC2 & AC3: prints every row"; "AC2: formats scheduled runs count"; "AC2 (P2): proves regression where scheduled runs were missing from report in base"; integration test — 1 scheduled run counted | PASS (18/18 unit, 9/9 integration) | 0 |
| AC3 | `formatMetricsAsMarkdown` includes staging uptime row with `NOT_TRACKED_UPTIME` | `tests/unit/pilot-metrics.test.ts` — "AC3 (P2): proves regression where staging uptime was missing from report in base"; integration test — markdown contains "Staging uptime" and "/api/health probe" | PASS (18/18 unit, 9/9 integration) | 0 |
| AC4 | Unit tests: range parsing, formatting, regression, direct run, exit code 2 | `pnpm vitest run tests/unit/pilot-metrics.test.ts --maxWorkers=2` | 18/18 PASS | 0 |
| AC5 | Integration tests: SQL queries against real PostgreSQL | `pnpm vitest run tests/integration/pilot-metrics.test.ts --maxWorkers=2` | 9/9 PASS | 0 |

## Regression Test Evidence (Fails on Base, Passes on Head)

Three tests in `tests/unit/pilot-metrics.test.ts` demonstrate the base failure:

**AC1 (P1 duplicate runs)**
Simulated state: 2 runs with identical `(flowId: "flow-a", triggerRef: "evt-123")` + 0 rejected webhook events:
- Base logic (`events.filter(e => e.status === "rejected" && e.runId !== null).length`): returns `0` — fails to detect duplicate runs.
- Head logic (`(flow_id, trigger_ref)` grouping on `run` table): returns `1` — correctly detects 1 duplicate.
When a `webhook_event` is rejected due to flow unpublish (with a runId):
- Base logic: returns `1` — false positive (counted a non-duplicate rejection).
- Head logic: returns `0` — correct (only 1 run existed).

**AC2 (P2 scheduled runs)**
- Base report output: `baseMarkdown.includes("Scheduled runs") === false`.
- Head report output: includes `| Scheduled runs | <count> |`.

**AC3 (P2 staging uptime)**
- Base report output: `baseMarkdown.includes("Staging uptime") === false`.
- Head report output: includes `| Staging uptime | N/A (measured via external /api/health probe, not stored in DB) |`.

## Fresh Command Execution Evidence

### 1. Unit Tests — `pnpm vitest run tests/unit/pilot-metrics.test.ts --maxWorkers=2`
```
✓ |unit| tests/unit/pilot-metrics.test.ts (18 tests) 678ms
  ✓ pilot-metrics: parseRange (6)
  ✓ pilot-metrics: formatMetricsAsMarkdown (4)
  ✓ pilot-metrics: regressions (demonstrating base failure vs head pass) (3)
  ✓ pilot-metrics: collectPilotMetrics (2)
  ✓ pilot-metrics: isMainModule (1)
  ✓ pilot-metrics: CLI (2)
Test Files  1 passed (1)
     Tests  18 passed (18)
 Start at  00:04:05
 Duration  1.37s
```
Exit code: **0**

### 2. Integration Tests — `pnpm vitest run tests/integration/pilot-metrics.test.ts --maxWorkers=2`
```
migrated postgresql://localhost:5432/flowline_test
[seed-platform] test platform credentials ready
✓ |integration| tests/integration/pilot-metrics.test.ts (9 tests) 1120ms
  ✓ pilot-metrics (9)
    ✓ counts sign-ups once per user and takes the median of each user's first verification 472ms
Test Files  1 passed (1)
     Tests  9 passed (9)
 Start at  00:04:09
 Duration  3.47s
```
Exit code: **0**

### 3. Typecheck — `pnpm typecheck`
```
> flowline@0.1.0 typecheck
> tsc --noEmit
```
Exit code: **0**

### 4. Lint — `pnpm lint`
```
> flowline@0.1.0 lint
> eslint . --cache --cache-location node_modules/.cache/eslint/
```
Exit code: **0**

## Files Changed

| File | Change |
|------|--------|
| `scripts/pilot-metrics.ts` | Added `getScheduledRuns`, `getDuplicateWebhookRuns`, `NOT_TRACKED_UPTIME`; updated `PilotMetrics`, `collectPilotMetrics`, `formatMetricsAsMarkdown` |
| `tests/unit/pilot-metrics.test.ts` | 18 tests: range parsing, formatting, AC1/AC2/AC3 regression tests, mock query execution, CLI exit code |
| `tests/integration/pilot-metrics.test.ts` | 9 tests: SQL against `flowline_test`, transactional duplicate detection, scoped cleanup |
| `docs/DEVELOPER_GUIDE.md` | Added Useful scripts section documenting `pilot-metrics.ts` usage |
| `docs/implementation/PHASE4_BETA_REPORT.md` | Recorded Issue #320 resolution |
| `docs/evidence/320/EVIDENCE.md` | This file (per-issue evidence path, process rules compliant) |

## Skills Used
- `systematic-debugging` (root-cause analysis of rejected-event vs duplicate-run query)
- `test-first` (regression tests written to demonstrate base failure before implementing fix)
- `root-cause debugging` (rework round: traced QA recurring findings to vitest gate CI failure, not test logic)
