# Evidence — issue #239: Mizano create steps send `ctx.idempotencyKey` unchanged, and the same key on a repeat

Outcome: **blocked until #147 merges (PR #219, still open on 2026-10-13).** Both acceptance criteria are already met in the parent's own describe blocks on branch `ai/147` (head `b32a51b`, commit `779c3b1` "assert real idempotency key"). This branch adds no test code. CTO decision (issue #239 comments): wait for #147 to merge to main, then rebase `ai/239` and, if the criteria are not already covered there, apply the two assertion replacements and the double-call tests in `tests/contract/mizano.test.ts`. Do not copy #147's logic into this PR.

Checked on 2026-10-13: macOS, Node 26.10.0, Vitest 5.0.2, `origin/main` `9c754b2`, `origin/ai/147` `b32a51b`. An evidence file cannot name the commit that contains it. The PR head SHA is on PR #246.

## Root cause of the QA findings on PR #246
- `mizano.create_customer`, `mizano.create_draft_quote` and their describe blocks in `tests/contract/mizano.test.ts` exist only on `ai/147`. On `main` the file has only `mizano.list_overdue_invoices` and the health check, so there was no loose `toHaveProperty("Idempotency-Key")` to replace.
- Earlier attempts on this branch appended 271 lines of new top-level describe blocks for actions that `main` does not register. The result: 9 of 33 tests failed (`pnpm exec vitest run tests/contract/mizano.test.ts` at `25279db`). The blocks also duplicated the suites that #147 adds, and went far beyond the 100-line limit.
- Fix: this branch restores `tests/contract/mizano.test.ts` to `main`'s version. The PR's net change is this file only, so nothing conflicts with #147 when it merges.

## Acceptance criteria (as met on `ai/147` `b32a51b`, `tests/contract/mizano.test.ts`)
| AC | Where | Result |
|---|---|---|
| `create_customer` asserts the exact key | line 189: `expect(req.headers?.["Idempotency-Key"]).toBe(ctx.idempotencyKey)`, where `ctxReturning` defaults the key to `"idem-mizano"` (line 19) | Pass |
| `create_draft_quote` asserts the exact key | line 315, same assertion | Pass |
| `create_customer` sends the same key when run twice with the same input | line 217, "sends the same Idempotency-Key when the same run repeats, and a different one for another run". Two contexts carrying run key `fl_run1_node1` plus one carrying `fl_run2_node1` are given the same input. The test asserts key 1 = `fl_run1_node1`, the repeat equals it, and the other run's key differs. This is stronger than the brief, which asks only for the repeat check. | Pass |
| `create_draft_quote` sends the same key when run twice with the same input | line 326, same test with `fl_run1_node2` / `fl_run2_node2` | Pass |

Commands (tree = `ai/147`'s `src/integrations/providers/mizano.ts` and `tests/contract/mizano.test.ts`, checked out temporarily into this worktree, then restored):
- `pnpm exec vitest run tests/contract/mizano.test.ts --maxWorkers=2 -t "Idempotency-Key|idempotency key"`: **4 passed**, 32 skipped (the 4 tests above)
- `pnpm exec vitest run tests/contract/mizano.test.ts --maxWorkers=2`: **36 passed** (36)

On this branch, after the fix: `pnpm exec vitest run tests/contract/mizano.test.ts --maxWorkers=2` passes, with the count equal to `main`'s (see the commit message).

E2E: not needed. This change is test-only, with no product code and no user-facing flow.
