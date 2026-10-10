# Evidence for #90

Not user-facing (test-only helper under `tests/`, no production code), so no e2e-army test.

Tested commit: `186f800331fbff4ff7d9a913aa763099cec3873f` (merge of `origin/main` @ `e288244` into `ai/90`).
Environment: macOS, Node v26.10.0, a throwaway local PostgreSQL 16 cluster, database `flowline_test`, connected as a
non-superuser role (so `pg_terminate_backend` on the role's own backends is proven without superuser), default
`deadlock_timeout` (1 s).

| Acceptance criterion | Verified by | Result on the tested commit |
|---|---|---|
| Helper exported + header usage example | `runConcurrentPg` in `tests/helpers/concurrentPgTx.ts` (header comment), built on the DB-free `runConcurrent` core from #115 in `tests/helpers/concurrentTx.ts` | `pnpm typecheck` and `eslint` on both new files: no errors |
| Opposite-order pair detected as a deadlock | `tests/integration/concurrent-tx.test.ts` "detects an opposite-order pair as a deadlock (40P01)" | passed |
| Same-order pair passes | same file, "passes a same-order pair on two connections and returns both results" (also asserts two distinct backend pids) | passed |
| Deterministic, under 10 s, no sleeps | the file has no sleeps; the only waits are the barrier, Postgres' `deadlock_timeout` and a 500 ms `timeoutMs` in the timeout case | 20 consecutive runs: 20/20 green, 5/5 tests each, 1.83-1.85 s per run; 0 backends of the test role left afterwards (`pg_stat_activity`) |
| No `.github/` or workflow files changed | `git diff origin/main --stat` | only `artifacts/issue-90/EVIDENCE.md`, `docs/DEVELOPER_GUIDE.md`, `tests/helpers/concurrentPgTx.ts`, `tests/integration/concurrent-tx.test.ts` |

Commands (`DATABASE_URL=postgres://<role>@127.0.0.1:<port>/flowline_test`):

- `FLOWLINE_ENV=test pnpm exec vitest run --project integration tests/integration/concurrent-tx.test.ts`: real
  integration project (global setup migrated and seeded the DB), 1 file, 5 passed, 3.44 s.
- 20-run loop: the same file through a temporary config with only that include (no global setup), 20 x "5 passed".
- `pnpm exec vitest run --project unit tests/unit/concurrentTx.test.ts` (main's DB-free core, unchanged): 6 passed.

Not run locally (CI runs it): the full unit/integration suites and the build (owner rule 2026-10-08 for FlowLine_Web).
