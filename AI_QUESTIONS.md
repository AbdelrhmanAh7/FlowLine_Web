# AI questions — issue #117 (`[e2e] Flows list and dashboard failing on main`)

Branch `ai/117` (PR #139). Status: **stopped, owner decision needed.** The fix changes documented product behaviour
(and probably the schema), so I have not changed the product.

## What actually fails (root cause)

The issue text cut the assertion off at `"lastRunStatus":"succeed…`, so it looked like a status-mapping bug. It is not.
The full message in `~/agents/logs/stable/FlowLine_Web/2026-10-09/e2e-army/flows-api/report.json` (test
`[fl-flows-list.3]`, `flows-api.e2e.ts:94`) is:

| field | product returns | test expects |
|---|---|---|
| `runCount` | 2 | 2 ✓ |
| `lastRunStatus` | `"succeeded"` | `"succeeded"` ✓ |
| `successRate` | 1 | 1 ✓ |
| `nodeCount` / `trigger` | 3 / `trigger.manual` | same ✓ |
| **`publishedVersion`** | **3** | **1** ✗ |

Root cause: every manual run stores a `run` snapshot in `flow_version` and takes the next version number
(`src/server/runs.ts:104` → `insertVersion(..., "run")`, `src/server/flows.ts:143`). The test runs the good flow twice and
then publishes it, so the publication is `flow_version.version = 3`, and `listFlows` reports that number
(`src/server/flows.ts:54`).

This is the documented design, not a regression. `DESIGN_DECISIONS.md` §2 says `flow_version` holds `save`, `run` (pinned
for each run) and `overwrite` snapshots in one sequence. The history panel shows them as v1 Run, v2 Run, v3 Published. The
hub test was added in nql-agents `1dde307` as a staged `tests-dev` suite ("not promoted: shards not yet verified
green"). It has never passed on any FlowLine commit.

## Why I did not just change it

The number is more than a label:
- the subflow picker pins `publishedVersion` as the subflow version (`src/components/builder/node-config.tsx:357`);
- publish validation looks a subflow up by `(flowId, version)` and requires `reason = 'publish'`
  (`src/server/publish.ts` `serverIssues`);
- `flow_version_unique` is a unique index on `(flow_id, version)`, and existing runs and subflow pins reference current
  numbers.

Every option that makes the test pass changes version semantics. Some also need a migration.

## Options (please pick one)

1. **Runs stop using up version numbers (matches the test).** `run` snapshots keep a row (`run.flow_version_id` needs
   one) but leave the public sequence. Two ways to do it: a partial unique index `WHERE reason <> 'run'` plus a separate
   `run`-snapshot ordinal, or `version` NULL for runs. Needs a drizzle migration, changes to the history panel and listVersions, a
   `reason='publish'` filter in the subflow lookups, and an update to DESIGN_DECISIONS §2. Existing data keeps its numbers. Estimated size is about 150–250 lines.
2. **Run of an unchanged draft reuses its latest snapshot, and publish promotes that snapshot.** No migration. But it
   mutates a supposedly immutable snapshot's `reason`, and it only gives v1 when nothing was edited between the runs and
   the publish. I do not recommend it.
3. **The hub test's expectation is wrong for this product.** Change `[fl-flows-list.3]` to assert
   `publishedVersion` equals the publish response's `version` (as `[fl-flow-publish.1]` already does). Then
   `[fl-flows-list.3]` should pass on main with no product change. That is a hub-side edit, and the issue says
   "never weaken the test", so it is your call.

## Done on this branch so far

- `e2e-army/117-flows-list-dashboard.e2e.ts` was rewritten. It mirrors `[fl-flows-list.3]` and uses only `e2e`, `@e2e-dev/web` and
  node built-ins. It answers the four review threads on PR #139: no hub-checkout imports, `createFlow` defined, the bad
  flow is run, and the publish step is included. It also covers the empty workspace and the overview KPIs. It type-checks
  (`tsc --strict` against the hub runner's `e2e` types). **It has not been run against a stack.** It is expected to fail on
  `publishedVersion` until one of the options above is chosen.
- If option 3 is chosen, change the `publishedVersion: 1` assertion in the same way (to the publish response's version).
  Otherwise keep it.

## Side observation (not asserted by the test)

`lastRunAt` in the flow list is the raw Postgres text `"2026-10-09 06:44:04.423993+03"`, not an ISO timestamp like
`updatedAt`. The cause is the untyped `sql<Date>` subquery in `listFlows`. Worth a separate small issue.

## Fix-review round 1 (PR #139) — status

- Thread "no product code / lastRunStatus mapping": there is no mapping bug (`lastRunStatus` is already `"succeeded"`; the
  issue text was truncated). The real mismatch is `publishedVersion` (3 vs 1), caused by documented design
  (`insertVersion` in `src/server/flows.ts` gives `run` snapshots a number in the same sequence as publications). Fixing it
  needs option 1 or 3 above (migration or hub-test change), which is an owner decision. **Please do not auto-close #117 from
  this PR** — drop "Closes #117" (use "Refs #117") until the owner picks an option.
- Threads about hub-checkout imports and the never-run `bad` flow: already fixed in `f0fbab0`
  (`e2e-army/117-flows-list-dashboard.e2e.ts` is self-contained, runs `bad` via `runToEnd`, which tolerates failed runs).
