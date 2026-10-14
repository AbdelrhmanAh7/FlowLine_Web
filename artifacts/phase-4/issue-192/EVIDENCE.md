# Evidence: issue #192 (follow-up to the 2026-10-11 PR-cycle audit)

Tested tree: the test files as of 2026-10-14 after merging `origin/main` (which added the #109 delete audit tests to `email-token-lock-order.test.ts`) and addressing CodeRabbit round 2 review findings in `tests/unit/concurrentPgTx.test.ts` (robust late-connect cleanup assertion via `finishConnect` property lookup; 40P01 deadlock test bounded with `timeoutMs: 3_000` to fail fast before test runner timeout). Run on 2026-10-14, macOS, Vitest 5.0.2, no database (both files mock their dependencies).

The per-item outcomes of the audit, and the deferred items, are recorded on GitHub, not in this file: [issue #192 comment](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/192#issuecomment-6139155173). The issue body checkboxes are updated, #128 is tracked in #241, and #81/#83/#87 are tracked in #250. Corrected replies were posted on PR #127 and PR #102.

## Code findings covered by this PR

| Audit item | State on `main` | Test added here | Fails without the fix |
|---|---|---|---|
| #125: `runConcurrentPg` ends the client when `pg_backend_pid()` fails, bounds opening by `timeoutMs`, and reports `40P01` at once | already fixed (`tests/helpers/concurrentPgTx.ts:53-63, 96-130`) | `tests/unit/concurrentPgTx.test.ts` (mocked `pg`, 3 tests) | yes: with `client.end()` removed from `open()` (line 62), "ends a client whose pg_backend_pid() query fails…" fails (1 failed, 2 passed) |
| #65: two resets with the same link hash the password once | already fixed (`src/server/email/flows.ts:207`, hash inside the transaction, under the user and token locks) | `tests/unit/email-token-lock-order.test.ts` "hashes once when two resets present the same link at once…" | yes: with the hash moved before `db.transaction`, 3 tests fail, including this one |

## Commands (2026-10-14)

- `pnpm exec vitest run tests/unit/concurrentPgTx.test.ts tests/unit/email-token-lock-order.test.ts`: **2 files, 14 tests passed**.
- The two mutations above were applied to the working tree, run, and reverted (`git status` clean afterwards).
- Full suite: not run locally (owner rule for FlowLine_Web). The GitHub-hosted Gate on the PR head is the check.

Not user-facing: only tests and docs change, with no route, UI or API behaviour, so there is no e2e-army test.
