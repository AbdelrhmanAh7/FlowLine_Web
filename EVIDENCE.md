# Evidence — issue #47: account deletion vs the user's own SSO audit insert (lock order)

Tested commit: `cee11a918a6e9f2497b92411017fe159c675c622` (fix, round 2). Tests were committed first and alone each round:
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
| REQ-FL-47-3 / AC-FL-47-3 (no inconsistency with concurrent SSO) | Implemented | `tests/integration/account-deletion-lock-order.test.ts` (`@issue-47 AC1`, `AC2`): real `consumeAccountToken("delete")` and real `completeSso` on two PostgreSQL connections, both interleavings. The second waits at the user row (`pg_blocking_pids`), and both finish without `40P01`. The user, their sessions and their sole workspace are deleted. The shared workspace is kept with exactly one `account.deleted` record, plus `sso.signin` when the sign-in committed first; otherwise the sign-in is refused with `SSO_LINK_INVALID`. **Written for CI, not executed locally** (PostgreSQL cannot start in this sandbox: `shmget` is denied). |
| NFR-FL-47-1 (no new races) | Implemented | `tests/unit/account-deletion-lock-order.test.ts` (`@issue-47 AC3`) pins the full statement order: accounting advisory lock and counter row, then user `FOR NO KEY UPDATE`, token, workspace `FOR UPDATE`, audit insert, workspace delete, token consume, user delete. `AC5` pins the user-row mode. `@issue-47 AC4`: another account's token and a missing signed-in user are refused before any workspace lock. Integration `@issue-47 AC5`, `AC6`: the real deletion against the same user's real `enqueueRun` in a shared workspace, both interleavings. Neither deadlocks, the run never waits for the deletion's user-row lock, and the run survives with `created_by` null. **Written for CI, not executed locally.** `retained-file-locking.test.ts` still pauses after the workspace lock (pattern unchanged). |
| NFR-FL-47-2 (audit insert atomic and durable) | Unchanged | Audit rows are still written in the same transaction as the deletion. |
| REQ-FL-47-1, REQ-FL-47-2 / AC-FL-47-1, AC-FL-47-2 ("insert audit rows before locking the workspace") | **Not implemented as written** | The draft PRD's ordering would not break the cycle. The cycle is the workspace `FOR UPDATE` lock held while waiting for the user row. An audit insert before the lock would itself take a key-share lock on the workspace, and it needs the member reads that the lock makes consistent. The issue body asks for "a different ordering", and user-row-first is the order documented for every transaction in this area. The PRD should be corrected before approval (the council asked Product for a ticket). |
| NFR-FL-47-3 (throughput) | Not measured | One extra primary-key row lock on the user's own row. No throughput measurement is claimed. |

## Local runs on `cee11a9`

- `node node_modules/vitest/vitest.mjs run --project unit tests/unit/account-deletion-lock-order.test.ts tests/unit/federated-lock-order.test.ts`: 2 files, 9 tests passed.
- New unit test against the round-1 `flows.ts` (`FOR UPDATE`, at `bc2c250`): 3 failed, 2 passed.
- Full unit project: 1247 passed, 4 skipped, 1 failed, and 2 files failed: `tests/unit/egress.test.ts` and `tests/unit/codex-poc-egress-redirect.test.ts` need local port binding, which this sandbox blocks. The egress code is untouched.
- `tsc --noEmit` and `eslint` on the changed files: clean.
- Integration tests (`pnpm test:integration`): not run locally. The CI `gate` runs them; the council requires its logs to show AC1, AC2, AC5 and AC6 ran and passed.

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
