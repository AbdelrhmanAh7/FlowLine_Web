# Issue #251 — [e2e] CSV node failing on main (`fl-csv-data-node`)

Branch `ai/251`, PR #280. Code head tested: `73602635` (the commit that touches `src/` and `tests/`).
Originating report: stable release gate on `main` (hub logs `~/agents/logs/stable/FlowLine_Web/2026-10-13`, `-15`, `-16`).
Sentry: none; this was found by the synthetic stable gate, not by a Sentry event.

## Why main failed, and what this PR changes

| Item | Fact | Where |
|---|---|---|
| Gate failure | `expected "qty,name\n1,A\n2,B" to be "name,qty\nA,1\nB,2"` in `[fl-csv-data-node.3]` | gate runs on `9c754b2` (10-13), `2296a74` (10-15), `131235b` (10-16) |
| Root cause of that failure | `run.input` was `jsonb`; PostgreSQL jsonb reorders object keys (shorter first), so `{name, qty}` became `{qty, name}` before the worker built the CSV | `src/db/schema.ts:251` is now `json("input")` |
| Fix already on main | Migration `drizzle/0027_awesome_nemesis.sql` (`ALTER COLUMN "input" SET DATA TYPE json`), commit `39364b5d` (#287, 2026-10-16 07:34 +03:00) | **not part of this PR** |
| Gate runs vs the fix | `131235b` (2026-10-16 03:34 +03:00), the latest failing gate run, is an ancestor of `39364b5d` and predates it. No gate run on a main that contains 0027 is recorded in the issue | |
| Queue regression test on main | `tests/integration/runs.test.ts:461-479` ("CSV input column order across the queue") expects `name,qty\nA,1\nB,2` | already on main |
| This PR | Hardens `data.csv` build: `Papa.unparse` reads the header from the first row only, so a column that first appears in a later row was dropped. The engine now collects keys from all rows in first-seen order | `src/engine/execute.ts:335-342` |

## Acceptance criteria

- **AC1** `data.csv` build keeps every row's key order as given (no re-sorting), e.g. `[{z:1,a:2}]` gives `z,a`.
- **AC2** `data.csv` build keeps a column that first appears in a later row: `[{name:"A"},{name:"B",qty:2}]` gives `name,qty\nA,\nB,2`.
- **AC3** `[fl-csv-data-node.3]` (`e2e-army/features/runs.e2e.ts:184-191`) passes unchanged: this PR does not edit any e2e-army file.

## Verification report

| AC | Evidence | Command | Exit | Observed |
|---|---|---|---|---|
| AC1, AC2 | `tests/unit/engine-v2.test.ts` "CSV build keeps each row's key order and every column that appears in any row" | `pnpm exec vitest run tests/unit/engine-v2.test.ts --maxWorkers=2` | 0 | 13 passed (head) |
| AC2 regression (fails on base) | same test with `src/engine/execute.ts` checked out from `origin/main` | same command | non-zero | `1 failed \| 12 passed`; `expected 'name\nA\nB' to be 'name,qty\nA,\nB,2'` |
| AC3 | **NOT RUN.** `ops/verify/e2e-army/run-local.sh FlowLine_Web 73602635 -- --tag feat:fl-csv-data-node` could not start in this sandbox: `PermissionError: [Errno 1] Operation not permitted` on binding a local port, and the global lock dir under `~/agents/locks` was not creatable. The command hit the 10 min tool timeout while waiting for the lock (exit 143). No pass is claimed. | `run-local.sh …` | 143 (timeout) | no test output |
| Queue test | `tests/integration/runs.test.ts:461-479` needs a PostgreSQL DB; **not run here**, runs in CI | | | |
| Typecheck | `pnpm typecheck` | | 0 | clean |
| Lint | `pnpm lint` | | 0 | clean |

Open item for the harness: the e2e-army gate on this head (`feat:fl-csv-data-node`) is the proof for AC3; it must be read from the verify job.

## Changed covering tests

`tests/unit/engine-v2.test.ts` (new case, covers AC1 and AC2). The e2e-army test for the feature already exists on main and is unchanged.
No UI changed, so no screenshots or RTL/LTR check apply.
