# Issue #231 — unit tests for the money helper (`toDecimalString`)

Part 3/4 of #146. This branch is **self-contained**: it ships the `toDecimalString` helper *and* its unit
tests, so the tests run and pass on a `main`-based branch. A tests-only branch could not compile, because
`toDecimalString` is not on `main` (parts 1–2 of #146, and #230, are still unmerged).

## What this branch actually contains

| File | Change |
|---|---|
| `src/lib/format.ts` | adds `export function toDecimalString(value, scale = 2)` — JSDoc lines 37–52, body lines 53–98 |
| `tests/unit/lib-format.test.ts` | adds a `describe("toDecimalString")` block: 78 focused tests inside the 91-test file |
| `docs/DEVELOPER_GUIDE.md` | documents the helper, its no-rounding/no-truncation policy and its rejection of Persian digits / `٫` |
| this file | evidence |

Tested SHA: `ea6745c` (branch `ai/231`, 2026-10-14). The only commit after it is this evidence file; the
helper and the tests are unchanged by it.

```
$ nice -n 10 pnpm exec vitest run --project unit tests/unit/lib-format.test.ts tests/unit/latin-digits.test.ts --maxWorkers=2
 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-231

 Test Files  2 passed (2)
      Tests  94 passed (94)
   Start at  02:28:07
   Duration  233ms (tests 46%, transform 38%, import 14%, worker 2%)

$ pnpm typecheck
> tsc --noEmit            # exit 0, no output
$ pnpm exec eslint src/lib/format.ts tests/unit/lib-format.test.ts tests/unit/latin-digits.test.ts
# exit 0, no output
```

94 executed, 0 failed, 0 skipped: 91 in `tests/unit/lib-format.test.ts` (the file also pins `percent`,
`pretty`, `initials`, `duration`, `timeAgo`) and 3 in `tests/unit/latin-digits.test.ts`.

### CI regression fixed on this branch (`src/lib/format.ts:39,62`)

The first CI run for this PR (run 38483680909, job 115592126340, merge SHA `b97d81d`) failed the static leg
on **1 unit test, 1586 passed**: `tests/unit/latin-digits.test.ts:34` — that product-rule test (owner
2026-10-01: digits are always 0–9 across the product) scans every `src/**/*.ts(x)` line for literal
Arabic-Indic (U+0660–U+0669) or Persian (U+06F0–U+06F9) digits and exempts only the input-normalisation
table in `src/company-builder/packs/customer-follow-up.ts`. The helper embedded those characters literally
in its JSDoc (`:39`) and its normalisation regex (`:62`).

Fix: reference the code points as `\u0660-\u0669` in the regex and `U+0660–U+0669` in the JSDoc. The
character class `String.prototype.replace` sees is identical, so behaviour is unchanged, and the
product-rule test stays strict instead of being widened with a second exemption. The failing assertion is
the regression test: it reported `[ 'src/lib/format.ts:39', 'src/lib/format.ts:62' ]` before the fix and
`[]` after it (3/3 pass now).

## Acceptance criteria — verified on this branch (not on `ai/146`)

Line numbers are from `tests/unit/lib-format.test.ts` on `ea6745c`; the six number-path/bidi tests added
there pushed the `scale 0` block down by 28 lines (it is now `:395`–`:427`), everything above it is
unchanged.

| AC | Test (file:line) | Assertion |
|---|---|---|
| `0.1 + 0.2` input | `"rejects the float artifact number 0.1 + 0.2 at scale 2 …"` (`:256`) | the **numeric sum** `0.1 + 0.2` (`0.30000000000000004`) throws `/more than 2 decimal places/` — it is never rounded to `"0.30"`; the exact number `0.3` is separately pinned at `:280`, the string `'0.1'` at `:110` |
| `'12.50'` | `"formats '12.50' at scale 2 as '12.50'"` (`:98`); padding `:102`, `:106`, `:152` | `"12.50"` stays exact; `'12.5'` → `"12.50"`, `'12'` → `"12.00"` |
| `1e21` | string `"formats '1e21' at scale 2 …"` (`:118`); number `"formats the number 1e21 exactly, never in exponent notation"` (`:260`) | `"1000000000000000000000.00"`, never `1e+21` |
| negatives | `describe("negative numbers")` (`:195`–`:223`) and scale-0 `:420`, `:424` | `'-12.5'` → `"-12.50"`, `'-0.1'` → `"-0.10"`, `'-1e-2'` → `"-0.01"`; `'-0'`/`'-0.0'`/`'-0.00'` normalise to `"0.00"`; negative non-zero at scale 0 (`'-0.5'`) throws instead of losing its sign |
| Arabic-Indic digits | `describe("Arabic-Indic digits normalization")` (`:225`–`:253`) | `'١٢.٥٠'` → `"12.50"`, `'٠.١'` → `"0.10"`, `'١٢٥٠'` → `"1250.00"`, `'-١٢.٥'` → `"-12.50"`; **rejected** (not normalised): Persian digits `'۱۲.۵'` (`:246`) and the Arabic decimal separator `'١٢٫٥٠'` (`:250`) throw `/invalid decimal value/` |
| no float rounding | numeric `0.1 + 0.2` (`:256`), `12.51` stays `"12.51"` (`:268`), `12.599` throws instead of `"12.60"` (`:272`), `12.500` trims to `"12.50"` (`:276`) | more decimals than the scale is always an error, or exact — never rounded or truncated; `toDecimalString`'s body (`src/lib/format.ts:53-98`) contains no `toFixed`, `Math.round`, `parseFloat`, `Math.floor` or `Math.trunc` (grep count 0 inside the function) |
| number input path | `0.3` → `"0.30"` (`:280`), `-12.5` → `"-12.50"` (`:284`), `-0` → `"0.00"` (`:288`), default scale (`:292`: `0.1 + 0.2` throws, `12.5` → `"12.50"`), `1e21` (`:260`), `12.5` (`:264`) | the `String(value)` number path is covered for exact floats, negatives, negative zero and exponent form, not only strings (QA round-2 finding) |
| bidi control marks | `describe("bidi control marks …")` (`:298`–`:305`) | `"\u200f12.50"` (RLM), `"\u200e12.50"` (LRM) and `"\u061c12.50"` (ALM) throw `/invalid decimal value/`: rejected on purpose, as documented in the JSDoc (`src/lib/format.ts:45-47`) |

Scale-0 is not special: `describe("scale 0 (integer) cases")` (`:367`–`:399`) now expects
`/more than 0 decimal places/` for `'12.5'`, `'12.51'`, `'0.5'`, `'-12.5'`, `'-0.5'`, while `'12.0'`,
`'12.00'` and `'0.0'` still format as `"12"`, `"12"`, `"0"`.

## Reconciliation with PR #212 (`ai/146`) and #230

- **`ai/146` (PR #212)** is the canonical helper. After this branch's fix the `toDecimalString` **logic is
  identical** to `ai/146`'s: the only differences in the body are two explanatory comment lines (scale-0) and
  the Arabic-Indic normalisation written as `[\u0660-\u0669]` instead of the literal characters, so the
  product-rule scan (`tests/unit/latin-digits.test.ts`) passes; the JSDoc spells the same range as
  `U+0660–U+0669`. Both forms compile to the same character class, so behaviour is unchanged. These tests
  exercise exactly that behaviour.
- **`ai/230`** is a second, **divergent** implementation: it returns `RangeError` with different messages,
  **accepts** Persian digits (`۰-۹`) and the Arabic decimal separator `٫`, and normalises them — the opposite
  of the `ai/146` policy this branch tests. It must not merge as-is over `ai/146`; see #249/#230.
- **Merge order:** whichever of #212 / #230 merges first owns `src/lib/format.ts`; the other must be rebased
  onto it and its tests aligned to the chosen digit policy. This branch does not decide that policy — it pins
  the `ai/146` behaviour the issue's parent chose.

## Follow-up for the #146 / #230 owners

The "no float rounding" criterion is asserted behaviourally (numeric `0.1 + 0.2`, exact trailing-zero
handling). No structural guard (spy on `toFixed`/`Math.round`) is added here to avoid a brittle source-level
test; if the owner wants one it belongs on the branch that owns the helper. `#230`/`#249` must be reconciled
with #146 before either merges (digit-policy divergence above).

## E2E

`E2E: not needed — unit tests for an internal formatting helper; no user-facing flow or route changes.`
