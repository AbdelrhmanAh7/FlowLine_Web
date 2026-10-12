# Lock order

Two transactions that lock the same rows in opposite orders can deadlock, and PostgreSQL then aborts one of them (SQLSTATE `40P01`). Issue #37 was such a deadlock between `confirmSsoLink` and `completeFederatedChallenge`; its fix is `lockUserThenSessions` in `src/server/federated-locks.ts`.

This page lists the seven lockable entities that the account, membership and SSO transactions share, ranked in the order a transaction takes them. The federated authority paths follow the more detailed rule in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order), pinned by `tests/unit/federated-lock-order.test.ts`; this page does not replace it. Rows that mention a known gap describe existing code that does not follow the order yet.

## Entities and global order

A transaction takes lower ranks first and never goes back to a lower rank.

| Rank | Entity | Table | Locked in | Notes |
|---|---|---|---|---|
| 1 | Email token | `email_token` | `src/server/email/flows.ts` (`consumeAccountToken`, `FOR UPDATE`) | Known gap: since #45 (PR #65) `consumeAccountToken` locks the user row (rank 3) `FOR UPDATE` before this row and before the workspaces ([example](#email-token-vs-user-delete-45)). For `delete`, the retained-file accounting lock in `src/server/retained-files.ts` comes first. |
| 2 | Workspace | `workspace` | `src/server/members.ts` (`changeRole`, `removeMember`, `FOR UPDATE`); `src/server/email/flows.ts` (`delete`: every workspace of the user, ordered by id) | Known gap: the `audit_event` insert (rank 7) takes a key-share lock on its `workspace` row (rank 2), violating the order stated on this page. |
| 3 | User | `user` | `src/server/federated-locks.ts` (`lockUserThenSessions`); `src/server/sso.ts` callbacks (`FOR SHARE`); `src/server/email/flows.ts` (`consumeAccountToken`, `FOR UPDATE`, see rank 1) | `consumeAccountToken("delete")` deletes it after the workspace locks. |
| 4 | Session | `session` | `src/server/federated-locks.ts`; `src/server/sso.ts` | The transaction's own or unissued session first, then the bound (initiating) session. |
| 5 | Account | `account` | `src/server/federated-mfa.ts`, `src/server/sso-link.ts` (`FOR SHARE`) | Known gap: `consumeAccountToken("reset")` writes account, then session, then user ([FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order)). The `src/server/sso.ts` callbacks share-lock the provider link row (account) after the member row, violating the order stated on this page. |
| 6 | Member | `workspace_member` | `src/server/sso-link.ts`, `src/server/sso.ts` (`FOR UPDATE` or `FOR SHARE`); `src/server/federated-mfa.ts` (`FOR SHARE`) | Taken after `sso_config` in the SSO paths. |
| 7 | SSO audit | `audit_event` | `src/server/audit.ts` (`audit()` insert), called last by `src/server/sso-link.ts`, `src/server/federated-mfa.ts` and `src/server/sso.ts` | The insert key-share locks its `workspace` row (rank 2). Known gap: this can deadlock with `changeRole`/`removeMember` on the same member ([FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order)). |

## Review checklist for a new transaction

- [ ] List every row it locks: explicit `.for("update")`/`.for("share")`, rows changed by `UPDATE`/`DELETE`, and rows an `INSERT` references through a foreign key (`audit_event.workspace_id` → `workspace` in `src/db/schema.ts`).
- [ ] Take them in rank order and never return to a lower rank. A new deviation is a bug unless it is added to the table as a known gap with its own issue.
- [ ] Lock several rows of one table in a deterministic order (`orderBy` id), as `consumeAccountToken("delete")` does for workspaces.
- [ ] Use `FOR UPDATE` only for rows the transaction writes; read-only fences use `FOR SHARE`, as the `src/server/sso.ts` callbacks do.
- [ ] Federated authority rows (user, sessions, factor, accounts, tenant authority) follow [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order) and take the user and sessions through `lockUserThenSessions`.
- [ ] Pin the statement order in a test (pattern: `tests/unit/federated-lock-order.test.ts`); a new pair of conflicting paths also gets a two-connection test (pattern: `tests/integration/federated-lock-order.test.ts`).
- [ ] Update this table, and FEDERATED_MFA.md for federated paths, in the same PR as the change.

## Worked examples

### Email token vs user delete ([#45](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/45))

- **Hazard:** `email_token.user_id` is `ON DELETE SET NULL` (`src/db/schema.ts`), so deleting a user updates every token row of that user after the user row is locked. When `consumeAccountToken` locked its own token row first, a password reset and a delete confirmation of one user could deadlock, and two resets with different tokens each held their own token while queueing at the user row.
- **Rule:** lock the user row `FOR UPDATE`, then the token row `FOR UPDATE`, then (`delete`) the user's workspaces ordered by id; `delete` takes the retained-file accounting lock (`lockRetainedFileAccounting`, `src/server/retained-files.ts`) before all of them. Code that writes `email_token` rows of an existing user locks the user first. This takes rank 3 before ranks 1 and 2, so the table lists it as a known gap; the detailed rule is in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#email-token-lock-order).
- **Code:** `consumeAccountToken` in `src/server/email/flows.ts` (fixed by PR #65), pinned by `tests/unit/email-token-lock-order.test.ts` and `tests/integration/email-token-lock-order.test.ts`.

### Workspace `FOR UPDATE` vs SSO audit insert ([#47](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/47))

- **Hazard:** `consumeAccountToken("delete")` locks every workspace of the user `FOR UPDATE` and later deletes the user. The SSO callback transactions in `completeSso` (`src/server/sso.ts`) share-lock the user first and call `audit()` (`src/server/audit.ts`) last; its `audit_event` insert key-share locks the same `workspace` row. A deletion that held workspace W before taking the user row (the order of ranks 2 then 3) could wait for the user while the SSO transaction held the user `FOR SHARE` and waited for W, the same cycle as #42.
- **Rule:** a transaction that locks a user's workspaces `FOR UPDATE` takes that user's row first and never waits for it while holding W. Deletion keeps `FOR UPDATE` on the workspaces because sole-member workspaces are deleted with the account (`tests/integration/retained-file-locking.test.ts`).
- **Code:** since PR #65, `consumeAccountToken` in `src/server/email/flows.ts` locks the user row before the workspaces, so this pair no longer forms the cycle. `tests/integration/account-delete-sso-lock-order.test.ts` (#108) runs the real deletion and the real `completeSso` sign-in for one user on two connections, in both orders: the second waits at the user row and both settle without `40P01` (SSO first: both commit; deletion first: the sign-in is refused `SSO_LINK_INVALID`). Against the pre-#65 `flows.ts` it fails in both orders, and the SSO-first case ends in `deadlock detected` (`40P01`) once released (local runs, 2026-10-12). #109 (move the audit insert before the workspace lock) needs re-checking against this order.
