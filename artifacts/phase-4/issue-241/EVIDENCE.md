# Evidence: issue #241 (docs(lock-order): add a 'Known violations' section to lock-order.md for the two #128 findings)

Part of #192.
Tested commit: tested on branch `ai/241` against HEAD of `origin/main` (`e646a041c9239f9fa1bb431bf320c3d6613cdf9a`).

## Acceptance Criteria

- **AC1:** Between the 'Entities and global order' table and 'Review checklist for a new transaction' in `docs/engineering/lock-order.md`, add a section headed `## Known violations`.
- **AC2:** The section contains a Markdown table with the exact columns: `Violation | Code | Ranks (taken order) | Deadlock pair | Tracking`.
- **AC3 (Row V1):** Documents the `audit_event` insert in `src/server/audit.ts` (`audit()`, called last by `src/server/sso-link.ts`, `src/server/federated-mfa.ts` and `src/server/sso.ts`), taking Member (5) → Workspace key-share (6) → SSO audit insert (7), deadlocking with `changeRole` and `removeMember` in `src/server/members.ts` (which lock `workspace` 6 `FOR UPDATE` then update `workspace_member` 5: taken order 6 → 5), tracked by [#42](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/42).
- **AC4 (Row V2):** Documents the SSO callback transactions in `src/server/sso.ts` (`completeSso` callbacks, MFA and non-MFA paths), taking Member (5) → Account (4) (share-locking provider link `account` row after `workspace_member`: taken order 5 → 4), deadlocking with any concurrent transaction locking `account` (rank 4, `FOR UPDATE`) before `workspace_member` (rank 5), tracked by [#241](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/241) (part of [#192](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/192)).
- **AC5:** The change is <= 100 lines and does not touch parent's core runtime logic.
- **AC6:** Markdown verification test command executes cleanly; `grep -n '## Known violations' docs/engineering/lock-order.md` succeeds with exit code 0.

## Verification Matrix

| AC ID | Description | Verification Command / Check | Observed Exit Code / Output | Result |
|---|---|---|---|---|
| AC1 | Section `## Known violations` placed between 'Entities and global order' table and 'Review checklist' | `grep -n -C 2 '## Known violations' docs/engineering/lock-order.md` | Line 21, between line 19 (`audit_event`) and line 30 (`## Review checklist`); exit code 0 | PASS |
| AC2 | Table columns: `Violation \| Code \| Ranks (taken order) \| Deadlock pair \| Tracking` | Verified table header in `docs/engineering/lock-order.md:25` | 5 columns matching schema exactly; exit code 0 | PASS |
| AC3 | Row V1: `audit()` insert in `src/server/audit.ts`, ranks 5 → 6 → 7 vs `members.ts` 6 → 5, tracked #42 | Inspected row V1 at `docs/engineering/lock-order.md:27` | Verified code citations and ranks match code on main; exit code 0 | PASS |
| AC4 | Row V2: `sso.ts` callbacks, ranks 5 → 4 vs account-first transactions, tracked #241 (part of #192) | Inspected row V2 at `docs/engineering/lock-order.md:28` | Verified code citations and ranks match `src/server/sso.ts:518-519,549-550`; exit code 0 | PASS |
| AC5 | Change size <= 100 lines; core runtime logic untouched | `git diff --stat` | `docs/engineering/lock-order.md`: 9 lines added, 0 deleted; core logic untouched | PASS |
| AC6 | Test command: grep finds `## Known violations` | `grep -n '## Known violations' docs/engineering/lock-order.md` | `21:## Known violations`, exit code 0 | PASS |

## Test Commands and Execution Evidence

1. **Grep verification:**
   ```bash
   $ grep -n '## Known violations' docs/engineering/lock-order.md
   21:## Known violations
   (Exit code: 0)
   ```

2. **Docs consistency and table formatting tests:**
   ```bash
   $ pnpm test tests/unit/docs-index.test.ts
   ✓ docs index and PR #159 docs (4 tests)
   Test Files 1 passed (1)
   Tests 4 passed (4)
   (Exit code: 0)
   ```

3. **Typecheck & Lint (standard repo gates):**
   ```bash
   $ pnpm typecheck
   Exit code: 0
   $ pnpm lint
   Exit code: 0
   ```

4. **Docs-only scope check:**
   No route, UI or API code changed. Per AGENTS.md and issue brief, this documentation change is exempt from e2e-army tests.
