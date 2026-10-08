# Evidence — issue #47: account deletion vs the user's own SSO audit insert (lock order)

Tested commit: `49cf14f51873267df202001e24e696403a562136` (fix), tests first committed alone in `bd28eb5`.
Requirement ids come from the Notion PRD (Approval = Draft).

## Change

`consumeAccountToken("delete")` (`src/server/email/flows.ts`) now locks the signed-in user's row `FOR UPDATE` right after
the retained-file accounting locks, before the token row and every workspace `FOR UPDATE` lock. It used to hold the
workspaces and reach the user row only at the final `DELETE`, while the user's own SSO sign-in holds the user row and
inserts its `sso.signin` audit row last (a key-share lock on the workspace): a lock cycle, aborted by PostgreSQL with
`40P01`. Workspace locks stay `FOR UPDATE` (sole-member workspaces are deleted). Rule documented in
`docs/security/FEDERATED_MFA.md` ("Lock order").

## Requirements

| Id | Status | How it is verified |
|---|---|---|
| REQ-FL-47-3 / AC-FL-47-3 (no inconsistency with concurrent SSO) | Implemented | `tests/integration/account-deletion-lock-order.test.ts` (`@issue-47 AC1`, `AC2`): real `consumeAccountToken("delete")` and real `completeSso` on two PostgreSQL connections, both interleavings; the second waits at the user row (`pg_blocking_pids`), both finish without `40P01`; user, sessions and sole workspace deleted, shared workspace kept with exactly one `account.deleted` record (plus `sso.signin` when the sign-in committed first; otherwise the sign-in is refused with `SSO_LINK_INVALID`). **Written for CI, not executed locally** (PostgreSQL cannot start in this sandbox: `shmget` is denied). |
| NFR-FL-47-1 (no new races) | Implemented | `tests/unit/account-deletion-lock-order.test.ts` (`@issue-47 AC3`) pins the full statement order: accounting advisory + counter row, user `FOR UPDATE`, token, workspace `FOR UPDATE`, audit insert, workspace delete, token consume, user delete. `@issue-47 AC4`: another account's token and a missing signed-in user are refused before any workspace lock. Existing `retained-file-locking.test.ts` still pauses after the workspace lock (pattern unchanged). |
| NFR-FL-47-2 (audit insert atomic and durable) | Unchanged | Audit rows are still written in the same transaction as the deletion. |
| REQ-FL-47-1, REQ-FL-47-2 / AC-FL-47-1, AC-FL-47-2 ("insert audit rows before locking the workspace") | **Not implemented as written** | The draft PRD's ordering would not break the cycle: the cycle is the workspace `FOR UPDATE` lock held while waiting for the user row, and an audit insert before the lock would itself take a key-share lock on the workspace and need the member reads that the lock makes consistent. The issue body asks for "a different ordering"; the user-row-first order is the one documented for every transaction in this area. The PRD should be corrected before approval. |
| NFR-FL-47-3 (throughput) | Not measured | One extra primary-key row lock on the user's own row; no throughput measurement is claimed. |

## Local runs on `49cf14f`

- `node node_modules/vitest/vitest.mjs run --project unit tests/unit/account-deletion-lock-order.test.ts tests/unit/federated-lock-order.test.ts`: 2 files, 8 tests passed.
- Same new unit test against the previous `flows.ts` (from `bd28eb5`): 3 failed, 1 passed (the other-account guard already held).
- Full unit project: 1246 passed, 4 skipped, 1 failed plus one failed file: `tests/unit/egress.test.ts` and `tests/unit/codex-poc-egress-redirect.test.ts` need local port binding, which this sandbox blocks (`listen` hook timeout); egress code is untouched.
- `eslint` on the changed files and `tsc --noEmit`: clean.
- Integration tests (`pnpm test:integration`): not run locally; CI `gate` runs them.
