# Evidence — issue #116: Postgres adapter and integration tests for `runConcurrent`

Tested commit: see "Tested commit" below. Run on 2026-10-11, macOS, Node 26.10.0, Vitest 5.0.2, local PostgreSQL 16.15 (CI uses 17), `deadlock_timeout` = 1s (server default, not changed), throwaway database `flowline_test_i116` (accepted by the integration global-setup guard).

## What changed on 2026-10-11 (merge of `main`)
`main` gained the Postgres adapter `runConcurrentPg` in `tests/helpers/concurrentPgTx.ts` with advisory-lock tests in `tests/integration/concurrent-tx.test.ts` (#90, PR #125) while this branch was open. This branch's own adapter (`tests/integration/concurrentTx.pg.ts`) duplicated it, so it was deleted; the #116 tests now plug the scratch-table cases into that one adapter. The PR therefore adds only `tests/integration/concurrent-tx-pg.test.ts` (row locks on two scratch tables) plus docs.

## How the integration harness is reused
- Runs in the existing `integration` Vitest project (`tests/integration/**/*.test.ts`), so the existing global setup guards `DATABASE_URL` to `flowline_test[_<suffix>]`, migrates and seeds; CI's integration shards pick the file up with no workflow change.
- The two transaction connections come from the existing `runConcurrentPg` (`tests/helpers/concurrentPgTx.ts`, integration `DATABASE_URL`); the setup/teardown connection comes from the existing `connect()` in `tests/integration/pg-lock-helpers.ts` (5 s connect timeout, 10 s statement timeout). No new env vars, secrets or settings.
- Scratch tables are unique per run (`scratch_cc1_<12 hex>`, `scratch_cc2_<12 hex>`) and dropped in `afterAll`; after the 20 runs `select count(*) from pg_tables where tablename like 'scratch_cc%'` returned `0`.

## Acceptance criteria
| AC | How verified | Result |
|---|---|---|
| Opposite-order pair is a deadlock (40P01) | `concurrent-tx-pg.test.ts` "reports an opposite-order lock pair as a deadlock (40P01)": each side locks its first table `FOR UPDATE`, meets at the barrier, then asks for the other's; asserts the rejection starts with `deadlock detected (40P01)` | Pass, ~1.17 s |
| Same-order pair passes | "lets a same-order lock pair finish": both lock T1 then T2; asserts `["a", "b"]` | Pass |
| No lock left behind | "leaves no scratch-table lock behind": `for update nowait` succeeds after both pairs | Pass |
| Under 10 s, deterministic | per-test timeout 10 s, adapter timeout 8 s; the barrier makes the lock cycle certain (no sleeps) | Pass |
| 20 local runs, no flakes | `for i in $(seq 1 20); do node scripts/with-env.mjs <env with flowline_test_i116> pnpm exec vitest run --project integration tests/integration/concurrent-tx-pg.test.ts; done` | **20/20 passed** (3/3 tests each; deadlock test 1160–1179 ms) |
| Existing adapter tests still pass | `concurrent-tx.test.ts` run together with the #116 file | 8/8 passed (2 files) |
| No production code / no `.github/` changes | the PR diff against `main` touches only `tests/integration/concurrent-tx-pg.test.ts`, `docs/DEVELOPER_GUIDE.md` and this file | Done |
| No test skipped or weakened | no existing test file changed | Done |
| Full existing suite green | run by the GitHub-hosted Gate on the PR (owner rule: no local full suite for FlowLine_Web) | CI |

E2E: not needed — test-only integration tests; no product code or user-facing flow changes.
