# Prep for #146: Money helper: convert flow numbers to Mizano decimal strings

> Offline floor prep (2026-10-13T09:52Z): capacity 0 — claude: claude week 87% ≥ 85%: the last 15% is the owner's; codex: codex pacing: not enough room for a coding run (~1; opencode: opencode has no live canary pass in the last 3 h (; agy: held until 10-14 14:35Z (1 d 5 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Part of #144 (FlowLine G5 · Mizano connector v1).

## Scope
Add `toDecimalString(value, scale=2)` used by every Mizano step: accepts number or string, rejects NaN/Infinity/more decimals than the scale, never uses float math for rounding.

## Acceptance
- [ ] Unit tests: 0.1+0.2 inputs, '12.50', 1e21, negatives, Arabic-Indic digits rejected or normalised
- [ ] No float rounding (string/BigInt based)

## How to test manually
1. Run the unit tests
2. In a test flow, pass 12.5 to a Mizano step: the request body shows "12.50"

Test link: https://abdelrahmans-mac-mini.tailb66912.ts.net:8444 (Mizano: :8446). Blocked by the Mizano scoped API keys task (MZ G5) for live calls; mocks are enough to merge.


## Acceptance checklist

- [ ] Unit tests: 0.1+0.2 inputs, '12.50', 1e21, negatives, Arabic-Indic digits rejected or normalised
- [ ] No float rounding (string/BigInt based)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.gitignore`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: FlowLine - Money Helper (toDecimalString)

**Goal:** Verify the `toDecimalString` function accurately converts flow numbers to Mizano decimal strings, handling various inputs and edge cases.

**1. Basic Conversion:**
   * **Name:** Simple Decimal Conversion
   * **Setup:** Input: 12.50
   * **Assertion:** Output: "12.50"
   * **File:** `tests/unit/focused-run-env.test.ts`

**2. Integer Input:**
   * **Name:** Integer to Decimal
   * **Setup:** Input: 10
   * **Assertion:** Output: "10.00"
   * **File:** `tests/unit/focused-run-env.test.ts`

**3. Negative Number:**
   * **Name:** Negative Number Conversion
   * **Setup:** Input: -5.75
   * **Assertion:** Output: "-5.75"
   * **File:** `tests/unit/focused-run-env.test.ts`

**4. Scale Adjustment:**
   * **Name:** Scale 3 Conversion
   * **Setup:** Input: 1000
   * **Assertion:** Output: "1000.00"
   * **File:** `tests/unit/focused-run-env.test.ts`

**5. Large Number (Scientific Notation):**
   * **Name:** Large Number Conversion
   * **Setup:** Input: 1e21
   * **Assertion:** Output: "100000000000000000000.00"
   * **File:** `tests/unit/focused-run-env.test.ts`

**6. NaN/Infinity Handling:**
   * **Name:** NaN Input
   * **Setup:** Input: NaN
   * **Assertion:** Output: (Error/Exception - Verify no float math)
   * **File:** `tests/unit/focused-run-env.test.ts`

**7. String Input (Valid):**
   * **Name:** String Input
   * **Setup:** Input: "7.89"
   * **Assertion:** Output: "7.89"
   * **File:** `tests/unit/focused-run-env.test.ts`

**8. Arabic-Indic Digit Handling:**
   * **Name:** Arabic Digit Input
   * **Setup:** Input: "12,50"
   * **Assertion:** Output: "12.50" (Normalised)
   * **File:** `tests/unit/focused-run-env.test.ts`

**9.  Zero Value:**
    * **Name:** Zero Value Conversion
    * **Setup:** Input: 0
    * **Assertion:** Output: "0.00"
    * **File:** `tests/unit/focused-run-env.test.ts`

**10. Mixed Decimal and Integer:**
    * **Name:** Mixed Input
    * **Setup:** Input: "3.14159"
    * **Assertion:** Output: "3.14159"
    * **File:** `tests/unit/focused-run-env.test.ts`
