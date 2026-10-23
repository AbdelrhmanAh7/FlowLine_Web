# Prep for #354: fix: qa finding: AC1 verified: moneyInput.safeParse correctly returns { success: false… (split from #309)

> Offline floor prep (2026-10-23T11:57Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#309 item=finding:ea83f0341ae7 -->
Split from PR #309 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/309), which reached the fix-round cap (6/6) without going green. Parent issue: #296.

### Scope (one item)
- qa finding: AC1 verified: moneyInput.safeParse correctly returns { success: false…

AC1 verified: moneyInput.safeParse correctly returns { success: false } with a ZodError for negative numbers without throwing a raw Error (tests/unit/mizano-money-input.test.ts:7-15)

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #309". Keep the change small; do not reuse the parent branch `ai/296`.

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

## Test Plan: moneyInput.safeParse Negative Number Handling

**Issue:** Fix: QA finding: AC1 verified: moneyInput.safeParse correctly returns { success: false…

**Goal:** Verify `moneyInput.safeParse` correctly handles negative number inputs and does not throw raw errors.

**Test Cases:**

1.  **Test Case:** Negative Integer Input
    *   **Setup:** Input field set to "-10".
    *   **Assertion:** `safeParse` returns `{ success: false }` and a ZodError is present.
    *   **File:** `tests/unit/mizano-money-input.test.ts`
2.  **Test Case:** Negative Decimal Input
    *   **Setup:** Input field set to "-10.5".
    *   **Assertion:** `safeParse` returns `{ success: false }` and a ZodError is present.
    *   **File:** `tests/unit/mizano-money-input.test.ts`
3.  **Test Case:** Zero Input
    *   **Setup:** Input field set to "0".
    *   **Assertion:** `safeParse` returns `{ success: true, value: 0 }`.
    *   **File:** `tests/unit/mizano-money-input.test.ts`
4.  **Test Case:** Positive Integer Input
    *   **Setup:** Input field set to "10".
    *   **Assertion:** `safeParse` returns `{ success: true, value: 10 }`.
    *   **File:** `tests/unit/mizano-money-input.test.ts`
5.  **Test Case:** Positive Decimal Input
    *   **Setup:** Input field set to "10.5".
    *   **Assertion:** `safeParse` returns `{ success: true, value: 10.5 }`.
    *   **File:** `tests/unit/mizano-money-input.test.ts`
6.  **Test Case:** Empty Input
    *   **Setup:** Input field is empty.
    *   **Assertion:** `safeParse` returns `{ success: true, value: 0 }` (or appropriate default).
    *   **File:** `tests/unit/mizano-money-input.test.ts`
7.  **Test Case:** Large Positive Number
    *   **Setup:** Input field set to "1000000".
    *   **Assertion:** `safeParse` returns `{ success: true, value: 1000000 }`.
    *   **File:** `tests/unit/mizano-money-input.test.ts`

**Notes:**  Focus on verifying the ZodError is correctly generated and handled.  Ensure the test suite covers a range of valid and invalid inputs.
