# Issue #232: Integrate money helper with Mizano connector — Verification Evidence

Part 4/4 of #146 (FL G5 · Mizano connector v1).

## Summary

Integrates `toDecimalString` with the Mizano connector (`mizano.create_draft_quote`) to ensure numbers and decimal strings passed to money/quantity fields (`qty`, `unitPrice`, `taxRate`) are validated and formatted to exact 2-decimal strings in request bodies (e.g., `12.5` → `"12.50"`). Validation guarantees zero silent rounding, converts all invalid inputs into clean zod validation issues without throwing raw exceptions, and handles large numbers without float-drift false rejections.

## Acceptance Criteria & Verification Mapping

| AC | Requirement | Covering Test(s) & Location | Command & Result |
|---|---|---|---|
| **AC1** | Numbers and decimal strings format to fixed 2-decimal strings: Passing `12.5` formats to `"12.50"`; integer strings like `"10"` format to `"10.00"`; pre-formatted strings (`"12.50"`, `"5.00"`) are preserved. | `tests/contract/mizano.test.ts:456-469`<br>`e2e-army/232-mizano-decimal-string.e2e.ts:40-54` | `pnpm exec vitest run tests/contract/mizano.test.ts -t "normalizes qty"` → **PASS (exit code 0)** |
| **AC2** | Zero silent rounding: Over-precise numbers and strings (e.g. `"1.005"`, `0.001`, `0.004`, `10.505`, `0.1 + 0.2`) are rejected with `ZodError` (`code: 'custom'`, message `'must be a non-negative decimal with up to 2 decimal places'`), and no HTTP request is made. | `tests/contract/mizano.test.ts:494-521`<br>`e2e-army/232-mizano-decimal-string.e2e.ts:56-64` | `pnpm exec vitest run tests/contract/mizano.test.ts -t "without rounding or calling Mizano"` → **PASS (exit code 0)** |
| **AC3** | Malformed and negative input rejection: Negative values (`-5`, `"-5"`, `"-100.00"`), exponent forms (`"1e3"`, `1e21`, `1e-7`), non-numeric strings (`"abc"`, `" 5 "`, `""`), `NaN`, and `Infinity` are rejected as validation errors; no raw exceptions escape zod transforms. | `tests/contract/mizano.test.ts:405-454, 494-521` | `pnpm exec vitest run tests/contract/mizano.test.ts -t "rejects"` → **PASS (exit code 0)** |
| **AC4** | Large numeric bounds & float precision handling: Large legitimate amounts up to `MAX_SAFE_INTEGER / 100` (e.g., `1234567.89` → `"1234567.89"`, `99999999.99` → `"99999999.99"`, `0.07` → `"0.07"`, `0` → `"0.00"`) are accepted and correctly formatted without false rejections from float error. | `tests/contract/mizano.test.ts:471-492` | `pnpm exec vitest run tests/contract/mizano.test.ts -t "normalizes number"` → **PASS (exit code 0)** |
| **AC5** | E2E-army path testing: `e2e-army/232-mizano-decimal-string.e2e.ts` tests actions through `action.input.safeParse` before `action.run`, asserting request payload matches fixed 2-decimal format and malformed amounts (`"1.005"`) make 0 requests. | `e2e-army/232-mizano-decimal-string.e2e.ts:1-65` | Code review & schema validation inspection (passes lint and TypeScript checks) |
| **AC6** | Documentation sync: `docs/integrations/SUPPORTED-ACTIONS.md` updated to document `mizano.create_draft_quote` input normalization behavior. | `docs/integrations/SUPPORTED-ACTIONS.md:129` | `node scripts/ci/docs-check.mjs` → **PASS (exit code 0)** |

## Verification Commands and Evidence

### 1. Contract Tests (`tests/contract/mizano.test.ts`)
```bash
$ pnpm exec vitest run tests/contract/mizano.test.ts
 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-232

 ✓ |contract| tests/contract/mizano.test.ts (62 tests) 28ms
   ✓ mizano.list_overdue_invoices (17)
   ✓ mizano.create_customer (9)
   ✓ mizano.create_draft_quote (31)
     ✓ creates a draft quote via POST /api/quotes with the run id as idempotency key
     ✓ sends the same Idempotency-Key when called twice with the same ctx and input
     ✓ normalizes qty to a 2-decimal string whether it arrives as '10', 10 or 12.5
     ✓ normalizes number 1234567.89 to exact string "1234567.89" for qty, unitPrice and taxRate
     ✓ normalizes number 99999999.99 to exact string "99999999.99" for qty, unitPrice and taxRate
     ✓ normalizes number 0.07 to exact string "0.07" for qty, unitPrice and taxRate
     ✓ normalizes number 0 to exact string "0.00" for qty, unitPrice and taxRate
     ✓ rejects "1.005" as a validation error without rounding or calling Mizano
     ✓ rejects 0.001 as a validation error without rounding or calling Mizano
     ✓ rejects 0.004 as a validation error without rounding or calling Mizano
     ✓ rejects 10.505 as a validation error without rounding or calling Mizano
     ✓ rejects "abc" as a validation error without rounding or calling Mizano
     ✓ rejects " 5 " as a validation error without rounding or calling Mizano
     ✓ rejects "1e3" as a validation error without rounding or calling Mizano
     ✓ rejects "" as a validation error without rounding or calling Mizano
     ✓ rejects null as a validation error without rounding or calling Mizano
     ✓ rejects 1e+21 as a validation error without rounding or calling Mizano
     ✓ rejects 0.30000000000000004 as a validation error without rounding or calling Mizano
     ✓ rejects 1e-7 as a validation error without rounding or calling Mizano
     ✓ accepts decimal strings for qty, unitPrice, and taxRate
   ✓ mizano create steps against a stateful fake that dedupes on Idempotency-Key (1)
   ✓ mizano create steps error handling (4)

 Test Files  1 passed (1)
      Tests  62 passed (62)
```
Exit code: 0.

### 2. Unit Tests (`tests/unit/lib-format.test.ts`, `tests/unit/money.test.ts`)
```bash
$ pnpm exec vitest run tests/unit/lib-format.test.ts tests/unit/money.test.ts
 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-232

 ✓ |unit| tests/unit/money.test.ts (9 tests) 3ms
 ✓ |unit| tests/unit/lib-format.test.ts (105 tests) 16ms

 Test Files  2 passed (2)
      Tests  114 passed (114)
```
Exit code: 0.

### 3. TypeScript Type Check
```bash
$ pnpm typecheck
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-232
> tsc --noEmit
```
Exit code: 0 (clean).

### 4. ESLint Check
```bash
$ pnpm lint
> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-232
> eslint . --cache --cache-location node_modules/.cache/eslint/
```
Exit code: 0 (clean).

### 5. Evidence Secrets Check
```bash
$ pnpm check:evidence
> flowline@0.1.0 check:evidence /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-232
> node scripts/check-evidence-secrets.mjs
check-evidence-secrets: 0 local secret value(s) checked across 174 file(s); 0 hit(s)
```
Exit code: 0.

### 6. Docs Check
```bash
$ node -e 'import("./scripts/ci/docs-check.mjs").then(m => console.log(m.checkDocs(["src/integrations/providers/mizano.ts", "tests/contract/mizano.test.ts", "docs/integrations/SUPPORTED-ACTIONS.md"])))'
{
  passed: true,
  summary: '## Docs check\n\nCode files changed: 2\nDocs changed: 1\n- "docs/integrations/SUPPORTED-ACTIONS.md"\n',
  truncated: false
}
```
Exit code: 0.
