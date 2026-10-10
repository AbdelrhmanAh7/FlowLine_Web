# Lock order

Two transactions that lock the same rows in opposite orders can deadlock, and PostgreSQL then aborts one of them (SQLSTATE `40P01`). Issue #37 was such a deadlock between `confirmSsoLink` and `completeFederatedChallenge`; its fix is `lockUserThenSessions` in `src/server/federated-locks.ts`.

This page lists the seven lockable entities that the account, membership and SSO transactions share, ranked in the order a transaction takes them. The federated authority paths follow the more detailed rule in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order), pinned by `tests/unit/federated-lock-order.test.ts`; this page does not replace it. Rows that mention a known gap describe existing code that does not follow the order yet.

## Entities and global order

A transaction takes lower ranks first and never goes back to a lower rank.

| Rank | Entity | Table | Locked in | Notes |
|---|---|---|---|---|
| 1 | Email token | `email_token` | `src/server/email/flows.ts` (`consumeAccountToken`, `FOR UPDATE`) | The first row lock of the transaction. For `delete`, the retained-file accounting lock in `src/server/retained-files.ts` comes before it. |
| 2 | Workspace | `workspace` | `src/server/members.ts` (`changeRole`, `removeMember` through `lockWorkspaceMembership`, `FOR NO KEY UPDATE`); `src/server/email/flows.ts` (`delete`: every workspace of the user, ordered by id, `FOR UPDATE`) | The `audit_event` insert (rank 7) takes a key-share lock on its `workspace` row (rank 2), against the order stated on this page. Member changes take `FOR NO KEY UPDATE`, which does not conflict with that key-share lock ([workspace row rule](../security/FEDERATED_MFA.md#lock-order), issue #42). Known gap: the `delete` path still takes `FOR UPDATE` and keeps the same deadlock shape. |
| 3 | User | `user` | `src/server/federated-locks.ts` (`lockUserThenSessions`); `src/server/sso.ts` callbacks (`FOR SHARE`) | `consumeAccountToken("delete")` deletes it after the workspace locks. |
| 4 | Session | `session` | `src/server/federated-locks.ts`; `src/server/sso.ts` | The transaction's own or unissued session first, then the bound (initiating) session. |
| 5 | Account | `account` | `src/server/federated-mfa.ts`, `src/server/sso-link.ts` (`FOR SHARE`) | Known gap: `consumeAccountToken("reset")` writes account, then session, then user ([FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order)). The `src/server/sso.ts` callbacks share-lock the provider link row (account) after the member row, violating the order stated on this page. |
| 6 | Member | `workspace_member` | `src/server/sso-link.ts`, `src/server/sso.ts` (`FOR UPDATE` or `FOR SHARE`); `src/server/federated-mfa.ts` (`FOR SHARE`) | Taken after `sso_config` in the SSO paths. |
| 7 | SSO audit | `audit_event` | `src/server/audit.ts` (`audit()` insert), called last by `src/server/sso-link.ts`, `src/server/federated-mfa.ts` and `src/server/sso.ts` | The insert key-share locks its `workspace` row (rank 2). `changeRole`/`removeMember` no longer deadlock with it (issue #42). Known gap: `consumeAccountToken("delete")` can, because it locks the workspace `FOR UPDATE` ([FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order)). |

## Review checklist for a new transaction

- [ ] List every row it locks: explicit `.for("update")`/`.for("share")`, rows changed by `UPDATE`/`DELETE`, and rows an `INSERT` references through a foreign key (`audit_event.workspace_id` → `workspace` in `src/db/schema.ts`).
- [ ] Take them in rank order and never return to a lower rank. A new deviation is a bug unless it is added to the table as a known gap with its own issue.
- [ ] Lock several rows of one table in a deterministic order (`orderBy` id), as `consumeAccountToken("delete")` does for workspaces.
- [ ] Use `FOR UPDATE` only for rows the transaction writes; read-only fences use `FOR SHARE`, as the `src/server/sso.ts` callbacks do.
- [ ] Federated authority rows (user, sessions, factor, accounts, tenant authority) follow [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order) and take the user and sessions through `lockUserThenSessions`.
- [ ] Pin the statement order in a test (pattern: `tests/unit/federated-lock-order.test.ts`); a new pair of conflicting paths also gets a two-connection test (pattern: `tests/integration/federated-lock-order.test.ts`).
- [ ] Update this table, and FEDERATED_MFA.md for federated paths, in the same PR as the change.

## Worked examples
