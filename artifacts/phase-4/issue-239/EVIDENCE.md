# Evidence — issue #239: Mizano create steps send `ctx.idempotencyKey` unchanged, and the same key on a repeat

Outcome: **Implemented on branch `ai/239` by merging `ai/147` (which provides the Mizano create actions) and applying the two assertion replacements plus double-call tests per the acceptance criteria.**

Checked on 2026-10-14: macOS, Node 26.10.0, Vitest 5.0.2. Commit `ba532163` on `ai/239`. All acceptance criteria verified by running the test suite.

## Changes made

1. Merged `ai/147` into `ai/239` to bring in the `mizano.create_customer` and `mizano.create_draft_quote` actions and their describe blocks.
2. In `tests/contract/mizano.test.ts`:
   - Changed `expect(req.headers?.["Idempotency-Key"]).toBe(ctx.idempotencyKey)` to `expect(req.headers?.["Idempotency-Key"]).toBe("idem-mizano")` in both describe blocks (lines 190 and 328).
   - Added test "sends the same Idempotency-Key when called twice with the same ctx and input" for `mizano.create_customer` (lines 200-210).
   - Added test "sends the same Idempotency-Key when called twice with the same ctx and input" for `mizano.create_draft_quote` (lines 339-349).

## Acceptance criteria verification

| AC | Where | Result |
|---|---|---|
| `create_customer` asserts the exact key `"idem-mizano"` | line 190: `expect(req.headers?.["Idempotency-Key"]).toBe("idem-mizano")` | Pass |
| `create_draft_quote` asserts the exact key `"idem-mizano"` | line 328: `expect(req.headers?.["Idempotency-Key"]).toBe("idem-mizano")` | Pass |
| `create_customer` sends the same key when called twice with same ctx and input | lines 200-210: new test calling `runAction` twice with same `ctx` and `input`, asserting both keys equal `"idem-mizano"` and each other | Pass |
| `create_draft_quote` sends the same key when called twice with same ctx and input | lines 339-349: new test calling `runAction` twice with same `ctx` and `input`, asserting both keys equal `"idem-mizano"` and each other | Pass |

## Commands

- `pnpm exec vitest run tests/contract/mizano.test.ts --maxWorkers=2`: **43 passed** (43)
- `pnpm exec vitest run tests/contract/mizano.test.ts --maxWorkers=2 -t "same Idempotency-Key when called twice"`: **2 passed** (the two new tests)
- `pnpm exec vitest run tests/contract/mizano.test.ts --maxWorkers=2 -t "run id as idempotency key"`: **2 passed** (the exact-key assertion tests)
- `pnpm typecheck`: **clean**
- `pnpm lint`: **clean**

## E2E

Not needed. This change is test-only, with no product code and no user-facing flow. PR description includes `E2E: not needed — contract-test-only change`.