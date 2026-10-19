# PR #287 local CI repair — 2026-10-16

Tested code SHA: `df104a08` (merge parent: `b5765988`; main: `131235b9`).
No push or GitHub mutation performed. Remote CI on these local commits remains unverified.

## Root cause

`gh run view 38792754200 -R AbdelrhmanAh7/FlowLine_Web --log-failed` reports
1 failed, 1745 passed, 1 skipped in attempt 2. Its checks-static artifact's `unit.log`
identifies `tests/unit/demo-run-lock.test.ts > acquireLock() > lets only one of two
processes hold the lock`, failing at line 152 with `stale demo build lock … (its pid is gone)`.
The child announced ACQUIRED before installing SIGTERM cleanup: the parent could send
SIGTERM in that interval, leaving the file behind. Registering cleanup before readiness
closes that race. A finally block also guarantees shutdown on assertion failure.
Production stale-lock protection is unchanged. No retries, timeout increases or skips added.

## Merge and migrations

Merged origin/main into the current branch, without rebase. Only NEXT_ACTION.md conflicted;
both sides' entries are preserved. Main's journal ends at 0026, so 0027 is unique.
`pnpm db:generate` reports no schema changes. `DATABASE_URL=postgres://localhost:5432/flowline_test_pr287_migrations pnpm exec tsx src/db/migrate.ts`
applied all migrations to a newly created throwaway database on dev Postgres :5432.
SQL verification found 28 rows in drizzle.__drizzle_migrations and run.input type json.
No :5433 database used. The throwaway database remains available for inspection.

## Validation (Node 24)

| Command | Result |
| --- | --- |
| pnpm lint | exit 0, no diagnostics |
| pnpm typecheck | exit 0, no diagnostics |
| pnpm test | 131 files passed; 1759 passed, 0 failed, 1 skipped (1760 total) |
| pnpm test --reporter=verbose | same counts; identifies pre-existing conditional skip |
| pnpm test tests/unit/demo-run-lock.test.ts | 19 passed, 0 failed, 0 skipped; run on df104a08 |
| pnpm test:contract | 26 files; 534 passed, 0 failed, 0 skipped |
| git diff --check | pass |

The existing conditional skip is `demo-docs-commands.test.ts > docs/DEVELOPER_GUIDE.md >
has no <placeholder> in any code span (paths included), so every span can be pasted`.
Its runIf deliberately limits the assertion to DEMO_MEDIA.md. This repair leaves it unchanged;
the unit command exits 0, but this is not a claim of a zero-skip suite or a green remote gate.
Raw logs remain ignored under artifacts/gates/. No dependencies, secrets, permissions,
workflow tokens or product behavior changed. E2E: not needed — test-harness synchronization
and documentation only; existing PR product feature tests are preserved.
