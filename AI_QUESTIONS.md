# AI questions / notes

## 2026-10-20 — tester-army/e2e Claude Haiku closed response grammar failure on agent.assert (hub-side)

In PR #215 verification (head `cbf2d0b9`), `tester-army/e2e` failed with:
`MODEL_OUTPUT_INVALID: provider response did not match the closed response grammar`
across the 3 tests in `tests/FlowLine_Web.e2e.ts` that execute `agent.assert`:
1. `a wrong password is rejected on the sign-in screen` (line 66)
2. `a signed-in user opens the flows list and creates another blank flow on the canvas` (line 74)
3. `the workspace navigation reaches Runs and Templates` (line 82)

Inspection of the captured failure screens (`screen.txt`) confirms the application state was 100% correct in all three cases:
- Sign-in: alert `"That email and password don't match."` rendered on screen at `/sign-in`.
- Flows canvas: heading `"Start with a trigger"` and button `"+ Add a trigger"` rendered on screen.
- Runs: heading `"Run history"` rendered on screen.

Root cause: When `cli/claude:haiku` is selected as the model (due to agy/Gemini quota hold), `cli-model.ts` injects a prompt instructing the model to reply with `{"text": "...", "tool_calls": [...]}`. However, `agent.assert` calls `invocation.ask` with schema `agent-judgment-2` (`{"verdict": "holds"|"fails"|"inconclusive", "explanation": "..."}`) with no tools. Claude Haiku replies with `{"text": "...", "tool_calls": []}`, and the inner string fails `agent-judgment-2` JSON validation.

Note for the owner/CTO: This is a hub runner / model protocol issue in `ops/verify/e2e-army/cli-model.ts`, not a defect in FlowLine_Web product code or PR #215. PR #215's own flows and unit/contract tests (104/104) are all passing.

## 2026-10-15 — hub e2e-army file cap reached (recorded, not a blocker)

The hub's verify job copies only the first 8 top-level `e2e-army/*.e2e.ts` files of a branch
(`readdirSync(e2e-army).filter(/^[\w.-]+\.e2e\.ts$/).slice(0, 8)` in `nql-agents src/lib/e2earmy.ts`),
and `tests/unit/e2e-army-tooling.test.ts` asserts the repo stays within that cap.

`main` now sits exactly at 8 files (#221 added `e2e-army/221-auth-isolation.e2e.ts`), so the required
#166 test (`e2e-army/166-mena-template.e2e.ts`) is the ninth and the cap guard fails on any fresh CI run
of the PR. Since the hub cannot run the ninth file, the repo has to stay at 8.

**Suggestion for the owner (hub-side, not changed here):** raise the hub cap above 8, or make the hub run
every `e2e-army/*.e2e.ts` file, so a new feature test no longer silently evicts the alphabetically last one.
Until then, #166 keeps the repo at 8 by merging the two same-route platform-admin API tests (#179 into
`e2e-army/200-route-error-headers.e2e.ts`); every test and tag is kept. See that file's header.
