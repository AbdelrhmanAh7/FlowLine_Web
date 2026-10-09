# Evidence — issue #116: Postgres adapter and integration tests for `runConcurrent`

Tested commit: `8f83aa3` on branch `ai/116`. The branch merges `origin/ai/115` (the `runConcurrent` core, #115, not yet on `main`) and `origin/main`; once #115 merges, the PR diff against `main` is only #116's commit (+97 lines: adapter 45, tests 50, docs 2).
Run on 2026-10-10, macOS, Node 26.10.0, Vitest 5.0.2, local PostgreSQL 16.15 (CI uses 17), `deadlock_timeout` = 1s (server default, not changed), throwaway database `flowline_test_i116` (accepted by the integration global-setup guard).

## How the integration harness is reused
- Runs in the existing `integration` Vitest project (`tests/integration/**/*.test.ts`), so the existing global setup guards `DATABASE_URL` to `flowline_test[_<suffix>]`, migrates and seeds; CI's integration shards pick the file up with no workflow change.
- Connections come from the existing `connect()` in `tests/integration/pg-lock-helpers.ts` (same `DATABASE_URL`, 5 s connect timeout, 10 s statement timeout). No new env vars, secrets or settings.
- Scratch tables are unique per run (`scratch_cc1_<12 hex>`, `scratch_cc2_<12 hex>`) and dropped in `afterAll`; after the 20 runs `select count(*) from pg_tables where tablename like 'scratch_cc%'` returned `0`.

## Acceptance criteria
| AC | How verified | Result |
|---|---|---|
| Opposite-order pair is a deadlock (40P01) | `concurrent-tx-pg.test.ts` "reports an opposite-order lock pair as a deadlock (40P01)": each side locks its first table, meets at the barrier, then asks for the other's; asserts the rejection matches `deadlock detected (40P01)` | Pass, ~1.16 s |
| Same-order pair passes | "lets a same-order lock pair finish": both lock T1 then T2; asserts `["a", "b"]` | Pass, 9–21 ms |
| No lock left behind | "leaves no scratch-table lock behind": `for update nowait` succeeds after both pairs | Pass |
| Under 10 s, deterministic | per-test timeout 10 s, `runConcurrent` timeout 8 s; the barrier makes the lock cycle certain (no sleeps) | Pass |
| 20 local runs, no flakes | `for i in $(seq 1 20); do node scripts/with-env.mjs .env.test npx vitest run --project integration tests/integration/concurrent-tx-pg.test.ts; done` | **20/20 passed** (3/3 tests each; deadlock test 1158–1176 ms) |
| No production code / no `.github/` changes | commit `8f83aa3` touches only `tests/integration/`, `docs/DEVELOPER_GUIDE.md` and removes `AI_QUESTIONS.md` | Done |
| No test skipped or weakened | no existing test file changed | Done |
| Full existing suite green | run by the GitHub-hosted Gate on the PR (owner rule: no local full suite for FlowLine_Web) | CI |

Other local checks on `8f83aa3`: `eslint` on the three helper/test files clean; `tsc --noEmit` clean; unit `tests/unit/concurrentTx.test.ts` (from #115) 6/6 passed.

E2E: not needed — test-only adapter and integration tests; no product code or user-facing flow changes.
