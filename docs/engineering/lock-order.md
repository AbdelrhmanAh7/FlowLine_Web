# Lock order

Two transactions that lock the same rows in opposite orders can deadlock, and PostgreSQL then aborts one of them (SQLSTATE `40P01`). Issue #37 was such a deadlock between `confirmSsoLink` and `completeFederatedChallenge`; its fix is `lockUserThenSessions` in `src/server/federated-locks.ts`.

This page lists the seven lockable entities that the account, membership and SSO transactions share, ranked in the order a transaction takes them. The federated authority paths follow the more detailed rule in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order), pinned by `tests/unit/federated-lock-order.test.ts`; this page does not replace it. Rows that mention a known gap describe existing code that does not follow the order yet.

## Entities and global order

A transaction takes lower ranks first and never goes back to a lower rank.

| Rank | Entity | Table | Locked in | Notes |
|---|---|---|---|---|
| 1 | Email token | `email_token` | `src/server/email/flows.ts` (`consumeAccountToken`, `FOR UPDATE`) | Since #45 `consumeAccountToken` locks the user row (rank 3) first and the token row second, so this rank is not first there. That is a deliberate deviation from the order stated on this page, documented in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#email-token-lock-order); code that writes `email_token` rows of an existing user locks the user first. For `delete`, the retained-file accounting lock in `src/server/retained-files.ts` comes before the user row. |
| 2 | Workspace | `workspace` | `src/server/members.ts` (`changeRole`, `removeMember`, `FOR UPDATE`); `src/server/email/flows.ts` (`delete`: every workspace of the user, ordered by id) | Known gap: the `audit_event` insert (rank 7) takes a key-share lock on its `workspace` row (rank 2), violating the order stated on this page. |
| 3 | User | `user` | `src/server/federated-locks.ts` (`lockUserThenSessions`); `src/server/sso.ts` callbacks (`FOR SHARE`) | `consumeAccountToken` locks it first, before the token row; `delete` deletes it after the workspace locks. |
| 4 | Session | `session` | `src/server/federated-locks.ts`; `src/server/sso.ts` | The transaction's own or unissued session first, then the bound (initiating) session. |
| 5 | Account | `account` | `src/server/federated-mfa.ts`, `src/server/sso-link.ts` (`FOR SHARE`) | `consumeAccountToken("reset")` writes it after the user lock (`src/server/email/flows.ts`). Known gap: the `src/server/sso.ts` callbacks share-lock the provider link row (account) after the member row, violating the order stated on this page. |
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

### Example #41: password reset vs SSO link confirmation ([#41](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/41))

**Hazard:** `consumeAccountToken("reset")` writes the credential `account` row (rank 5), deletes the user's `session` rows (rank 4), then updates the `user` row (rank 3), while `confirmSsoLink` locks user, session, account in that order. Interleaved, reset holds the account row and waits for a session that link confirmation holds, which waits for the account row: account → session → user against user → session → account.

**Ordering rule:** user (3) → session (4) → account (5), the same order as `confirmSsoLink` (`src/server/sso-link.ts`, via `lockUserThenSessions` in `src/server/federated-locks.ts`). Implemented in `consumeAccountToken` in `src/server/email/flows.ts`: it takes the user row `FOR UPDATE` (line 153) before any write, then the token row (line 156), and only then runs the reset writes (from line 206). A second reset or a link confirmation for the same user queues at the user row and cannot hold a lower-ranked row first. Pinned by `tests/unit/email-token-lock-order.test.ts` and `tests/integration/email-token-lock-order.test.ts` (fix: #45).

### Example #42: member role change vs SSO audit ([#42](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/42))

**Hazard:** `changeRole` (or `removeMember`) in `src/server/members.ts` locks the `workspace` row `FOR UPDATE` (rank 2), then writes the member row (rank 6). `confirmSsoLink` in `src/server/sso-link.ts` locks that member row `FOR UPDATE` (rank 6), then `audit()` (`src/server/audit.ts`) inserts an `audit_event` row (rank 7) that takes a key-share lock on the same `workspace` row (rank 2). Each holds the row the other needs next, so one aborts with `40P01`. The `src/server/sso.ts` callbacks and `src/server/federated-mfa.ts` end the same way.

**Ordering rule:** workspace (2) → member (6) → audit (7): a path that has taken a member row must not insert `audit_event`, because that insert reaches back to rank 2. `changeRole` and `removeMember` already follow the rank order; the SSO paths do not, and no code enforces it yet: **pending #42** (known gap in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order); the audit row 7 note above).
