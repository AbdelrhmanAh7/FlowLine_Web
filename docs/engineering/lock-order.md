# Lock order

Two transactions that lock the same rows in opposite orders can deadlock, and PostgreSQL then aborts one of them (SQLSTATE `40P01`). Issue #37 was such a deadlock between `confirmSsoLink` and `completeFederatedChallenge`; its fix is `lockUserThenSessions` in `src/server/federated-locks.ts`.

This page lists the seven lockable entities that the account, membership and SSO transactions share, ranked in the order a transaction takes them. The federated authority paths follow the more detailed rule in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order), pinned by `tests/unit/federated-lock-order.test.ts`; this page does not replace it. Rows that name a documented exception describe code that goes backward on purpose and state why it cannot deadlock; `tests/unit/lock-order-doc.test.ts` pins the rank order and that each exception stays written down.

## Entities and global order

A transaction takes lower ranks first and never goes back to a lower rank.

| Rank | Entity | Table | Locked in | Notes |
|---|---|---|---|---|
| 1 | User | `user` | `src/server/federated-locks.ts` (`lockUserThenSessions`); `src/server/sso.ts` callbacks (`FOR SHARE`); `src/server/email/flows.ts` (`consumeAccountToken`, `FOR UPDATE`, after the retained-file accounting lock for `delete`) | The user row is the first row lock of every flow here (federated flows lock their own pending `verification` row before it, [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order)). Issue #45 moved it ahead of the email token; this is the order that prevents the reset/delete deadlock. |
| 2 | Email token | `email_token` | `src/server/email/flows.ts` (`consumeAccountToken`, `FOR UPDATE`) | Always second, after the user ([email-token order](../security/FEDERATED_MFA.md#email-token-lock-order)). No federated flow locks it. |
| 3 | Session | `session` | `src/server/federated-locks.ts`; `src/server/sso.ts`; `src/server/email/flows.ts` (`reset`: `DELETE` of the user's sessions) | The transaction's own or unissued session first, then the bound (initiating) session. |
| 4 | Account | `account` | `src/server/federated-mfa.ts`, `src/server/sso-link.ts` (`FOR SHARE`); `src/server/email/flows.ts` (`reset`: credential write, then the `sso:` links) | Documented exception: `consumeAccountToken("reset")` writes account **before** session (rank 4 before rank 3); #45 did not reorder these writes, it only put the user lock in front of them. It cannot form a cycle because every transaction that locks session or account rows of a user locks that user row first, and the reset holds it `FOR UPDATE`. A new code path that locks session or account rows without the user row first must not rely on this. |
| 5 | Workspace | `workspace` | `src/server/members.ts` (`changeRole`, `removeMember` through `lockWorkspaceMembership`, `FOR NO KEY UPDATE`); `src/server/email/flows.ts` (`delete`: every workspace of the user, ordered by id, `FOR UPDATE`, after the user and token) | Member changes take it before the member row (rank 6) and take no user lock. The `audit_event` insert (rank 7) key-share locks this row after the SSO transactions hold their member row, which is backward (rank 6 then rank 5): a documented exception that is safe only because member changes use `FOR NO KEY UPDATE`, which does not conflict with `FOR KEY SHARE` ([workspace row rule](../security/FEDERATED_MFA.md#lock-order), issue #42). `FOR UPDATE` here would deadlock again. Account deletion keeps `FOR UPDATE`; it holds the user `FOR UPDATE` first, which the SSO transactions need before their member row, so they cannot interleave (issue #45). |
| 6 | Member | `workspace_member` | `src/server/sso-link.ts`, `src/server/sso.ts` (`FOR UPDATE` or `FOR SHARE`); `src/server/federated-mfa.ts` (`FOR SHARE`); `src/server/members.ts` (row updated or deleted after the workspace lock) | Taken after `sso_config` in the SSO paths. The `src/server/sso.ts` callbacks also share-lock the provider link row (account, rank 4) after the member row: a second documented backward step, covered by the user row held `FOR SHARE` first. |
| 7 | Audit | `audit_event` | `src/server/audit.ts` (`audit()` insert), called last by `src/server/sso-link.ts`, `src/server/federated-mfa.ts`, `src/server/sso.ts` and `src/server/members.ts` | The insert key-share locks its `workspace` row (rank 5); see the rank 5 exception. |

## Review checklist for a new transaction

- [ ] List every row it locks: explicit `.for("update")`/`.for("share")`, rows changed by `UPDATE`/`DELETE`, and rows an `INSERT` references through a foreign key (`audit_event.workspace_id` → `workspace` in `src/db/schema.ts`).
- [ ] Take them in rank order and never return to a lower rank. A new deviation is a bug unless it is added to the table as a known gap with its own issue.
- [ ] Lock several rows of one table in a deterministic order (`orderBy` id), as `consumeAccountToken("delete")` does for workspaces.
- [ ] Use `FOR UPDATE` only for rows the transaction writes; read-only fences use `FOR SHARE`, as the `src/server/sso.ts` callbacks do.
- [ ] Federated authority rows (user, sessions, factor, accounts, tenant authority) follow [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order) and take the user and sessions through `lockUserThenSessions`.
- [ ] Pin the statement order in a test (pattern: `tests/unit/federated-lock-order.test.ts`); a new pair of conflicting paths also gets a two-connection test (pattern: `tests/integration/federated-lock-order.test.ts`).
- [ ] Update this table, and FEDERATED_MFA.md for federated paths, in the same PR as the change.

## Worked examples

### Example #41: password reset vs SSO link confirmation ([#41](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/41))

**Hazard (before #45):** `consumeAccountToken("reset")` in `src/server/email/flows.ts` wrote the credential `account` row (rank 4), deleted the user's `session` rows (rank 3), then updated the `user` row (rank 1), while `confirmSsoLink` in `src/server/sso-link.ts` locks user (rank 1), session (rank 3), account (rank 4) in that order. Interleaved, reset held the account row and waited for a session that link confirmation held, which waited for the account row: account → session → user against user → session → account.

**Ordering rule:** user (1) → session (3) → account (4), the same order as `confirmSsoLink` (`src/server/sso-link.ts`, via `lockUserThenSessions` in `src/server/federated-locks.ts`). Implemented in `consumeAccountToken` in `src/server/email/flows.ts`: it takes the user row `FOR UPDATE` before the token row and before any reset write. A second reset or a link confirmation for the same user queues at the user row and cannot hold a lower-ranked row first. The reset still writes account before session (the rank 4 exception); the user row held `FOR UPDATE` is what makes that safe. Pinned by `tests/unit/email-token-lock-order.test.ts` and `tests/integration/email-token-lock-order.test.ts` (landed with #45 in PR #65).

### Example #42: member role change vs SSO audit ([#42](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/42))

**Hazard (before #42):** `changeRole` (or `removeMember`) in `src/server/members.ts` locked the `workspace` row `FOR UPDATE` (rank 5), then wrote the member row (rank 6). SSO transactions (`confirmSsoLink`, `src/server/sso-link.ts` and callbacks in `src/server/sso.ts`, `src/server/federated-mfa.ts`) lock that member row (rank 6, `FOR UPDATE` or `FOR SHARE`), then `audit()` in `src/server/audit.ts` inserts an `audit_event` row (rank 7) that takes a key-share lock on the same `workspace` row (rank 5). Each held the row the other needed next, so one aborted with `40P01`.

**Ordering rule:** workspace (5) → member (6) → audit (7), with the workspace lock taken `FOR NO KEY UPDATE`. The SSO paths still reach back from the audit insert to the workspace row (a documented exception, see rank 5), and that is safe because `FOR NO KEY UPDATE` does not conflict with `FOR KEY SHARE`, so the insert never waits for a member change. Implemented in `lockWorkspaceMembership` (`src/server/members.ts`), pinned by `tests/unit/member-lock-order.test.ts` and `tests/integration/member-lock-order.test.ts`.

### Email token vs user delete ([#45](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/45))

- **Hazard:** `email_token.user_id` is `ON DELETE SET NULL` (`src/db/schema.ts`), so deleting a user updates every token row of that user after the user row is locked. When `consumeAccountToken` locked its own token row first, a password reset and a delete confirmation of one user could deadlock, and two resets with different tokens each held their own token while queueing at the user row.
- **Rule:** lock the user row `FOR UPDATE`, then the token row `FOR UPDATE`, then (`delete`) the user's workspaces ordered by id; `delete` takes the retained-file accounting lock (`lockRetainedFileAccounting`, `src/server/retained-files.ts`) before all of them. Code that writes `email_token` rows of an existing user locks the user first. This is the table's order (user rank 1, token rank 2, workspace rank 5), so it needs no exception; the detailed rule is in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#email-token-lock-order).
- **Code:** `consumeAccountToken` in `src/server/email/flows.ts` (fixed by PR #65), pinned by `tests/unit/email-token-lock-order.test.ts` and `tests/integration/email-token-lock-order.test.ts`.

### Workspace `FOR UPDATE` vs SSO audit insert ([#47](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/47))

- **Hazard:** `consumeAccountToken("delete")` locks every workspace of the user `FOR UPDATE` and later deletes the user. The SSO callback transactions in `completeSso` (`src/server/sso.ts`) share-lock the user first and call `audit()` (`src/server/audit.ts`) last; its `audit_event` insert key-share locks the same `workspace` row. A deletion that held workspace W before taking the user row (workspace rank 5, then user rank 1: backward) could wait for the user while the SSO transaction held the user `FOR SHARE` and waited for W, the same cycle as #42.
- **Rule:** a transaction that locks a user's workspaces `FOR UPDATE` takes that user's row first and never waits for it while holding W. Deletion keeps `FOR UPDATE` on the workspaces because sole-member workspaces are deleted with the account (`tests/integration/retained-file-locking.test.ts`).
- **Code:** since PR #65, `consumeAccountToken` in `src/server/email/flows.ts` locks the user row before the workspaces, so, read from the code on main, this pair no longer forms the cycle. This is not reproduced: the two-connection test is pending #108, and #109 (move the audit insert before the workspace lock) needs re-checking against this order.
