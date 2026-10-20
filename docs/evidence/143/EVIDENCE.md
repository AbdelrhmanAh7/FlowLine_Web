# Issue #143: Pilot metrics script (verification report)

Tested code on branch `ai/143` at commit `3ad8e7e9` (merged with `origin/main` at `116935af`). Local execution on 2026-10-20, Node v26.10.0 / pnpm 10.32.1, PostgreSQL test DB `flowline_test`. CI (`gate`) runs the full suite after push per repo rules.

- **E2E Gate**: E2E: not needed — read-only internal ops CLI script with no user-facing flows or endpoints.
- **UI**: None (CLI script); Playwright screenshots and RTL/LTR captures do not apply.
- **Sentry**: None (feature implementation and PR #170 review rework, not originating from a Sentry issue).

## Explicit Numbered Acceptance Criteria

1. **AC1 (Empty Range / Default Display)**: Running `pnpm tsx scripts/pilot-metrics.ts --from 1999-01-01 --to 1999-01-02` against an empty range outputs a Markdown table containing all metric rows with counts evaluating to `0` and undefined ratios/averages to `N/A`, without runtime errors or crashes.
2. **AC2 (Seeded Data Metrics)**: Against seeded database rows, the script accurately computes and outputs all 8 week-1 pilot success criteria (13 rows): sign-ups and median time-to-verified, day-1 onboarding + workspace creation, flows published within 3 days, run success rate and p95 queue-to-start latency, webhook runs, scheduled runs, workflow approvals, duplicate runs, cross-workspace access denials, Arabic language switcher share, and staging uptime.
3. **AC3 (Read-Only Safety & Sanitization)**: The script executes only read-only `SELECT` queries (zero `INSERT`/`UPDATE`/`DELETE`), prints no database connection URLs, passwords, or credentials, and prints sanitized error messages on failures.
4. **AC4 (Range Validation & CLI Behavior)**: Providing missing, malformed, nonexistent, or inverted date ranges (`--from` > `--to`) logs a clean usage message to `stderr` and exits immediately with non-zero exit code `2`.
5. **AC5 (Unit Verification & 0.0% Formatting)**: Module unit tests assert deterministic calculations on mock rows (including 0.0% formatting for 0 success rate, 100.0%, fractional 80.0%, and null fallback to N/A) without network or database access.
6. **AC6 (Side-Effect-Free Module Import)**: Importing `scripts/pilot-metrics.ts` within tests or external modules opens no database connections and emits no stdout output.

## Verification Matrix

| Criterion | Command / Test | Observed Result & Exit Code | Status |
|-----------|----------------|-----------------------------|--------|
| AC1 | `DATABASE_URL=postgres://abdelrahmanahmed@localhost:5432/flowline_test pnpm tsx scripts/pilot-metrics.ts --from 1999-01-01 --to 1999-01-02` | Exit 0; 13 Markdown table rows printed; counts `0`, ratios `N/A` | PASS |
| AC2 | `vitest run tests/integration/pilot-metrics.test.ts` (9 cases seeding users, flows, runs, approvals in synthetic 2001-03 window) | Exit 0; 9 passed, 0 failed; exact assertions on all 8 criteria | PASS |
| AC3 | `grep -niE "insert\|update \|delete\|alter \|drop " scripts/pilot-metrics.ts`; integration case "formats metrics as a Markdown table with no connection string" | Exit 0; no mutation statements found; credentials stripped from output | PASS |
| AC4 | `pnpm tsx scripts/pilot-metrics.ts --from 2026-10-23 --to 2026-10-16`<br>`pnpm tsx scripts/pilot-metrics.ts --from 2026-02-30 --to 2026-03-05`<br>`pnpm tsx scripts/pilot-metrics.ts --from 2026-10-16` | Exit 2; stderr prints `Usage: pilot-metrics.ts --from YYYY-MM-DD --to YYYY-MM-DD` | PASS |
| AC5 | `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts --maxWorkers=2` | Exit 0; 15 passed, 0 failed | PASS |
| AC6 | Unit test suite imports `scripts/pilot-metrics.ts` at module top-level; case `detects direct execution by real path` | Exit 0; no DB connection opened, no console output emitted during import | PASS |

## Changed Covering Tests

- [`tests/unit/pilot-metrics.test.ts`](file:///Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-143/tests/unit/pilot-metrics.test.ts): 15 tests covering argument parsing, date validation, markdown table rendering, 0.0% formatting, fractional rates, and direct CLI execution guard.
- [`tests/integration/pilot-metrics.test.ts`](file:///Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-143/tests/integration/pilot-metrics.test.ts): 9 tests covering end-to-end SQL queries on PostgreSQL against seeded cohorts, distinct user sign-ups, immutable publish versions, duplicate runs, and empty ranges.

## Bug Fix / Regression Demonstration

- **Symptom**: In `scripts/pilot-metrics.ts`, `metrics.runSuccessRate ? ... : "N/A"` was a truthiness check. When all finished runs failed in a cohort (success rate = 0), `0` evaluated to falsy, printing `"N/A"` instead of `"0.0%"`.
- **Root Cause**: JavaScript numeric `0` is falsy in ternary condition `metrics.runSuccessRate ? ... : "N/A"`.
- **Fix**: Changed condition to explicit null check: `metrics.runSuccessRate != null ? `${(Number(metrics.runSuccessRate) * 100).toFixed(1)}%` : "N/A"`.
- **Demonstration**:
  - Regression unit test: `tests/unit/pilot-metrics.test.ts:79` (`AC5: proves regression where truthiness check treats 0 as falsy returning N/A`). Fails on base logic (returns `"N/A"`), passes on head (returns `"0.0%"`).
  - Integration test: `tests/integration/pilot-metrics.test.ts:497` (`reports 0.0% run success rate when all finished runs in range failed`). Passes with `"0.0%"`.

## Local Check Results

- `pnpm typecheck` (`tsc --noEmit`): Exit 0 (0 errors)
- `pnpm lint` (`eslint . --cache`): Exit 0 (0 warnings, 0 errors)
- `pnpm check:evidence`: Exit 0 (0 secrets detected)
- `nice -n 10 pnpm vitest run tests/unit/pilot-metrics.test.ts --maxWorkers=2`: 15 passed, 0 failed, Exit 0
- `env FLOWLINE_ENV=test DATABASE_URL=postgres://abdelrahmanahmed@localhost:5432/flowline_test nice -n 10 pnpm vitest run tests/integration/pilot-metrics.test.ts --maxWorkers=2`: 9 passed, 0 failed, Exit 0
