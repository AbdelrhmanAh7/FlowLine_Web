# AI questions: issue #122 (lock-order worked examples for #45 and #47)

Stopped before editing any doc. Checked against `main` at `c830c11` on 2026-10-09.

## Blocker 1: the skeleton has not merged

Brief step 1: "Start after the skeleton part has merged." The skeleton is #120 / PR #128 (head `3315b21`). It is still a **draft**. `docs/engineering/lock-order.md` does not exist on `main` (`git show origin/main:docs/engineering/lock-order.md` → "does not exist"), so there is no `## Worked examples` heading to add to. Stacking this branch on `ai/120` would put the skeleton diff into this PR a second time. It would also mean folding work over a draft PR, which constitution article 2 forbids.

**Needed:** merge PR #128 (and PR #121 if it lands first), then re-run #122 on a fresh `main`.

## Blocker 2: the #45 fix contradicts the skeleton's entity table

The brief asks for "the ordering rule consistent with the entity table". The skeleton (PR #128) ranks **email token 1 → workspace 2 → user 3**. The open fix for #45, PR #65 (branch `ai/45`, `src/server/email/flows.ts`), uses the reverse order: "Lock order is user row, then token row (also in the delete and verify flows)". It locks `user` `FOR UPDATE` first, then the token row. In the delete flow it then locks the workspaces, so it also takes user (3) before workspace (2). Once PR #65 merges, the table and the code will disagree. A #45 example cannot be consistent with both. This is the same class of accuracy defect CodeRabbit raised on PR #93.

**Question:** which is canonical?
- (a) Keep the table (token → workspace → user). PR #65 must change approach, for example by locking the user's other `email_token` rows (ordered by id) before the user is deleted.
- (b) Adopt PR #65's order. The skeleton table must move `user` above `email_token` and `workspace`. This should be fixed in #120/PR #128 before #122 runs.

## Facts verified on `main` (`c830c11`), ready for the examples

**#45: email-token rows vs user delete** (open; fix PR #65 open, not merged → "pending #45")
- `src/db/schema.ts:98`: `email_token.user_id` references `user.id` `ON DELETE SET NULL`. Deleting a user therefore updates every token row of that user *after* locking the user row.
- `src/server/email/flows.ts` `consumeAccountToken`:
  - line 141 locks the presented token row `FOR UPDATE` first.
  - `reset` then writes `account`, `session` and `user` (lines 194–200) and updates the user's other `reset` tokens (line 202).
  - `delete` deletes the user (line 186), which cascades to the user's other token rows.
- Hazard: a reset holds its own token row and waits for the user row. A concurrent delete confirmation holds the user row and its cascade waits for that reset token, which deadlocks. Two resets that use different tokens each hold their token and queue at the user row; the winner then updates the loser's token row.

**#47: workspace `FOR UPDATE` vs own SSO audit insert** (closed as not planned, split into #108 test + #109 fix, both open → "pending #109")
- `src/server/email/flows.ts:151`: `consumeAccountToken("delete")` locks every workspace of the user `FOR UPDATE`, ordered by id. Line 169 inserts `audit_event` rows and line 186 deletes the user.
- `src/server/sso.ts:509` / `:541` (callbacks) lock the user `FOR SHARE`. `src/server/sso.ts:557` and `src/server/sso-link.ts:114` call `audit(tx, …)` (`src/server/audit.ts:64`) last. That insert key-share locks its `workspace` row through `audit_event.workspace_id` (`src/db/schema.ts`).
- Hazard: deletion holds workspace W and waits for the user row, while the SSO transaction holds the user row `FOR SHARE` and waits for W to insert its audit row. Same cycle as #42. `FOR UPDATE` must stay, because sole-member workspaces are deleted (`tests/integration/retained-file-locking.test.ts:122`). #109 proposes moving the audit insert before the workspace lock.

## Draft section (append under `## Worked examples` once the blockers are resolved)

```markdown
### Email token vs user delete ([#45](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/45))

- **Hazard:** `email_token.user_id` is `ON DELETE SET NULL` (`src/db/schema.ts`), so deleting a user updates the user's other token rows after locking the user. `consumeAccountToken` (`src/server/email/flows.ts`) locks its own token row first, and `reset` then writes the user row. A reset and a delete confirmation of one user can deadlock. Two resets with different tokens queue at the user row, and the winner updates the loser's token.
- **Rule:** <per the answer to Blocker 2>
- **Code:** pending #45 (PR #65).

### Workspace `FOR UPDATE` vs SSO audit insert ([#47](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/47))

- **Hazard:** `consumeAccountToken("delete")` (`src/server/email/flows.ts`) locks the user's workspaces `FOR UPDATE` (ordered by id) and later deletes the user. The SSO callbacks (`src/server/sso.ts`) share-lock the user and finally call `audit()` (`src/server/audit.ts`), whose `audit_event` insert key-share locks the same workspace (rank 2 after rank 3).
- **Rule:** a transaction that will insert an audit row for workspace W must not wait for W while holding the user row. Deletion keeps `FOR UPDATE` (sole-member workspaces are deleted, `tests/integration/retained-file-locking.test.ts`) and changes its order instead.
- **Code:** pending #109 (test: #108).
```

No e2e-army test is included because this is a docs-only issue with no user-facing change. Nothing under `.github/` is touched.
