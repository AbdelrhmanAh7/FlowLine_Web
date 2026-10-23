# Prep for #355: fix: qa finding: AC2 verified: moneyInput.safeParse correctly rejects negative qty, un… (split from #309)

> Offline floor prep (2026-10-23T14:54Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy-med held until 20:47Z — invocation failure (in; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#309 item=finding:b304784673b3 -->
Split from PR #309 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/309), which reached the fix-round cap (6/6) without going green. Parent issue: #296.

### Scope (one item)
- qa finding: AC2 verified: moneyInput.safeParse correctly rejects negative qty, un…

AC2 verified: moneyInput.safeParse correctly rejects negative qty, unitPrice, and taxRate without throwing, and mizano.create_draft_quote input schema uses moneyInput (tests/unit/mizano-money-input.test.ts:79-114, tests/contract/mizano.test.ts:404-442)

**14 more item(s) from the parent, for the same task:**
- qa finding: AC3 verified: Valid inputs are normalized to 2-decimal strings, inclu…: AC3 verified: Valid inputs are normalized to 2-decimal strings, including Arabic-Indic digits (tests/unit/mizano-money-input.test.ts:67-77)
- qa finding: AC4 verified: Regression test demonstrates the PR 279 bug pattern whe…: AC4 verified: Regression test demonstrates the PR #279 bug pattern where throwing a raw Error in transform escapes safeParse, and confirms the fix resolves this (tests/unit/mizano-money-input.test.ts:116-150)
- qa finding: The PR successfully replaces the problematic pattern of throwing a ra…: The PR successfully replaces the problematic pattern of throwing a raw Error in the Zod transform with ctx.addIssue and z.NEVER, ensuring validation errors are properly contained within ZodError instead of escaping as unhandled exceptions.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/309#iss…
- qa finding: All acceptance criteria are met: safeParse returns success: false wit…: All acceptance criteria are met: safeParse returns success: false with ZodError for invalid inputs, parse throws ZodError, and valid inputs are normalized to 2-decimal strings including Arabic-Indic digits.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/309#issuecomment-6277537360
- qa finding: The fix is properly tested with unit tests in tests/unit/mizano-money…: The fix is properly tested with unit tests in tests/unit/mizano-money-input.test.ts (9/9 pass) and contract tests in tests/contract/mizano.test.ts (43/43 pass).

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/309#issuecomment-6277537360
- qa finding: A specific regression test (AC4) demonstrates the old buggy pattern a…: A specific regression test (AC4) demonstrates the old buggy pattern and confirms the fix prevents raw Errors from escaping safeParse.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/309#issuecomment-6277537360
- qa finding: The PR fixes the issue described in the brief by replacing the raw Er…: The PR fixes the issue described in the brief by replacing the raw Error throw with ctx.addIssue({ code: z.ZodIssueCode.custom, message }) and returning z.NEVER in the moneyInput transform in src/integrations/providers/mizano.ts.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/309#issuecomment-…
- qa finding: The PR includes comprehensive te

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.github/workflows/claude.yml`
- `.github/workflows/gate.yml`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/RETEST.md`

## Existing tests nearby

- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (ollama:gemma3:4b)

**Test Plan: FlowLine_Web - Issue #355 (moneyInput.safeParse)**

**Objective:** Verify the `moneyInput.safeParse` function correctly rejects invalid input (negative qty, unitPrice, taxRate) and handles valid inputs appropriately.

**1. Negative Quantity Test**
*   **Name:** NegativeQty_Rejection
*   **Setup:** Input: "-10" (string)
*   **Assertion:** `safeParse` returns `false`, and a `ZodError` is thrown indicating negative quantity.
*   **File:** `tests/unit/mizano-money-input.test.ts`

**2. Unit Price Test**
*   **Name:** UnitPrice_Rejection
*   **Setup:** Input: "10.50" (string)
*   **Assertion:** `safeParse` returns `false`, and a `ZodError` is thrown indicating unit price.
*   **File:** `tests/unit/mizano-money-input.test.ts`

**3. Tax Rate Test**
*   **Name:** TaxRate_Rejection
*   **Setup:** Input: "2.50" (string)
*   **Assertion:** `safeParse` returns `false`, and a `ZodError` is thrown indicating tax rate.
*   **File:** `tests/unit/mizano-money-input.test.ts`

**4. Valid Positive Quantity Test**
*   **Name:** ValidPositiveQty
*   **Setup:** Input: "10" (string)
*   **Assertion:** `safeParse` returns `true`, and the input is normalized to "10.00".
*   **File:** `tests/unit/mizano-money-input.test.ts`

**5. Valid Positive Price Test**
*   **Name:** ValidPositivePrice
*   **Setup:** Input: "20.00" (string)
*   **Assertion:** `safeParse` returns `true`, and the input is normalized to "20.00".
*   **File:** `tests/unit/mizano-money-input.test.ts`

**6. Arabic-Indic Digit Test**
*   **Name:** ArabicIndicDigit
*   **Setup:** Input: "10.50" (string with Arabic-Indic digits)
*   **Assertion:** `safeParse` returns `true`, and the input is normalized to "10.50".
*   **File:** `tests/unit/mizano-money-input.test.ts`

**7. Edge Case: Zero Value**
*   **Name:** ZeroValue
*   **Setup:** Input: "0" (string)
*   **Assertion:** `safeParse` returns `true`, and the input is normalized to "0.00".
*   **File:** `tests/unit/mizano-money-input.test.ts`

**8. Edge Case: Decimal Precision**
*   **Name:** DecimalPrecision
*   **Setup:** Input: "10.256" (string)
*   **Assertion:** `safeParse` returns `true`, and the input is normalized to "10.26".
*   **File:** `tests/unit/mizano-money-input.test.ts`

**9. Contract Test - ZodError Validation**
*   **Name:** ContractZodError
*   **Setup:**  Using the contract tests, verify that the ZodError is correctly constructed and thrown.
*   **File:** `tests/contract/mizano.test.ts`

**10. Regression Test (AC4) - Raw Error Prevention**
*   **Name:** RegressionAC4
*   **Setup:**  Run the AC4 regression test to confirm the fix prevents raw Error escapes.
*   **File:** `tests/unit/mizano-money-input.test.ts` (AC4 test case)
