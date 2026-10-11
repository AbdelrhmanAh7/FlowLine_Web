# Evidence — issue #68 (restore, rollback and alerting runbook draft)

Tested commit: `a6b6d89` (branch `ai/68`; later commits change only this evidence file). Runbook: 195 lines.
Docs only; nothing was run against a real environment. Test: `tests/unit/restore-rollback-alerts-runbook.test.ts`
(`@issue-68`), 10/10 passed with `vitest run --project unit` on `a6b6d89`; it failed before the runbook existed.
`git diff --shortstat $(git merge-base HEAD origin/main)` at `a6b6d89`: 6 files, +382/-1 (runbook 195 + test 155 + this file + OWNER_ACTIONS link + docs ledger). This is
above the ~300 target because of the test and the evidence; the runbook itself stays within its 200-line budget (AC5).
Copy-paste fix (round 2): every command uses shell variables (`$DUMP_FILE`, `$UTC`, `$PREV_SHA`, `$CURRENT_SHA`, `$BASE_URL`),
`DUMP_FILE` is a bare file name, and the AC1 test "commands are copy-pasteable shell" fails on any `<placeholder>` inside a command.

Review fixes (CodeRabbit T1/T2/T3): T1 restore step 8 uses `--single-transaction --exit-on-error` and says to stop, keep
`web`/`worker` down, restore the pre-restore dump and escalate on any error; T2 the newest-run check is now "close to the
dump time" because `pg_dump` snapshots after the filename timestamp; T4 (round 2) step 8 now drops and recreates the database before `pg_restore`, so objects absent from the dump cannot survive; T3 AC5 is renamed as the runbook's own 200-line budget; T5 (round 3) rollback step 3 runs `git -C "$REPO_DIR" diff ... -- drizzle/` so the pathspec is anchored at the repo root (test "rollback migration check is anchored").

| REQ | Verified by |
|---|---|
| REQ-FL-68-1 four sections | AC1 test (section lookup by `##` heading) |
| REQ-FL-68-2 backed-up items, ordered restore steps, verification SQL | AC1 test (steps 1..n, `sql` block, `__drizzle_migrations`); SQL table/column names read from `src/db/schema.ts` |
| REQ-FL-68-3 rollback steps and criteria | AC1 test (steps 1..n, "criteria", "roll forward") |
| REQ-FL-68-4 alerts with threshold and `<owner>` | AC1 test (error rate, auth failures, job failures, backup age rows); built thresholds copied from `src/server/ops.ts` |
| REQ-FL-68-5 owner decisions with defaults | AC1 test (`Default:` on every item) |
| REQ-FL-68-6 no secrets/hosts/identifiers/LIVE content | AC2 test (key, token, webhook, DB-password, IP, URL, domain, e-mail, LIVE patterns) |
| REQ-FL-68-7 NileQuant PAPER only | AC2 test |
| REQ-FL-68-8 OWNER_ACTIONS.md link, no state change | AC3 tests (link line names PP-06 and #30; O04/O08 rows unchanged; all runbook links resolve) |
| REQ-FL-68-9 one PR, about 300 lines | AC5 test (runbook ≤ 200 lines); shortstat above (+382/-1, 6 files): over the ~300 target because of the test and this file; the runbook itself is 195 lines |

Also run on that commit: `scripts/ci/docs-check.mjs` on the branch file list (passed: 1 code file, 5 docs incl. this file), ESLint on the
test file (clean), `tsc --noEmit` (clean), and a relative-link check over the four changed docs (no broken links).
PP-02..PP-09 read-through: the PP items are not on main's OWNER_ACTIONS.md (they live on the unmerged
`codex/paid-pilot-round2-20261003` ledger), so the link sits next to the O04/O08 deployment rows and names PP-06/#30;
the runbook intro maps each PP item to the part it relates to.
