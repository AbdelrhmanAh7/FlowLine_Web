# Issue #204 — publishedVersion changes only on publish: evidence

Tested code SHA: `c95f8b5` (last product/test change; later commits on `ai/204` are a merge of `origin/main` `d86fb7d`
and doc-only edits). Run on 2026-10-13 on the owner's Mac mini.

## e2e-army (`feat:fl-flows-list`)

- `ops/verify/e2e-army/run-local.sh FlowLine_Web origin/ai/204 -- --tag feat:fl-flows-list` (hub repo), as the brief asks:
  the stack started from `c95f8b5`, but the runner stopped with `NO_TESTS`: the hub suite currently has no test tagged
  `feat:fl-flows-list` ("5 carry none of the tags feat:fl-flows-list (no test declares it)"), and `run-local.sh` runs only
  the hub's own tests. So that command cannot exercise this feature today.
- The branch's own spec, run the way the verify job runs it: stack from `c95f8b5` held with
  `HOLD=1500 run-local.sh FlowLine_Web origin/ai/204`, then `e2e run tests/117-flows-list-dashboard.e2e.ts` (copy of
  `e2e-army/117-flows-list-dashboard.e2e.ts`, hub `e2e.config.ts`, e2e v0.18.0) against it:
  `✓ @issue-204 (from #117) AC1: the flow list and dashboard show each flow's last run, success rate and first published
  version (v1)` — Test Files 1 passed (1), Tests 1 passed (1). It asserts `publishedVersion: 1` after two runs and one
  publish, plus the failed flow and the empty draft rows.

## Integration and unit tests (freshly migrated `flowline_test_204`, one file per run)

| File | Result | Covers |
| --- | --- | --- |
| `tests/integration/runs.test.ts` | 20/20 | publish once + two runs keeps publishedVersion 1; saves and an overwrite before the first publish give v1; publish, save, overwrite, two runs, publish gives v2 |
| `tests/integration/flow-version-backfill.test.ts` | 3/3 | migration 0025 nulls legacy save/overwrite/run numbers, keeps the published number and its subflow lookup, trigger back on |
| `tests/integration/flows.test.ts` | 11/11 | flow list and history unchanged otherwise |
| `tests/unit/flow-version-label.test.ts` | 3/3 | history and inspector labels for unnumbered snapshots |

`pnpm typecheck` clean; eslint on every changed file clean. No full gate or browser-suite run is claimed (CI runs it).
