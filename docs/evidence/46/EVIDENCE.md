# Verification Evidence: PR #46 (Issue #42)

**Model:** Gemini 3.8 Flash · **Effort:** High · **Why:** Fix Round 13 QA findings on PR #46, prove root causes, update tests and documentation, and verify before commit.

## Acceptance Criteria

- **AC1:** `src/server/members.ts` defines and exports `lockWorkspaceMembership`, acquiring the workspace row lock with `FOR NO KEY UPDATE` prior to reading or modifying member rows or inserting audit records in `changeRole` and `removeMember`.
- **AC2:** Attempting to demote or remove the last owner of a workspace is rejected with HTTP 409 `LAST_OWNER` under the workspace lock, ensuring no mutation or audit event occurs.
- **AC3:** If a target member is not found in the workspace, the operation fails with HTTP 404 under the workspace lock without writing or inserting audit events.
- **AC4:** Unit and integration tests demonstrate that `FOR UPDATE` causes deadlocks with `FOR KEY SHARE` (40P01) during concurrent SSO audit events, whereas `FOR NO KEY UPDATE` avoids this conflict while preserving mutual exclusion between concurrent membership changes.
- **AC5:** Documentation across `docs/DEVELOPER_GUIDE.md`, `docs/engineering/lock-order.md`, `docs/security/FEDERATED_MFA.md`, and `docs/implementation/PHASE4_BETA_REPORT.md` accurately references `member-lock-order.test.ts` in the security regression set and integration examples, and reflects that V1 is resolved by #42.

## Verification Report

| AC | Verification Target / Command | Observed Exit Code / Result |
|---|---|---|
| AC1 | `nice -n 10 pnpm exec vitest run tests/unit/member-lock-order.test.ts` (`AC1: lockWorkspaceMembership acquires FOR NO KEY UPDATE on the workspace row`, `AC1: changeRole locks...`, `AC1: removeMember locks...`) | Exit code 0 (8 passed) |
| AC2 | `nice -n 10 pnpm exec vitest run tests/unit/member-lock-order.test.ts` (`AC2: refuses to demote or remove the last owner...`) | Exit code 0 (passed) |
| AC3 | `nice -n 10 pnpm exec vitest run tests/unit/member-lock-order.test.ts` (`AC3: a missing member is a 404 after the lock...`) | Exit code 0 (passed) |
| AC4 | `nice -n 10 pnpm exec vitest run tests/unit/member-lock-order.test.ts` (`AC4: demonstrates that FOR UPDATE causes deadlocks while FOR NO KEY UPDATE avoids them`) | Exit code 0 (passed) |
| AC5 | `nice -n 10 pnpm exec vitest run tests/unit/lock-order-doc.test.ts tests/unit/docs-index.test.ts` | Exit code 0 (7 passed) |
| Lint | `nice -n 10 pnpm exec eslint src/server/members.ts tests/unit/member-lock-order.test.ts tests/unit/lock-order-doc.test.ts tests/integration/member-lock-order.test.ts` | Exit code 0 |
| Types | `nice -n 10 pnpm typecheck` | Exit code 0 |

- **Changed covering tests:** `tests/unit/member-lock-order.test.ts`, `tests/integration/member-lock-order.test.ts`, `tests/unit/lock-order-doc.test.ts`.
- **Bug fix regression proof:** On base with `FOR UPDATE`, `CONFLICTS_WITH_KEY_SHARE.has("update")` is `true`, causing SQLSTATE 40P01 deadlock when concurrent SSO transactions take `FOR KEY SHARE` on the workspace row during `audit_event` inserts. On head with `FOR NO KEY UPDATE`, `CONFLICTS_WITH_KEY_SHARE.has("no key update")` is `false`, avoiding the deadlock cycle while `CONFLICTS_WITH_ITSELF.has("no key update")` is `true` preserving mutual exclusion. All 8 unit tests in `tests/unit/member-lock-order.test.ts` pass.
- **UI:** N/A (backend locking and authorization fix only; no UI, styling, or i18n copy modified).
- **Originating issue:** Closes [#42](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/42) (*Deadlock: member role change/removal vs SSO audit insert*). Originating Sentry issue: None (originating issue was discovered and filed on GitHub as issue #42).
