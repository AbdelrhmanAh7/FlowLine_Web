# Evidence — Issue #316: fix: pilot-metrics.ts: major (Claude Opus 5.5·medium): metrics.runSuccessRate ? ... : "N/A" …

Tested commit: `HEAD` (branch `ai/316`)

All checks and tests were executed locally against this branch in the workspace `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-316`.

## Acceptance Criteria and Verification

| Req / AC | Description | Verification Method | Result | Commit |
|---|---|---|---|---|
| **AC1** | `formatMetricsAsMarkdown` in `scripts/pilot-metrics.ts` checks `metrics.runSuccessRate != null` rather than truthiness (`metrics.runSuccessRate ? ...`), formatting `runSuccessRate: 0` as `"0.0%"` instead of `"N/A"`. | Unit test `tests/unit/pilot-metrics.test.ts:65-67` (`shows a 0% success rate as 0.0%, not N/A (every finished run failed)`) and integration test `tests/integration/pilot-metrics.test.ts:498-507`. | 15/15 unit tests pass; 9/9 integration tests pass | HEAD |
| **AC2** | When `metrics.runSuccessRate` is `null` (no finished runs in the query range), `formatMetricsAsMarkdown` outputs `"N/A"`. | Unit test `tests/unit/pilot-metrics.test.ts:69-71` (`formats null runSuccessRate as N/A (no finished runs in range)`) and integration test `tests/integration/pilot-metrics.test.ts:553-568`. | 15/15 unit tests pass; 9/9 integration tests pass | HEAD |
| **AC3** | When `metrics.runSuccessRate` is a positive number (e.g. `0.8` or `1.0`), `formatMetricsAsMarkdown` formats as percentage with one decimal place (`"80.0%"`, `"100.0%"`). | Unit test `tests/unit/pilot-metrics.test.ts:73-83` (`formats 100% success rate as 100.0%` and `formats a fractional rate`). | 15/15 unit tests pass | HEAD |
| **AC4** | A cohort where every finished run failed (`runSuccessRate: 0`) is covered end-to-end, asserting `| Run success rate | 0.0% |`. | Unit test `tests/unit/pilot-metrics.test.ts:100-123` (`collectPilotMetrics` mock returning `success_rate: 0`) and integration test `tests/integration/pilot-metrics.test.ts:498-507` querying PostgreSQL runs where all finished runs in range failed. | 15/15 unit tests pass; 9/9 integration tests pass | HEAD |
| **AC5** | Regression test proves that the base truthiness check fails when `runSuccessRate === 0` (producing `"N/A"`), while the head `!= null` check passes (producing `"0.0%"`). | Unit regression test `tests/unit/pilot-metrics.test.ts:85-94` and negative control test run on base code (failing with exit code 1). | Failed on base (exit code 1); Passed on head (exit code 0) | HEAD |

---

## Test Execution Evidence

### 1. Regression Test Failure on Base (Truthiness Check)

When `scripts/pilot-metrics.ts:263` used the truthiness check:
```typescript
`| Run success rate | ${metrics.runSuccessRate ? `${(Number(metrics.runSuccessRate) * 100).toFixed(1)}%` : "N/A"} |`,
```

Unit test run on base truthiness check:
```
$ nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts --maxWorkers=2
 FAIL  |unit| tests/unit/pilot-metrics.test.ts > pilot-metrics: formatMetricsAsMarkdown > AC1 & AC4: shows a 0% success rate as 0.0%, not N/A (every finished run failed)
AssertionError: expected '# Pilot Metrics: 2026-10-16 to 2026-1…' to contain '| Run success rate | 0.0% |'

- Expected
+ Received

- | Run success rate | 0.0% |
+ | Run success rate | N/A |

 ❯ tests/unit/pilot-metrics.test.ts:66:80
 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
Exit code: 1
```

Integration test run on base truthiness check:
```
$ nice -n 10 env FLOWLINE_ENV=test DATABASE_URL=postgres://abdelrahmanahmed@localhost:5432/flowline_test_pilot pnpm vitest run tests/integration/pilot-metrics.test.ts --maxWorkers=2
 FAIL  |integration| tests/integration/pilot-metrics.test.ts > pilot-metrics > reports 0.0% run success rate when all finished runs in range failed
AssertionError: expected '# Pilot Metrics: 2001-03-19 to 2001-0…' to contain '| Run success rate | 0.0% |'

- Expected
+ Received

- | Run success rate | 0.0% |
+ | Run success rate | N/A |

 ❯ tests/integration/pilot-metrics.test.ts:506:22
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
Exit code: 1
```

### 2. Passing Tests on Head

Unit tests (`tests/unit/pilot-metrics.test.ts`):
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
   Start at  01:23:29
   Duration  782ms
Exit code: 0
```

Integration tests (`tests/integration/pilot-metrics.test.ts`):
```
$ nice -n 10 env FLOWLINE_ENV=test DATABASE_URL=postgres://abdelrahmanahmed@localhost:5432/flowline_test_pilot pnpm vitest run tests/integration/pilot-metrics.test.ts --maxWorkers=2
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
   Start at  01:23:30
   Duration  2.09s
Exit code: 0
```

### 3. Typecheck and Lint

Typecheck:
```
$ pnpm typecheck
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-316
> tsc --noEmit
Exit code: 0
```

Lint:
```
$ pnpm lint
> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-316
> eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0
```

Evidence secrets scan:
```
$ pnpm check:evidence
> flowline@0.1.0 check:evidence /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-316
> node scripts/check-evidence-secrets.mjs
check-evidence-secrets: 0 local secret value(s) checked across 174 file(s); 0 hit(s)
Exit code: 0
```

---

## Originating Issue & Sentry
- **Originating review finding:** PR #170 discussion `r4241760623` (finding `6bffc68a8711`) by Claude Opus 5.5: https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/170#discussion_r4241760623
- **Originating Sentry issue:** None (internal review finding split from PR #170; parent issue #143)
- **E2E Waiver:** `E2E: not needed — read-only internal ops CLI script, no user-facing UI or endpoints`
- **Linkage:** Supersedes part of #170. Refs #143.
