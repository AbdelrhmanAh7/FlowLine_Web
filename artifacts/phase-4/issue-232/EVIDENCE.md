# Issue #232: Integrate money helper with Mizano connector — Verification Evidence

Part 4/4 of #146 (FL G5 · Mizano connector v1).

## Summary

Integrates `toDecimalString` with the Mizano connector (`mizano.create_draft_quote`) to ensure numbers and decimal strings passed to money/quantity fields (`qty`, `unitPrice`, `taxRate`) are validated and formatted to exact 2-decimal strings in request bodies (e.g., `12.5` → `"12.50"`). Validation guarantees zero silent rounding, converts all invalid inputs into clean zod validation issues without throwing raw exceptions, and handles large numbers without float-drift false rejections. E2E-army scenarios are merged into `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` respecting the hub's 8 top-level e2e-army files cap.

**Branch:** `ai/232` → PR #279  
**Originating Sentry Issue:** None / N/A (Feature task #232, part 4/4 of #146)  
**UI / Localization:** Non-UI backend connector integration; Playwright screenshots and RTL/LTR captures exempt.

---

## Explicit Numbered Acceptance Criteria

1. **AC1: Decimal formatting for numbers and strings:** Passing `12.5` to a Mizano quote step formats to `"12.50"`; integer numbers like `10` or string `"10"` format to `"10.00"`; pre-formatted 2-decimal strings (`"500.00"`, `"15.00"`, `"5.00"`) are preserved.
2. **AC2: Zero silent rounding:** Over-precise numbers and strings (e.g. `"1.005"`, `0.001`, `0.004`, `10.505`, `0.1 + 0.2`) are rejected with schema validation errors (`ZodError`), and no HTTP request is dispatched.
3. **AC3: Malformed and negative input rejection:** Negative values (`-5`, `"-5"`, `"-100.00"`), exponent forms (`"1e3"`, `1e21`, `1e-7`), non-numeric strings (`"abc"`, `" 5 "`, `""`), `NaN`, and `Infinity` are rejected as validation errors; no raw exceptions escape zod transforms.
4. **AC4: Large numeric bounds and float precision:** Large legitimate amounts up to `MAX_SAFE_INTEGER / 100` (e.g., `1234567.89` → `"1234567.89"`, `99999999.99` → `"99999999.99"`, `0.07` → `"0.07"`, `0` → `"0.00"`) are accepted and correctly formatted without false rejections from float error.
5. **AC5: E2E-army path testing & 8-file cap compliance:** `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` tests actions through `action.input.safeParse` before `action.run`, asserting request payload matches fixed 2-decimal format and malformed amounts (`"1.005"`) make 0 requests. Top-level files stay at exactly 8, satisfying `tests/unit/e2e-army-tooling.test.ts`.
6. **AC6: Documentation and metadata sync:** `docs/integrations/SUPPORTED-ACTIONS.md:129` updated to document `mizano.create_draft_quote` input normalization behavior, and action description verified by contract test in `tests/contract/mizano.test.ts:313`.

---

## Verification Mapping Table

| AC | Requirement | Covering Test(s) & Location | Command & Result | Exit Code |
|---|---|---|---|---|
| **AC1** | Numbers & decimal strings format to 2 decimals | `tests/contract/mizano.test.ts:456-469`<br>`e2e-army/147-mizano-create-customer-and-quote.e2e.ts:71-85` | `pnpm exec vitest run tests/contract/mizano.test.ts` | `0` (Pass) |
| **AC2** | Zero silent rounding | `tests/contract/mizano.test.ts:494-521`<br>`e2e-army/147-mizano-create-customer-and-quote.e2e.ts:87-95` | `pnpm exec vitest run tests/contract/mizano.test.ts` | `0` (Pass) |
| **AC3** | Malformed & negative values rejected | `tests/contract/mizano.test.ts:405-454, 494-521` | `pnpm exec vitest run tests/contract/mizano.test.ts` | `0` (Pass) |
| **AC4** | Large numeric bounds & float precision | `tests/contract/mizano.test.ts:471-492` | `pnpm exec vitest run tests/contract/mizano.test.ts` | `0` (Pass) |
| **AC5** | E2E-army path & suite cap (≤ 8 files) | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`<br>`tests/unit/e2e-army-tooling.test.ts:121-130` | `pnpm exec vitest run tests/unit/e2e-army-tooling.test.ts` | `0` (Pass) |
| **AC6** | Documentation & action description sync | `docs/integrations/SUPPORTED-ACTIONS.md:129`<br>`tests/contract/mizano.test.ts:313` | `node scripts/ci/docs-check.mjs`<br>`pnpm exec vitest run tests/contract/mizano.test.ts` | `0` (Pass) |

---

## Changed Covering Tests

| Changed Implementation File | Covering Test File | Test Names / Cases |
|---|---|---|
| `src/integrations/providers/mizano.ts` | `tests/contract/mizano.test.ts` | `normalizes qty to a 2-decimal string whether it arrives as '10', 10 or 12.5`<br>`normalizes number %j to exact string %j for qty, unitPrice and taxRate`<br>`rejects %j as a validation error without rounding or calling Mizano`<br>`rejects a negative number for qty, unitPrice and taxRate`<br>`is registered as a write action` (checks action description) |
| `src/integrations/providers/mizano.ts` | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` | `@issue-232 AC1: Create draft quote sends numbers and decimal strings as fixed 2-decimal strings`<br>`@issue-232 AC2: Create draft quote rejects an amount with more than 2 decimals and makes no request` |
| `docs/integrations/SUPPORTED-ACTIONS.md` | `tests/contract/mizano.test.ts` | `expect(found?.action.description).toContain("Money values are normalized to fixed-scale decimal strings")` |
| `e2e-army/` structure | `tests/unit/e2e-army-tooling.test.ts` | `README and DEVELOPER_GUIDE state the hub's real cap (up to 8 top-level e2e-army/*.e2e.ts files), and the repo stays within it` |

---

## Verification Commands and Evidence

### 1. Contract Tests (`tests/contract/mizano.test.ts`)
```
$ pnpm exec vitest run tests/contract/mizano.test.ts
 RUN  v5.0.2

 ✓ |contract| tests/contract/mizano.test.ts (62 tests) 32ms

 Test Files  1 passed (1)
      Tests  62 passed (62)
```
Exit code: **0**.

Key test outputs:
- ✓ normalizes qty to a 2-decimal string whether it arrives as '10', 10 or 12.5
- ✓ normalizes number 1234567.89 to exact string "1234567.89" for qty, unitPrice and taxRate
- ✓ normalizes number 99999999.99 to exact string "99999999.99" for qty, unitPrice and taxRate
- ✓ normalizes number 0.07 to exact string "0.07" for qty, unitPrice and taxRate
- ✓ normalizes number 0 to exact string "0.00" for qty, unitPrice and taxRate
- ✓ rejects "1.005" as a validation error without rounding or calling Mizano
- ✓ rejects 0.30000000000000004 (0.1+0.2) as a validation error without rounding or calling Mizano
- ✓ rejects 1e-7 as a validation error without rounding or calling Mizano
- ✓ rejects 1e+21 as a validation error without rounding or calling Mizano
- ✓ rejects a negative number for qty, unitPrice and taxRate
- ✓ rejects invalid input (invalid qty - negative string "-5")
- ✓ rejects invalid input (invalid unitPrice - negative string "-100.00")
- ✓ rejects invalid input (invalid taxRate - negative string "-5.00")
- ✓ mizano create steps against a stateful fake that dedupes on Idempotency-Key (1)
- ✓ mizano create steps error handling (4)

### 2. E2E Tooling & Suite Cap Tests (`tests/unit/e2e-army-tooling.test.ts`)
```
$ pnpm exec vitest run tests/unit/e2e-army-tooling.test.ts
 RUN  v5.0.2

 ✓ |unit| tests/unit/e2e-army-tooling.test.ts (12 tests) 1593ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
```
Exit code: **0**. Confirms top-level e2e-army files <= 8.

### 3. TypeScript Type Check
```
$ pnpm typecheck
> flowline@0.1.0 typecheck
> tsc --noEmit
```
Exit code: **0** (clean).

### 4. ESLint Check on Changed Files
```
$ pnpm exec eslint e2e-army/147-mizano-create-customer-and-quote.e2e.ts src/integrations/providers/mizano.ts tests/contract/mizano.test.ts
```
Exit code: **0** (clean).

### 5. Evidence Secrets Check
```
$ pnpm check:evidence
check-evidence-secrets: 0 local secret value(s) checked across 175 file(s); 0 hit(s)
```
Exit code: **0**.

### 6. Docs Check
```
$ node -e 'import("./scripts/ci/docs-check.mjs").then(m => console.log(m.checkDocs(["src/integrations/providers/mizano.ts", "docs/integrations/SUPPORTED-ACTIONS.md"])))'
{
  passed: true,
  summary: '## Docs check\n\nCode files changed: 1\nDocs changed: 1\n- "docs/integrations/SUPPORTED-ACTIONS.md"\n',
  truncated: false
}
```
Exit code: **0**.

---

## Regression Demonstration (Bug Fix: Float Tolerance → Canonical String)

During development of the Mizano money helper integration, the initial number validation used an absolute float tolerance:
`Math.abs(val * 100 - Math.round(val * 100)) < 1e-9`.

**Regression on base:**
- Float precision loss scales proportionally with value magnitude: at `1.2e6`, float error exceeds `1.5e-8 > 1e-9`.
- Legitimate invoice amounts like `1234567.89` were falsely rejected with a validation error on base.
- Malformed inputs like `0.1 + 0.2 = 0.30000000000000004` or `1e-7` risked unpredictable behavior.

**Resolution on head:**
- Replaced with canonical string validation: `Number.isFinite(val) && val >= 0 && val <= Number.MAX_SAFE_INTEGER / 100 && STRING_MONEY.test(String(val))`.
- JavaScript's `String(val)` produces the shortest round-trip representation (base 10, no exponential notation for standard numbers):
  - `String(1234567.89)` === `"1234567.89"` (matches `/^\d+(\.\d{1,2})?$/`) → **Passes on head**.
  - `String(0.30000000000000004)` === `"0.30000000000000004"` (fails regex) → **Rejected on head**.
  - `String(1e-7)` === `"1e-7"` (fails regex) → **Rejected on head**.
  - `String(1e21)` === `"1e+21"` (fails regex) → **Rejected on head**.
