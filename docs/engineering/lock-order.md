# Database lock order

One page to check before you add or change a transaction that locks rows. Two transactions that take the same rows in different orders can deadlock; PostgreSQL aborts one of them with SQLSTATE `40P01` after `deadlock_timeout`. This page collects the rules that were spread over issues and code comments. Detailed rationale for the federated authority paths stays in [FEDERATED_MFA.md](../security/FEDERATED_MFA.md#lock-order); retained-file accounting is in [RETAINED_UPLOAD_ACCOUNTING.md](../security/RETAINED_UPLOAD_ACCOUNTING.md#mandatory-lock-order-for-every-writer).

**Status.** The order below is the **target**. The "Code today" column says where the code already follows it and where it does not. Issues #41, #42, #45 and #47 are open: until each lands, the listed paths still lock in the old order and a deadlock abort is the failure mode (never a silent bypass). When you fix one, update its row and the hazard section in the same PR.

## Entities and acquisition order

Take locks top to bottom; never go back up. Re-locking a row you already hold is a no-op.

| Rank | Entity (table) | Lock it with | Code today |
|---|---|---|---|
| 0 | Prefix locks, outside the seven: retained-file accounting (advisory lock, then `retained_file_counter` row), then the flow's own pending `verification` row | `lockRetainedFileAccounting(tx)`; `FOR UPDATE` | Followed: `src/server/retained-files.ts`, `consumeAccountToken("delete")` in `src/server/email/flows.ts`, `confirmSsoLink` in `src/server/sso-link.ts`, `completeFederatedChallenge` in `src/server/federated-mfa.ts` |
| 1 | user (`user`) | `FOR UPDATE` when acting for the user, `FOR SHARE` in read-only SSO fences | Followed by the federated paths (`src/server/federated-locks.ts`, `src/server/sso.ts`). Not by reset recovery (#41) |
| 2 | session (`session`) | `FOR UPDATE` / `FOR SHARE`; own or unissued session first, then the initiating one | Same as user |
| 3 | account (`account`; also `two_factor` just before it) | `FOR SHARE` in the federated paths; updates in reset | Followed by the federated paths. Reset updates it before session and user (#41) |
| 4 | email-token (`email_token`) | `FOR UPDATE` | Not followed: reset, verify and delete lock the token first (#45) |
| 5 | workspace (`workspace`) | `FOR UPDATE`; many rows in id order | Not followed by SSO, which reaches it only through the audit insert after the member row (#42, #47) |
| 6 | member (`workspace_member`; `sso_config` just before it) | `FOR UPDATE` / `FOR SHARE` | Followed relative to user and session |
| 7 | SSO audit (`audit_event` insert) | `audit(tx, ...)` in `src/server/audit.ts` | An insert takes `FOR KEY SHARE` on the referenced `workspace` row, so it counts as a rank-5 lock (see #42) |

After rank 7 the federated paths take the provider/subject advisory lock and the replay markers (`totp-step:<user id>`, then `mfa-session:<hash>`, both `verification` upserts), last. Deleting a `user` cascades to its sessions, accounts and memberships, locked at the `DELETE`; lock every higher rank before that statement.

## Worked examples

### #41 account → session → user (password reset)

[Issue #41](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/41). `consumeAccountToken("reset")` (`src/server/email/flows.ts`) updates the credential `account`, deletes the user's `session` rows, then updates `user`. `lockUserThenSessions` (`src/server/federated-locks.ts`) used by `confirmSsoLink` and `completeFederatedChallenge` locks user, then sessions. Reset holds the account and sessions and waits for the user row while the other holds the user row and waits for the session: deadlock.
Rule: user, then session, then account. Lock the user row before the first account or session write.

### #42 member role change vs SSO audit insert

[Issue #42](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/42). `changeRole` and `removeMember` (`src/server/members.ts`) lock the `workspace` row and then read and write the member row. The SSO callback and link transactions (`src/server/sso.ts`, `src/server/sso-link.ts`, `src/server/federated-mfa.ts`) lock the member row and then call `audit(tx, ...)`, whose insert needs `FOR KEY SHARE` on the same `workspace` row, which the role change holds `FOR UPDATE`. Rule: workspace before member, so a transaction that will write an `audit_event` for a workspace must hold that workspace row (at least `FOR KEY SHARE`) before it locks a member row.

### #45 email-token rows vs user delete and concurrent resets

[Issue #45](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/45). `email_token.user_id` is `ON DELETE SET NULL` (`src/db/schema.ts`), so deleting a user rewrites that user's token rows after the user is locked, while `consumeAccountToken` (`src/server/email/flows.ts`) locks its token row first. Two resets with different outstanding tokens also each hold their own token row and then queue on the user row, and the winner updates the other's token. Rule: user before email-token. Read the user id from the token without a lock, lock the user, then lock and re-validate the token row.

### #47 account deletion vs the user's own SSO audit insert

[Issue #47](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/47). `consumeAccountToken("delete")` (`src/server/email/flows.ts`) locks every workspace of the user `FOR UPDATE` (needed: sole-member workspaces are deleted, pinned by `tests/integration/retained-file-locking.test.ts`), writes audit rows, then deletes the user, which cascades to member rows. A concurrent SSO transaction of the same user holds a member row and wants the workspace key share: the same cycle as #42. Rule: user first (this also makes the cascade safe), then workspace, then member, so the deletion locks the user row before the workspaces and SSO takes the workspace key share before its member lock.

## Checklist for a new transaction

1. List every row it locks, including implicit ones: `FOR UPDATE`/`SHARE`, `UPDATE`, `DELETE`, advisory locks, and the `FOR KEY SHARE` an `INSERT` takes on each referenced row (`audit` references `workspace`; `session` and `account` reference `user`).
2. Place each lock in the table above and confirm the sequence never goes up a rank. Cascading deletes and `ON DELETE SET NULL` count as locks taken at that statement.
3. Take prefix locks first: `lockRetainedFileAccounting(tx)` before any workspace, source, file or user-cascade lock.
4. Reuse `lockUserThenSessions` for user plus sessions instead of writing the queries again.
5. Need a row you would lock out of order? Read it unlocked first (to get an id), lock in order, then re-validate under the lock.
6. Many rows of one kind: lock in a fixed order (`ORDER BY id`).
7. Do not hold locks across network calls beyond what the flow already does (provider calls in account deletion are documented).
8. Add a statement-order unit test (`tests/unit/federated-lock-order.test.ts` is the pattern) and, for a new cycle, a two-connection test using `tests/integration/pg-lock-helpers.ts`.
9. If the order changes, update this page and the matching section of the area doc in the same PR.
