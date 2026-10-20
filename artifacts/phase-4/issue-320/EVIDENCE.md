# Evidence — Issue #320: fix: pilot-metrics.ts — measure actual duplicate runs, scheduled runs, and uptime

Tested commit: `9a345f18` (merge base of `ai/320` and `main`; PR #316/#324)

All checks and tests were executed locally against commit `9a345f18` in the workspace `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-320`.

## Acceptance Criteria and Verification

| Req / AC | Description | Verification Method | Result | Commit |
|---|---|---|---|---|
| **AC1 (P1)** | Measure actual duplicate webhook runs instead of rejected `webhook_event` rows. The hook route never stores rejected rows for duplicates (same-event retries return 200 with existing event; signature replays return 409). New `getDuplicateWebhookRuns` counts `run` rows grouped by `(flow_id, trigger_ref)` where `trigger_kind = 'webhook'` and `trigger_ref IS NOT NULL`, summing (n - 1) for groups with COUNT(*) > 1. | Unit test: `tests/unit/pilot-metrics.test.ts:59-63` (format includes `duplicateWebhookRuns: 0`). Integration test: `tests/integration/pilot-metrics.test.ts:534-556` — seeds 2 accepted webhook runs with unique `trigger_ref` (expects 0), then drops `run_trigger_unique` index in a rolled-back transaction, inserts a second run with same `trigger_ref`, asserts `duplicateWebhookRuns === 1`. | 15/15 unit tests pass; 9/9 integration tests pass | `9a345f18` |
| **AC2 (P2)** | Report scheduled runs required by pilot goal. Added `getScheduledRuns` querying `run` where `trigger_kind = 'schedule'`, included in `PilotMetrics.scheduledRuns` and formatted in Markdown report. | Integration test: `tests/integration/pilot-metrics.test.ts:525-532` — seeds 1 scheduled run, asserts `metrics.scheduledRuns === 1`. Unit test: `tests/unit/pilot-metrics.test.ts:59-63` — format includes `| Scheduled runs | 0 |` on empty range. | 15/15 unit tests pass; 9/9 integration tests pass | `9a345f18` |
| **AC3 (P2)** | Include required uptime criterion (staging uptime ≥99%). Added `NOT_TRACKED_UPTIME` constant documenting external `/api/health` probe monitoring (not stored in DB), rendered in Markdown table. | Unit test: `tests/unit/pilot-metrics.test.ts:59-63` — format includes `NOT_TRACKED_UPTIME` string. Integration test: `tests/integration/pilot-metrics.test.ts:558-577` — asserts markdown contains `| Staging uptime | N/A (measured via external /api/health probe, not stored in DB) |`. | 15/15 unit tests pass; 9/9 integration tests pass | `9a345f18` |

---

## Test Execution Evidence

### 1. Unit Tests (`tests/unit/pilot-metrics.test.ts`)

```
$ nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts --maxWorkers=2
  ✓ |unit| tests/unit/pilot-metrics.test.ts (15 tests) 316ms
    ✓ pilot-metrics: parseRange (6)
      ✓ reads an inclusive UTC day range 1ms
      ✓ rejects ["--from","2026-10-16"] (missing --to) with a UsageError 0ms
      ✓ rejects ["--to","2026-10-16"] (missing --from) with a UsageError 0ms
      ✓ rejects ["--from","2026-10-16","--to","tomorrow"] (not a date) with a UsageError 0ms
      ✓ rejects ["--from","2026-02-30","--to","2026-03-05"] (nonexistent day JS would roll over) with a UsageError 0ms
      ✓ rejects ["--from","2026-10-23","--to","2026-10-16"] (reversed range) with a UsageError 0ms
    ✓ pilot-metrics: formatMetricsAsMarkdown (6)
      ✓ prints every row on an empty range without crashing 1ms
      ✓ AC1 & AC4: shows a 0% success rate as 0.0%, not N/A (every finished run failed) 0ms
      ✓ AC2: formats null runSuccessRate as N/A (no finished runs in range) 0ms
      ✓ AC3: formats 100% success rate as 100.0% (all finished runs succeeded) 0ms
      ✓ AC3: formats a fractional rate and says plainly what is not recorded 0ms
      ✓ AC5: proves regression where truthiness check treats 0 as falsy returning N/A 0ms
    ✓ pilot-metrics: collectPilotMetrics (1)
      ✓ AC4: propagates a 0 success rate from run metrics query to PilotMetrics 0ms
    ✓ pilot-metrics: CLI (2)
      ✓ detects direct execution by real path, even for relative paths and spaces 0ms
      ✓ exits non-zero with a usage message on stderr for a reversed range, before touching the DB 313ms

  Test Files  1 passed (1)
       Tests  15 passed (15)
    Start at  06:08:12
    Duration  81.60s
Exit code: 0
```

### 2. Integration Tests (`tests/integration/pilot-metrics.test.ts`)

```
$ nice -n 10 env FLOWLINE_ENV=test DATABASE_URL=postgres://abdelrahmanahmed@localhost:5432/flowline_test pnpm vitest run tests/integration/pilot-metrics.test.ts --maxWorkers=2
  ✓ |integration| tests/integration/pilot-metrics.test.ts (9 tests) 106ms
    ✓ pilot-metrics (9)
      ✓ counts sign-ups once per user and takes the median of each user's first verification 9ms
      ✓ reports run success rate and p95 queue-to-start over finished runs 3ms
      ✓ reports 0.0% run success rate when all finished runs in range failed 3ms
      ✓ counts onboarding + workspace within 24h of sign-up, excluding skippers and earlier cohorts 4ms
      ✓ counts a first publication within 3 days of sign-up from immutable publish versions 2ms
      ✓ counts accepted webhook runs, scheduled runs and decided workflow approvals in range 3ms
      ✓ counts a webhook trigger_ref that produced two runs as one duplicate (and 0 otherwise) 14ms
      ✓ prints every metric as 0 or N/A on a range with no data 3ms
      ✓ formats metrics as a Markdown table with no connection string 2ms

  Test Files  1 passed (1)
       Tests  9 passed (9)
    Start at  06:09:41
    Duration  59.20s
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

Evidence secrets scan:
```
$ pnpm check:evidence
> flowline@0.1.0 check:evidence /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-320
> node scripts/check-evidence-secrets.mjs
check-evidence-secrets: 0 local secret value(s) checked across 174 file(s); 0 hit(s)
Exit code: 0
```

---

## Originating Issue & Sentry

- **Originating review findings:** PR #170 discussions:
  - `r4241768670` (finding `f7eba2a4e9dd`) by CTO: https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/170#discussion_r4241768670 (P1: duplicate runs)
  - `r4241768670` follow-ups for P2: scheduled runs and uptime
- **Originating Sentry issue:** None (internal review findings split from PR #170; parent issue #143)
- **E2E Waiver:** `E2E: not needed — read-only internal ops CLI script, no user-facing UI or endpoints`
- **Linkage:** Supersedes part of #170. Refs #143.

---

## Files Changed (in commit `9a345f18`)

- `scripts/pilot-metrics.ts` — core implementation:
  - `getDuplicateWebhookRuns` (lines 195–216): measures duplicates at `run` level via `(flow_id, trigger_ref)`
  - `getScheduledRuns` (lines 171–180): counts runs with `trigger_kind = 'schedule'`
  - `NOT_TRACKED_UPTIME` (lines 249–250): documents external `/api/health` probe
  - `formatMetricsAsMarkdown` (lines 253–274): includes all three new rows
  - `PilotMetrics` interface (lines 23–34): includes `scheduledRuns` and `duplicateWebhookRuns`
- `tests/unit/pilot-metrics.test.ts` — unit tests for formatting and CLI
- `tests/integration/pilot-metrics.test.ts` — integration tests against real PostgreSQL