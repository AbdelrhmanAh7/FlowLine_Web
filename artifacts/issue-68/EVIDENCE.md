# Evidence — issue #68 (restore, rollback and alerting runbook draft)

Tested commit: the PR head after the fresh-database fix (`git log -1 -- docs/runbooks/restore-rollback-alerts.md`; earlier `dc5866c`) (branch `ai/68`, on `origin/main`; runbook now 180 lines). Docs only; nothing was run
against a real environment. Test: `tests/unit/restore-rollback-alerts-runbook.test.ts` (`@issue-68`), 7/7 passed with
`vitest run --project unit` on that commit; it failed 6/6 on `ebc9937` before the runbook existed.

Review fixes (CodeRabbit T1/T2/T3): T1 restore step 8 uses `--single-transaction --exit-on-error` and says to stop, keep
`web`/`worker` down, restore the pre-restore dump and escalate on any error; T2 the newest-run check is now "close to the
dump time" because `pg_dump` snapshots after the filename timestamp; T4 (round 2) step 8 now drops and recreates the database before `pg_restore`, so objects absent from the dump cannot survive; T3 AC5 is renamed as the runbook's own 200-line budget.

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
| REQ-FL-68-9 one PR, about 300 lines | AC5 test (runbook ≤ 200 lines); `git diff --shortstat origin/main...HEAD` at `dc5866c`: 6 files, +312/−1 (about 300, including this file) |

Also run on that commit: `scripts/ci/docs-check.mjs` on the branch file list (passed: 1 code file, 4 docs), ESLint on the
test file (clean), `tsc --noEmit` (clean), and a relative-link check over the four changed docs (no broken links).
PP-02..PP-09 read-through: the PP items are not on main's OWNER_ACTIONS.md (they live on the unmerged
`codex/paid-pilot-round2-20261003` ledger), so the link sits next to the O04/O08 deployment rows and names PP-06/#30;
the runbook intro maps each PP item to the part it relates to.
