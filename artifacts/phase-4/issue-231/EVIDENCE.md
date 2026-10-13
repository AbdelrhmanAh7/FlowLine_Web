# Issue #231 — unit tests for the money helper (`toDecimalString`)

Part 3/4 of #146. Outcome: **the acceptance criteria are already met on the parent branch `ai/146`; this branch adds no code.**

`toDecimalString` is not on `main`. It exists only on the unmerged `ai/146` (PR #212) and, in a different version, on `ai/230`. A tests-only branch based on `main` cannot pass without the helper. Copying the helper in would duplicate #146/#230 and conflict with them.

Tested SHA: `50db33c` (`ai/146`), run on 2026-10-13 by checking out `src/lib/format.ts` and `tests/unit/lib-format.test.ts` from it into this worktree:

```
pnpm exec vitest run tests/unit/lib-format.test.ts --maxWorkers=2
Test Files  1 passed (1)
Tests  26 passed (26)
```

The tree was restored to `main` afterwards (`git status` clean).

| AC | Where (`tests/unit/lib-format.test.ts` on `ai/146`) |
|---|---|
| `0.1 + 0.2` input | `it("rejects float noise such as 0.1 + 0.2")` (l.133): rejected with "more than 2 decimal places"; `0.3` and `"0.1"` stay exact |
| `'12.50'` | `it("pads numbers and strings to the default scale of 2")` (l.97) |
| `1e21` | `it("expands very large numbers exactly (1e21)")` (l.159): `1e21`, `1.5e21`, `-1e21`, `"1e21"` |
| negatives | `it("handles negative numbers")` (l.145) and `it("never emits a negative zero")` (l.152) |
| Arabic-Indic digits | `it("normalises Arabic-Indic digits")` (l.176); Persian digits and U+066B are rejected (l.182) |
| no float rounding | `it("rejects more decimals than the scale instead of truncating or rounding")` (l.126); the helper body (`ai/146:src/lib/format.ts`) has no `toFixed`, `Math.round`, `parseFloat`, `Math.floor` or `Math.trunc` (grep count 0) |

## Follow-up for the #146 owner

The "no float rounding" criterion is asserted by behaviour only. If a structural guard is wanted, add it on `ai/146` itself, because it can only run where the helper exists. #230/#249 hold a second, divergent copy of the helper and tests; reconcile them with #146 before either merges.
