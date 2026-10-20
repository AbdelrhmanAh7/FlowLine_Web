# Issue #230 — Implement `toDecimalString` helper function

Part 2/4 of #146. Rescoped as test and documentation: the canonical `toDecimalString` implementation landed on `origin/main` at `698c8b68` (PR #258, merged as part of #231). This PR contributes the `-3.1` double-dot regression test, developer documentation in `DEVELOPER_GUIDE.md`, and progress tracking.

## Changes in this PR

| File | Change |
|---|---|
| `tests/unit/lib-format.test.ts` | Added regression test at lines 200–204 for `-3.1` / `"-3.1"` formatting (proves no double dot). |
| `docs/DEVELOPER_GUIDE.md` | Added paragraph documenting `toDecimalString` helper contract and error behavior. |
| `docs/implementation/PROGRESS.md` | Recorded progress entry for #230 / PR #249, reconciling test counts and citing merged head. |
| `artifacts/phase-4/issue-230/EVIDENCE.md` | This evidence document. |

## Verification of Canonical Implementation on `origin/main` (`698c8b68`)

The canonical implementation in `src/lib/format.ts` on `main` satisfies all issue #230 acceptance criteria and resolves the QA round-1 findings:
- Fractional digits are separated from the decimal point without double dots (`-3.1` → `"-3.10"`).
- Zero fractions format with scale decimals when scale > 0 (`0` → `"0.00"`, `1e21` → `"1000000000000000000000.00"`).
- Empty strings and bare signs are rejected with `"toDecimalString: invalid decimal value"`.
- Negative zero is normalized to positive zero (`-0` → `"0.00"`).
- Excess decimals are rejected without float rounding (e.g. `0.1 + 0.2` throws).

## Local Verification Commands & Output

Tested at merged head `90a418ec` (incorporating `origin/main` at `a5482ed6`):

```
$ nice -n 10 pnpm exec vitest run --project unit tests/unit/lib-format.test.ts tests/unit/latin-digits.test.ts
 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-230

 ✓ |unit| tests/unit/lib-format.test.ts (105 tests) 30ms
 ✓ |unit| tests/unit/latin-digits.test.ts (3 tests) 570ms

 Test Files  2 passed (2)
      Tests  108 passed (108)
```

The 108 passed tests consist of 105 tests in `tests/unit/lib-format.test.ts` (including the 1 regression test added by this PR) and 3 tests in `tests/unit/latin-digits.test.ts`, reconciling with the 107 tests reported in the #229 row of `PROGRESS.md`.

```
$ pnpm typecheck
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-230
> tsc --noEmit
# exit 0, clean

$ pnpm lint
> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-230
> eslint . --cache --cache-location node_modules/.cache/eslint/
# exit 0, clean
```
