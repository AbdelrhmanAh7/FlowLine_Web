# Issue #143: pilot metrics script (verification report)

Tested code SHA: `9ad9ec71` (branch `ai/143`). Local run, 2026-10-18, Node 26 / pnpm 10.32.1, test DB `flowline_test_143`
(migrated with `src/db/migrate.ts`). CI (`gate`) runs the full suite after push; it was not run locally.

E2E: not needed. The script is a read-only internal ops tool; it has no user-facing flow, so no `e2e-army` test is added.
UI: none, so no screenshots or RTL/LTR captures apply. Sentry: no originating Sentry issue; this is a feature (review threads T1-T10 on PR #170).

## Acceptance criteria

| AC | Criterion | Evidence | Result |
|----|-----------|----------|--------|
| AC1 | Runs against the test DB with seeded data and prints every metric | `vitest run --project integration tests/integration/pilot-metrics.test.ts` (8 cases seed rows in a 2001-03 window and assert each metric) | 8 passed, 0 failed |
| AC2 | Empty range prints a table with all rows and no error | `node scripts/with-env.mjs <env> tsx scripts/pilot-metrics.ts --from 1999-01-01 --to 1999-01-02` | exit 0, 11 rows; counts are `0`, no-data ratios `N/A`. Unit case "prints every row on an empty range" |
| AC3 | Read-only; no secrets in output | `grep -niE "insert\|update \|delete\|alter \|drop " scripts/pilot-metrics.ts` finds nothing; integration case "no connection string"; errors print `err.message` only | pass |
| AC4 | Invalid or reversed range exits non-zero, usage on stderr | CLI: `--from 2026-10-23 --to 2026-10-16` and `--from 2026-02-30 ...` both exit 2 with `Usage: pilot-metrics.ts ...`; unit `exits non-zero with a usage message` | pass |
| AC5 | Seeded rows check two metrics exactly | median time-to-verified `2h` and run success rate `7/9` asserted in the integration cases; p95 `36000 ms` too | pass |
| AC6 | Importing the module opens no connection and prints nothing | The unit file imports the module at top level; `main()` runs only when `isMainModule` is true (unit `detects direct execution by real path`) | pass |

## Review findings (CTO round) to proof

| Finding | Test |
|---------|------|
| 0% success shown as N/A | unit `shows a 0% success rate as 0.0%` |
| Publish time from `flow.updated_at` | integration `counts a first publication within 3 days ...` (day 0 + day 5 republish, day 6 first publish, pre-range user) |
| Day-1 cohort / skippers | integration `counts onboarding + workspace within 24h ...` (25h workspace, skipper, pre-range signup) |
| Duplicate metric reads rows the route never writes | integration `counts a webhook trigger_ref that produced two runs as one duplicate` (index dropped inside a rolled-back transaction; 1 then 0, index restored) |
| CLI guard | unit `detects direct execution by real path` (relative path, spaces) |
| Reversed/nonexistent range | unit `rejects ... with a UsageError` (5 cases) |
| Unscoped cleanup / shared-DB flake | integration seeds only in 2001-03, deletes by seeded ids, `afterAll` in try/finally |

Regression check: with the previous `scripts/pilot-metrics.ts` (`git show eab9854c:scripts/pilot-metrics.ts`) the same integration file gives
`Tests 4 failed | 4 passed (8)` (onboarding, publish, approvals, duplicate); with the new script `8 passed`.

## Commands and exit codes

- `pnpm typecheck` (`tsc --noEmit`): exit 0, no errors.
- `pnpm exec eslint scripts/pilot-metrics.ts tests/unit/pilot-metrics.test.ts tests/integration/pilot-metrics.test.ts`: exit 0.
- `pnpm exec vitest run --project unit tests/unit/pilot-metrics.test.ts`: 11 passed (run with the Bash sandbox off; the CLI test spawns `tsx`, which needs a unix socket).
- Integration: `node scripts/with-env.mjs <env.test copy> vitest run --project integration tests/integration/pilot-metrics.test.ts` with `DATABASE_URL` set to `flowline_test_143`: 8 passed.

## Known gaps (stated, not hidden)

- Rows 6 (cross-workspace denials) and 7 (Arabic share) print `N/A`: nothing in the schema records them. Recording them is an app change outside this issue.
- The issue's "0 when no data" is `N/A` for median, p95 and success rate on an empty range: 0% would look like a real total failure.
- The duplicate metric is an invariant check; `run_trigger_unique` should keep it at 0.
- Uptime (docs/vision.md) and scheduled-run counts were suggested by a reviewer; they are not among the 8 criteria in the issue and are left for a follow-up.
