# AI questions — issue #116 (blocked on #115)

**Status: blocked. No code written.**

## Why I stopped

The brief says #116 **depends on the helper core sub-issue being merged** (`runConcurrent`, #115). As of 2026-10-09 it is not merged:

- `main` (`bb41577`) has no `tests/helpers/concurrentTx.ts` and no `runConcurrent`.
- Issue #115 is **open**. Branch `ai/115` has one commit, `155fae5 test: specify concurrent-tx helper behaviour (#115)`, which adds the unit test only. The helper file is still untracked in the #115 worktree, so another implementer is working on it now.
- PR #125 (`ai/90`, the unsplit parent #90) is open with a red `checks`/`gate`. Its helper (`e2597cc`) is not the #115 core the brief asks me to plug into.

The #116 adapter "plugs into `runConcurrent`", so it has nothing to build on until #115 lands. Building on the unmerged `ai/115` branch, or copying its helper here, would also:

- duplicate #115's deliverable;
- break the "under 120 lines" limit;
- tie this PR's red/green state to #115, which is exactly what the CTO split is meant to prevent.

## What I need

1. Re-queue #116 after #115 is merged to `main`. Or, if the owner wants the two PRs stacked, say so explicitly: this PR would then branch from `ai/115` and merge only after it.
2. Confirm the interface. The pending #115 unit test specifies:
   `runConcurrent(txA, txB, { timeoutMs })`, where each tx is `(ctx: TxContext) => Promise<T>` and calls `await ctx.arrive()` at the barrier. A `40P01` error rejects with a message matching `/deadlock/i`, and a timeout rejects with one matching `/timed out/i`.
   The #116 plan below assumes that interface stays as it is when merged.

## Plan once unblocked (about 80–100 lines, test-only)

- `tests/integration/concurrentTx.pg.ts`: a thin adapter that opens two `pg.Client`s from the existing `DATABASE_URL`. That variable is already guarded to `flowline_test[_<suffix>]` by `tests/integration/global-setup.ts`, so there are no new env vars or secrets. The adapter wraps each side in `BEGIN … COMMIT`/`ROLLBACK` and always calls `end()` in `finally`.
- `tests/integration/concurrent-tx-pg.test.ts`, run by the existing `integration` vitest project:
  - **beforeAll**: create two scratch tables with names derived from `unique()` in `tests/integration/helpers.ts`. **afterAll**: drop them.
  - **Test 1**: an opposite-order pair (A locks t1 then t2, B locks t2 then t1, with the barrier between the first and second lock) rejects as a deadlock (`40P01`). Set `SET LOCAL deadlock_timeout = '100ms'` to keep it fast and deterministic.
  - **Test 2**: a same-order pair resolves with both results.
  - Each test has a per-test timeout below 10 s. Run it 20× in a loop locally (`pnpm test:integration -- concurrent-tx-pg` against `flowline_test_<suffix>`) and record the result in the PR.
- No production code, no `.github/` changes and no e2e-army test, because the change isn't user-facing (test-only). The PR will carry `E2E: not needed — test-only helper adapter, no product behaviour change`. Docs: one line in `docs/DEVELOPER_GUIDE.md` next to #115's note.
