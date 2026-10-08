# Evidence — issue #47: account deletion vs the user's own SSO audit insert (lock order)

Tested commit: `f12f9f8f027c61538c27b98492a74831603a5d06` (round 5: merge of `origin/main` `9225fe9` and a test-helper fix; production code unchanged since `cee11a918a6e9f2497b92411017fe159c675c622`, round 2). Tests were committed first and alone each round:
`bd28eb5` (AC1–AC4), then `bc2c2503a2a5a1e724170c45e1f02a4e697f029a` (AC5, AC6).
Requirement ids come from the Notion PRD (Approval = Draft).

## Change

`consumeAccountToken("delete")` (`src/server/email/flows.ts`) now locks the signed-in user's row `FOR NO KEY UPDATE` right
after the retained-file accounting locks, before the token row and every workspace `FOR UPDATE` lock. It used to hold the
workspaces and reach the user row only at the final `DELETE`, while the user's own SSO sign-in holds the user row and
inserts its `sso.signin` audit row last (a key-share lock on the workspace): a lock cycle, aborted by PostgreSQL with
`40P01`. Workspace locks stay `FOR UPDATE` (sole-member workspaces are deleted). Rule documented in
`docs/security/FEDERATED_MFA.md` ("Lock order").

Round 2 (AI council condition on PR #71: "no other flow locks a workspace before a user row"): round 1 took the user row
`FOR UPDATE`. That conflicted with the key-share lock that `enqueueRun` and `startAgentRun` take on the user row (their
`created_by` inserts) while they hold the workspace `FOR UPDATE`, which made a new deadlock with the same user's run
enqueue. `FOR NO KEY UPDATE` still excludes the SSO paths' `FOR SHARE` / `FOR UPDATE`, but not key-share.

Audit of every transaction that locks a `workspace` row `FOR UPDATE` (`grep -rnE 'for\("update"\)' src worker`):

| Transaction | User-row access after the workspace lock | Conflicts with `FOR NO KEY UPDATE`? |
|---|---|---|
| `enqueueRun` (`src/server/runs.ts`) | key-share via `run.created_by`, `flow_version.created_by` inserts | No |
| `startAgentRun` (`src/server/agents.ts`) | key-share via `agent_conversation.created_by` insert | No |
| `changeRole`, `removeMember` (`src/server/members.ts`) | none (audit row references the workspace only) | — |
| `reserveUsage` (`src/server/usage.ts`) | none | — |
| `consumeAccountToken("delete")` | user row taken before the workspaces | — |

Known gap that predates this change and is not fixed here: `enqueueRun` locks the `flow` row before the workspace row,
while deletion reaches flow rows after the workspace (the sole-workspace cascade, or `created_by` set to null). It is recorded in
`docs/security/FEDERATED_MFA.md`.

## Requirements

| Id | Status | How it is verified |
|---|---|---|
| REQ-FL-47-3 / AC-FL-47-3 (no inconsistency with concurrent SSO) | Implemented | `tests/integration/account-deletion-lock-order.test.ts` (`@issue-47 AC1`, `AC2`): real `consumeAccountToken("delete")` and real `completeSso` on two PostgreSQL connections, both interleavings. The second waits at the user row (`pg_blocking_pids`), and both finish without `40P01`. The user, their sessions and their sole workspace are deleted. The shared workspace is kept with exactly one `account.deleted` record, plus `sso.signin` when the sign-in committed first; otherwise the sign-in is refused with `SSO_LINK_INVALID`. Run locally on `abc8c6a` (see round 4). |
| NFR-FL-47-1 (no new races) | Implemented | `tests/unit/account-deletion-lock-order.test.ts` (`@issue-47 AC3`) pins the full statement order: accounting advisory lock and counter row, then user `FOR NO KEY UPDATE`, token, workspace `FOR UPDATE`, audit insert, workspace delete, token consume, user delete. `AC5` pins the user-row mode. `@issue-47 AC4`: another account's token and a missing signed-in user are refused before any workspace lock. Integration `@issue-47 AC5`, `AC6`: the real deletion against the same user's real `enqueueRun` in a shared workspace, both interleavings. The user re-runs the owner's run at its original revision. Neither deadlocks, the run never waits for the deletion's user-row lock, and the re-run survives with `created_by` null. Run locally on `abc8c6a`. `retained-file-locking.test.ts` still pauses after the workspace lock (pattern unchanged). |
| NFR-FL-47-2 (audit insert atomic and durable) | Unchanged | Audit rows are still written in the same transaction as the deletion. |
| REQ-FL-47-1, REQ-FL-47-2 / AC-FL-47-1, AC-FL-47-2 ("insert audit rows before locking the workspace") | **Not implemented as written** | The draft PRD's ordering would not break the cycle. The cycle is the workspace `FOR UPDATE` lock held while waiting for the user row. An audit insert before the lock would itself take a key-share lock on the workspace, and it needs the member reads that the lock makes consistent. The issue body asks for "a different ordering", and user-row-first is the order documented for every transaction in this area. The PRD should be corrected before approval (the council asked Product for a ticket). |
| NFR-FL-47-3 (throughput) | Not measured | One extra primary-key row lock on the user's own row. No throughput measurement is claimed. |

## Local runs on `cee11a9`

- `node node_modules/vitest/vitest.mjs run --project unit tests/unit/account-deletion-lock-order.test.ts tests/unit/federated-lock-order.test.ts`: 2 files, 9 tests passed.
- New unit test against the round-1 `flows.ts` (`FOR UPDATE`, at `bc2c250`): 3 failed, 2 passed.
- Full unit project: 1247 passed, 4 skipped, 1 failed, and 2 files failed: `tests/unit/egress.test.ts` and `tests/unit/codex-poc-egress-redirect.test.ts` need local port binding, which this sandbox blocks. The egress code is untouched.
- `tsc --noEmit` and `eslint` on the changed files: clean.
- Integration tests: not run locally in rounds 1–3 (superseded by round 4).

## Round 3: quality-review finding (documentation only)

- Finding: the `**Account deletion (issue #47).**` paragraph in `docs/security/FEDERATED_MFA.md` "ends abruptly with
  ...waited for a completed deletion fi".
- Root cause: the committed file was complete (`git show 78a0561:docs/security/FEDERATED_MFA.md` has the full paragraph,
  ending "...deleted with the account."). The paragraph was one 1,113-character line, and the review's diff view cut it
  at about 966 characters, which is exactly where "deletion fi" ends.
- Fix: the long lines this PR added in `docs/security/FEDERATED_MFA.md`, `docs/implementation/PHASE4_BETA_REPORT.md`
  and `docs/DEVELOPER_GUIDE.md` are broken at sentence boundaries (Markdown soft breaks, so the rendered text is the same).
  `git diff --word-diff` shows no word changes, and no line this PR adds to a `.md` file is longer than 900 characters.
- No code or test changed in this round, so the local runs on `cee11a9` above still describe the code under review.

## Round 4: CI failure on `b1c04f5` (integration shard 1/3)

- Symptom: `@issue-47 AC5` and `AC6` failed: the deletion was rejected with `23514` "flow_version rows are immutable"
  at `delete from "user"`, not with a deadlock.
- Root cause: in the old fixture the user's manual run pinned a `flow_version` the user authored in the shared workspace.
  Deleting the user sets `flow_version.created_by` to null (`ON DELETE SET NULL`), which the `flow_version_immutable`
  trigger refuses. It needs no competing transaction, so it is a pre-existing defect on `main`, separate from the lock
  order; fixing it needs a migration (with its drizzle snapshot), beyond this PR's size and scope. It is recorded as a
  known gap in `docs/implementation/PRIVACY_AND_SAFETY.md` §4. **A follow-up issue is needed.**
- Fix (`abc8c6a`, test only): the owner runs the flow once and the user re-runs that run at its original revision.
  The locks are the same as before (flow and workspace `FOR UPDATE`, then a `run` row whose `created_by` key-share-locks
  the user), but the user authors no version. The test asserts that the re-run pinned the owner's version.
- Local runs on `abc8c6a`, against a throwaway PostgreSQL 16.15 cluster (Homebrew, own port, removed afterwards):
  - `tests/integration/account-deletion-lock-order.test.ts`: 4 of 4 passed, 3 runs in a row.
  - Mutation checks: with the user row taken `FOR UPDATE`, AC5 and AC6 fail with `40P01`. With `origin/main`'s
    `src/server/email/flows.ts`, AC1, AC2 and AC6 fail.
  - Full integration project, via `suite.sh`, excluding the two Docker-only files CI also excludes
    (`p2-code-sandbox`, `company-builder-cli`): 58 files, 585 tests passed.
  - `tests/unit/account-deletion-lock-order.test.ts`: 5 of 5 passed. `tsc --noEmit` is clean, and `eslint` is clean on the
    changed test.
  - One first run on the fresh cluster, before the fixture change, failed AC1. Deletion was observed waiting at the
    retained-file counter row instead of the user row. It did not recur in 8 later runs of AC1 (one on a re-created
    database), and CI passed AC1 on `b1c04f5`. It is noted, not explained.


## Round 5: merge conflict with `main`, and the unexplained AC1 failure

- Merge (`b8ad3fa`): `origin/main` at `9225fe9` (issue #66) conflicted in `docs/implementation/PHASE4_BETA_REPORT.md`.
  Main's line is kept byte for byte, and the #47 lines follow it. `docs/security/FEDERATED_MFA.md` merged on its own;
  its #47 paragraphs are complete. Main changed no `src/` file.
- Symptom: the first run after the merge, on a fresh PostgreSQL 16.15 cluster, failed `@issue-47 AC1` once in 46 ms.
  The next runs passed. This is the same first-run failure round 4 recorded and could not explain.
- Root cause (test helper, not the lock order): `blockedByObserver` (`tests/integration/pg-lock-helpers.ts`) reads
  `pg_stat_activity.query` from the backend-status snapshot taken when its probe starts. It reads `wait_event_type` and
  `pg_blocking_pids()` live. A probe racing the deletion's first statements can pair the retained-file counter select
  that deletion has just finished with the user-row wait that comes next. Shown on three connections: inside one
  snapshot the waiter reports its earlier statement with `wait_event_type` `Lock` and the holder as its blocker, and
  after `pg_stat_clear_snapshot()` it reports the blocked statement.
- Fix (`f12f9f8`, test only): once the wait is seen, the helper probes again on a fresh snapshot and returns that
  reading. The waiter cannot move while the holder is paused. `tests/integration/retained-file-locking.test.ts` keeps
  its own copy of the old helper (code on `main`, outside this PR); it has the same race and needs a follow-up.
- Local runs on `f12f9f8`, against a throwaway PostgreSQL 16.15 cluster (Homebrew, own port, removed afterwards):
  - `account-deletion-lock-order`, `federated-lock-order` and `retained-file-locking` integration files: 9 of 9 passed,
    5 runs, each on a re-created database.
  - Mutation check: with `origin/main`'s `src/server/email/flows.ts`, AC1, AC2 and AC6 fail, and AC5 passes (as in round 4).
  - Full integration project via `suite.sh`, excluding `p2-code-sandbox` and `company-builder-cli` (Docker only):
    59 files, 594 tests passed.
  - Full unit project via `suite.sh`: 98 files, 1252 tests passed. `tsc --noEmit` is clean, and `eslint` is clean on the changed files.

## E2E (e2e-army)

No `e2e-army/47-*.e2e.ts` test. The change is internal: the order of row locks inside the account-deletion
transaction. The deletion screen, its messages and its result are unchanged. The defect appears only when two transactions
of the same user overlap at one statement boundary, and a browser cannot pause a transaction there. The two-connection
integration tests above do pause it, and are the right level for this change.
