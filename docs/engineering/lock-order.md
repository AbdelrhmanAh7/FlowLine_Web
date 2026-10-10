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

### Email token vs user delete ([#45](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/45))

**Hazard:** `email_token.user_id` is `ON DELETE SET NULL` (`src/db/schema.ts`), so deleting a user updates the user's other token rows after locking the user. `consumeAccountToken` (`src/server/email/flows.ts`) locks its own token row first (`FOR UPDATE` at line 141), and the `reset` purpose writes the user row. A reset and a delete confirmation of one user can deadlock: the reset holds its token and queues at the user row, while the delete holds the user row and its cascade waits for that reset token. Two resets with different tokens queue at the user row; the winner updates the loser's token.

**Rule:** The transaction locks its own token row first, then any workspaces it owns (deterministic `id` order), then deletes the user. The `reset` purpose writes account, session and user rows after the token lock (lines 189–202), so it also locks token before user.

**Code:** `src/server/email/flows.ts` – `consumeAccountToken` (lines 134–209). Open fix in PR #65.

---

### Workspace `FOR UPDATE` vs SSO audit insert ([#47](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/47))

**Hazard:** `consumeAccountToken("delete")` (`src/server/email/flows.ts`) locks the user's workspaces `FOR UPDATE` (ordered by `id` at line 151) and later deletes the user. SSO callbacks in `src/server/sso.ts` (lines 509, 541) share-lock the user `FOR SHARE`, then call `audit()` (`src/server/audit.ts:64`), whose `audit_event` insert key-share locks the same workspace (via `audit_event.workspace_id`). A deletion holds workspace W and waits for the user row, while an SSO transaction holds the user row `FOR SHARE` and waits for W to insert its audit row. Same deadlock cycle as #42. `FOR UPDATE` must stay, because sole-member workspaces are deleted (`tests/integration/retained-file-locking.test.ts:122`). #109 proposes moving the audit insert before the workspace lock.

**Rule:** A transaction that will insert an audit row for workspace W must not wait for W while holding the user row. Deletion keeps `FOR UPDATE` (sole-member workspaces are deleted) and changes its order instead.

**Code:** `src/server/sso.ts` – callbacks (lines 509, 541); `src/server/sso-link.ts` – `confirmSsoLink` (line 114); `src/server/federated-mfa.ts` – `completeFederatedChallenge` (lines 151–195); `src/server/audit.ts` – `audit` (lines 65–76); `src/server/email/flows.ts` – `consumeAccountToken` delete flow (line 151). Tracked as **pending #109** (test: #108).
