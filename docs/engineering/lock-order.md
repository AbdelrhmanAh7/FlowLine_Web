# Lock order

Two transactions that lock the same rows in opposite orders can deadlock, and PostgreSQL then aborts one of them (SQLSTATE `40P01`). Issue #37 was such a deadlock between `confirmSsoLink` and `completeFederatedChallenge`; its fix is `lockUserThenSessions` in `src/server/federated-locks.ts`.

This page lists the seven lockable entities that the account, membership and SSO transactions share, ranked in the order a transaction takes them. The federated authority paths follow the more detailed rule in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order), pinned by `tests/unit/federated-lock-order.test.ts`; this page does not replace it. Rows that mention a known gap describe existing code that does not follow the order yet.

## Entities and global order

A transaction takes lower ranks first and never goes back to a lower rank.

| Rank | Entity | Table | Locked in | Notes |
|---|---|---|---|---|
| 1 | Email token | `email_token` | `src/server/email/flows.ts` (`consumeAccountToken`, `FOR UPDATE`) | The first row lock of the transaction. For `delete`, the retained-file accounting lock in `src/server/retained-files.ts` comes before it. |
| 2 | Workspace | `workspace` | `src/server/members.ts` (`changeRole`, `removeMember`, `FOR UPDATE`); `src/server/email/flows.ts` (`delete`: every workspace of the user, ordered by id) | Known gap: the `audit_event` insert (rank 7) takes a key-share lock on its `workspace` row (rank 2), violating the order stated on this page. |
| 3 | User | `user` | `src/server/federated-locks.ts` (`lockUserThenSessions`); `src/server/sso.ts` callbacks (`FOR SHARE`) | `consumeAccountToken("delete")` deletes it after the workspace locks. |
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

### Example #41: Password reset vs SSO link confirmation ([#41](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/41))

**Hazard:** A password reset (`consumeAccountToken("reset")`) and an SSO link confirmation (`confirmSsoLink`) for the same user can deadlock. Reset locks the email token (rank 1), then writes the account row (rank 5), then deletes sessions (rank 4), then updates the user row (rank 3) — account → session → user. Link confirmation locks the user row (rank 3) first, then the session (rank 4), then the account (rank 5) — user → session → account. The opposite orders form a cycle.

**Ordering rule:** Password reset must lock user (rank 3) before sessions (rank 4) and accounts (rank 5), consistent with the entity table. This is a known gap documented in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order); the fix is **pending #41**.

### Example #42: Member role change vs SSO audit ([#42](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/42))

**Hazard:** A member role change (`changeRole` or `removeMember` in `src/server/members.ts`) and an SSO transaction that writes an `audit_event` entry (link confirmation, challenge completion, or SSO callback in `src/server/sso-link.ts`, `src/server/federated-mfa.ts`, `src/server/sso.ts`) for the same member can deadlock. Role change locks the workspace row (rank 2, `FOR UPDATE`), then the member row (rank 6). The SSO path holds the member row (rank 6) and later inserts an `audit_event` row (rank 7), which takes a key-share lock on the workspace row (rank 2). Each transaction holds the row the other needs next.

**Ordering rule:** Both paths should follow rank order (workspace rank 2 before member rank 6 before audit rank 7). The `audit_event` insert's key-share lock on workspace after member is a known gap documented in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order) and the entity table above; the fix is **pending #42**.
