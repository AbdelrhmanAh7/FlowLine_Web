# Evidence — issue #68 (restore, rollback and alerting runbook draft)

Tested commit `5236845` plus this file (the next commit adds only this file). Docs only; nothing ran against a real environment.
- `tests/unit/restore-rollback-alerts-runbook.test.ts` (`@issue-68`, 7 tests): AC1 four sections, ordered steps, all-or-nothing restore into a fresh DB, copy-pasteable commands, rollback check `git -C "$REPO_DIR"`; AC2 no secrets/hosts/LIVE, NileQuant PAPER only; AC3 OWNER_ACTIONS.md link next to PP-06 (#30), O04/O08 unchanged, runbook links resolve; AC4 docs check; AC5 whole change ≤ 300 lines.
- `vitest run --project unit` on this file: 7/7 passed with this file in place (6/7 at `5236845` alone: AC5 counted the old 31-line evidence, 320 lines).
- `git diff --shortstat origin/main...HEAD` with this file committed: 4 files changed, 298 insertions(+) (runbook 183, test 104, this file 9, OWNER_ACTIONS.md 2). The BETA_EXECUTION_STATUS/PRIVATE_BETA_RUNBOOK edits were dropped as out of scope.
- `checkDocs` on the four files: passed (1 code file, 2 docs outside `artifacts/`); ESLint and `tsc --noEmit` clean; relative-link check over the runbook and OWNER_ACTIONS.md: 0 broken.
- Review fixes kept: restore uses `dropdb`/`createdb` then `pg_restore --single-transaction --exit-on-error`, stops `backup` too, checks both dumps first; cutoff check allows minutes after the filename time.
- PP-02..PP-09 read-through: the PP items are not on main's OWNER_ACTIONS.md, so the link sits by the O04/O08 deployment rows and names PP-06/#30; the runbook intro maps each PP item.
