# Issue #117 verification report

Tested SHA: `5c6f939a` (branch `ai/117`, PR #139), 2026-10-18, run locally on the Mac mini.
Database: `flowline_test_117c`. Test stack: `pnpm e2e:army` on :3100 (`scripts/e2e-army.mjs`). The local `.env.test`
copy had an empty `FLOWLINE_EGRESS_ALLOWLIST`, so the first stack run failed with `connect slack 400 EGRESS_BLOCKED`.
I set it to CI's value from `.github/ci/env.test.template` (`127.0.0.1:4010,127.0.0.1:4011`) and reran.

## Acceptance criteria

| AC | Criterion | Covered by | Result |
|----|-----------|------------|--------|
| AC1 | One run before publishing v3 and one succeeded run after it: `GET /api/v1/flows` reports `runCount: 2` | integration "GET /api/v1/flows counts a run from before publishing v3 and a succeeded run after it…"; e2e-army `@issue-117 [fl-flows-list.4]` | pass |
| AC2 | `lastRunStatus` is the status of the run with the greatest `finishedAt` (`succeeded`), whatever its revision | same two tests; integration "the last run is the run that finished last, even when a newer run finished before it"; integration "a run in flight is the last run only until a run of the flow finishes; a running run ranks ahead of a queued one" | pass |
| AC3 | `lastRunAt` is that run's `finishedAt` | same tests (`lastRunAt` equals `after.finishedAt` / `o.finishedAt` / `done.finishedAt`) | pass |
| AC4 | A flow with no runs is listed with `runCount: 0` and `lastRunStatus: null` | integration "lists a flow that never ran with runCount 0…"; e2e-army `[fl-flows-list.4]` (idle flow) | pass |
| AC5 | Pausing keeps `runCount`/`lastRunStatus`/`lastRunAt` and reports the pause | integration "pausing a flow keeps runCount, lastRunStatus and lastRunAt…"; e2e-army `[fl-flows-list.4]` (Slack connection removed: `paused: true`, `pausedReason: connection:<id>:removed`) | pass |
| AC6 | `tests/integration/flows.test.ts` is green; `e2e-army/117-flows-list-dashboard.e2e.ts` is unmodified | `git diff --quiet origin/main -- e2e-army/117-flows-list-dashboard.e2e.ts` (exit 0); integration 16/16; the file's `@issue-204 (from #117) AC1` test passes on the stack | pass |

## Commands and exit codes

| Command | Exit | Output |
|---------|------|--------|
| `node scripts/with-env.mjs .env.test vitest run --project integration tests/integration/flows.test.ts --maxWorkers=1` | 0 | 16 passed (16) |
| Same, `-t "in flight"`, with `src/server/flows.ts` from the previous head `4fe2643` (`nulls first`) | 1 | 1 failed: `lastRunStatus` expected `"running"`, received `"queued"` |
| `node scripts/e2e-army.mjs --shard-id flows-api --grep fl-flows-list` | 0 | `[fl-flows-list.3]` and `@issue-117 [fl-flows-list.4]` passed (2) |
| `node scripts/e2e-army.mjs e2e-army/117-flows-list-dashboard.e2e.ts` | 0 | 1 passed |
| `vitest run --project unit tests/unit/no-conflict-markers.test.ts` | 0 | 5 passed |
| `eslint` on the 5 changed source/test files | 0 | clean |
| `pnpm typecheck` | 0 | clean |
| `tsc` on the army files against the hub's `e2e` packages | 0 | clean |

## Changed covering tests

- `tests/integration/flows.test.ts`: the in-flight test now asserts the ordering clause (`finishedAt desc nulls last, startedAt desc nulls last, id desc`), where `startedAt desc nulls last` is a deliberate refinement over the literal spec text (`startedAt DESC`, which defaults to NULLS FIRST in Postgres) so that a running run ranks ahead of a queued one when neither has finished. It is the regression test for the `nulls first` bug: it fails on `4fe2643` and passes on `5c6f939a`.
- `e2e-army/features/flows-api.e2e.ts`: new `@issue-117 [fl-flows-list.4]`, request level, no model.

No UI file changed, so there are no screenshots. Sentry: the issue does not link a Sentry issue, and none is known for
this failure. It came from the hub's stable gate (`fl-flows-list` on main @ `d211653` and `9c754b2`).

## Stop-hook run (`vitest related` on the changed files)

The hub stop hook runs `vitest related --run --maxWorkers=2 $CHANGED_FILES` without the test env. It fails at
`tests/integration/global-setup.ts` ("must run against flowline_test (got )") before any test starts. With the env
set, `related` picks up the 34 files that import `src/server/flows.ts` and runs them two at a time on one database:
7 tests failed. Two causes were in the local env: the owner's `.env.test` uses the same key for the platform and the
workspace encryption rings, and billing is not configured. The third was parallel files claiming each other's queued
runs. Two of the failures were in `nightly`-project tests.

Rerun one file at a time on `flowline_test_117c`, with a synthetic platform key derived from a fixed seed (exported
for the run, nothing committed):

| File | Head `5c6f939a` | Base (main's `flows.ts` + `route.ts`) |
|------|-----------------|---------------------------------------|
| flows, runs, ai-hub, ai-retest-fx2, cxh14-step-retry, p2-actions, p2-review-fixes, sec-wavec-fixes | all pass (16, 23, 14, 15, 3, 12, 10, 8) | not rerun |
| ai-hub-routing | 1 failed / 28 passed (`AI_COST_UNKNOWN` expected, null) | same 1 failed / 28 passed |
| company-builder | 1 failed / 51 passed ("Billing isn't configured for this installation") | same 1 failed / 51 passed |

Neither remaining failure reads the run summary, and both fail the same way without this change. They were not
fixed here (out of scope for #117).
