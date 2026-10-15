# Issue #204 — publishedVersion changes only on publish: evidence

Historical evidence (2026-10-13). Tested code SHA: `c95f8b5` (last product/test change; later commits on `ai/204` are a merge of `origin/main` `d86fb7d`
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
| `tests/unit/e2e-army-tooling.test.ts` | 12/12 | no fixed delay in e2e-army specs, top-level e2e-army files within 8-file cap |

`pnpm typecheck` clean; eslint on every changed file clean. No full gate or browser-suite run is claimed (CI runs it).

## Revalidation — 2026-10-15

REQ-204 numbering and migration already landed on main in `83a80114945671496d9874fffbeeb72e36f3f9f4` (#253); `origin/main` is an ancestor of this branch. All callers are covered: `saveFlow` (save/overwrite), `enqueueRun` (run), `publishFlow` (publish). The existing flow-row `FOR UPDATE` precedes allocation (`src/server/publish.ts:93`); `flow_version_unique` (0000/schema.ts) already rejects duplicate non-NULL numbers and permits multiple NULLs, the same invariant as a partial unique index. No duplicate product/migration change is needed.

New coverage uses the existing Vitest, Drizzle and PostgreSQL lock helpers (no dependency changes). The 0025 fixture now bypasses 0026's insert guard transactionally and asserts legacy numbers before backfilling; previously those rows were already NULL. Numbered-run and missing-lock negative controls both fail; product files were restored. Fresh results and tested commit are recorded below after committing.

The issue spec and feature API spec passed 2/2 with `FLOWLINE_TEST_NEXT=dev E2E_ARMY_NOAGENT=1 pnpm e2e:army e2e-army/117-flows-list-dashboard.e2e.ts e2e-army/features/flows-api.e2e.ts --tag feat:fl-flows-list`. A temporary request probe also passed: real authenticated slug routes `/flows`, `/runs`, `/flows/<id>` return 200 in EN/LTR and AR/RTL. The reported 404 did not reproduce. Raw probe stays uncommitted in `.e2e/`.

The exact hub `run-local.sh FlowLine_Web <head> -- --tag feat:fl-flows-list` remains unrun: its adapter forces a full local production build, prohibited by this brief. The dev-stack run above verifies the feature without that build. CI, QA/review confirmation, thread replies and post-merge closure of #139 remain for the harness; no push, PR mutation or merge performed. Security posture: no dependencies, real secrets, permissions or workflow tokens changed; synthetic test configuration only.
