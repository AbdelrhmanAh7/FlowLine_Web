# Evidence — Issue #109: Fix lock order in consumeAccountToken to resolve deadlock

Part 2/2 of #47. Code under test: `src/server/email/flows.ts` (`consumeAccountToken`, the `delete`
branch). Every result below was observed on `6323281` (the test head of this branch) against a
throwaway `flowline_test` database (PostgreSQL 16, `FLOWLINE_ENV=test`, sandbox off) — the
same code the PR merges.

## Requirements and Verification

| Req ID | Description | Verification Method | Result | Commit |
|--------|-------------|---------------------|--------|--------|
| #109:1 | Change the lock order in `consumeAccountToken`: the audit row insert comes before the workspace `FOR UPDATE` lock | Source: `src/server/email/flows.ts:175-184` — membership read under the user lock, `audit_event` insert(s), then `SELECT … FROM workspace … FOR UPDATE` ordered by id; statement order pinned by `tests/unit/email-token-lock-order.test.ts` (`insert:audit_event` before `lock:workspace:update`) | 10/10 pass (mocked database) | `6323281` |
| #109:2 | The fix passes the deadlock test | `tests/integration/account-delete-sso-lock-order.test.ts` (the #108 test, copied verbatim from `origin/ai/108` at `2ef1fb8` so it is part of this PR): deletion vs the user's own SSO sign-in in flight, both orders, two real connections, waits observed through `pg_blocking_pids` | 2/2 pass on this head; without the fix (pre-#65 order) the SSO-first case is seen waiting at `delete from "user"` holding W and deadlocks on release (negative control recorded on `2ef1fb8`) | `6323281` |
| #109:3 | The fix passes `tests/integration/retained-file-locking.test.ts:122` | `tests/integration/retained-file-locking.test.ts` ("account deletion locks W, admission waits at accounting, then both commit without a deadlock") plus its three sibling tests on the same file | 4/4 pass | `6323281` |
| #109:4 | Two co-members of one shared workspace deleting at once cannot deadlock (the reorder's key-share → `FOR UPDATE` upgrade) | Positive: `retained-file-locking.test.ts` "two co-members of one workspace confirm deletion at once" — the second deletion is observed waiting at `pg_advisory_xact_lock` (via `pg_blocking_pids`) while the first holds the key-share, then both finish. Negative control: `tests/integration/account-delete-key-share-upgrade.test.ts` — with only the accounting lock removed (test-only mock), the same two deletions each pause after their audit insert and, released together, one aborts with `40P01` at the workspace `FOR UPDATE` while holding its key-share | Positive 1/1 (both finish, both audit rows survive); negative control 1/1, stable across three consecutive runs — proves the accounting lock is load-bearing | `6323281` |
| #109:5 | Person-visible behaviour of account deletion is unchanged | `tests/integration/email.test.ts` (rollback on `transfer_required`, exactly one `account.deleted` record after the deletion) and the e2e-army request test `e2e-army/109-account-delete-shared-audit.e2e.ts` (runs in the hub verify job, not locally) | 9/9 pass locally; e2e-army runs in CI | `6323281` |

## Test Execution Evidence

```
$ node scripts/with-env.mjs .env.test npx vitest run --project integration \
    tests/integration/retained-file-locking.test.ts \
    tests/integration/account-delete-sso-lock-order.test.ts \
    tests/integration/email.test.ts
  Test Files  3 passed (3)
        Tests  15 passed (15)

$ node scripts/with-env.mjs .env.test npx vitest run --project integration \
    tests/integration/account-delete-key-share-upgrade.test.ts
  Test Files  1 passed (1)          # also passed on two further consecutive runs
        Tests  1 passed (1)

$ npx vitest run --project unit tests/unit/email-token-lock-order.test.ts
  Test Files  1 passed (1)
        Tests  10 passed (10)
```

- Typecheck: `npx tsc --noEmit` exit 0. Lint: `npx eslint src/server/email/flows.ts` plus every touched test, helper and e2e-army file — no findings (re-run on the final head).
- The final commit changes only comments in `flows.ts` and the header of `account-delete-key-share-upgrade.test.ts` plus docs; after it, eslint (all eight touched files), `tsc --noEmit` and `email-token-lock-order.test.ts` (10/10) were re-run. The database-backed results above were observed on `6323281` and are not re-claimed for the later head.
- Full suite, build and browser runs are delegated to hosted CI (per the task brief); no full gate or Playwright run is claimed here.
- The `#108` test file and the `pg-lock-helpers.ts` `routeTransactions` helper are byte-identical to `origin/ai/108` (`2ef1fb8`), so PR #214 and this PR merge cleanly in either order.
