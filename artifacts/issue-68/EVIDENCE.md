# Evidence — issue #68 (restore, rollback and alerting runbook draft)

Tested commit: `7abc549ba1d4f18feb032103d345c9923ef9abc5` (branch `ai/68`, on `origin/main`). Docs only; nothing was run
against a real environment. Test: `tests/unit/restore-rollback-alerts-runbook.test.ts` (`@issue-68`), 6/6 passed with
`vitest run --project unit` on that commit; it failed 6/6 on `ebc9937` before the runbook existed.

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
| REQ-FL-68-9 one PR, about 300 lines | AC5 test (runbook ≤ 200 lines); `git diff --shortstat origin/main...HEAD`: 5 files, +289/−1 before this file |

Also run on that commit: `scripts/ci/docs-check.mjs` on the branch file list (passed: 1 code file, 4 docs), ESLint on the
test file (clean), `tsc --noEmit` (clean), and a relative-link check over the four changed docs (no broken links).
PP-02..PP-09 read-through: the PP items are not on main's OWNER_ACTIONS.md (they live on the unmerged
`codex/paid-pilot-round2-20261003` ledger), so the link sits next to the O04/O08 deployment rows and names PP-06/#30;
the runbook intro maps each PP item to the part it relates to.
