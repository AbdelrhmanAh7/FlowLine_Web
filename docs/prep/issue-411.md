# Prep for #411: fix: failing check `gate` (split from #360)

> Offline floor prep (2026-10-24T10:16Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#360 item=check:gate -->
Split from PR #360 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/360), which reached the fix-round cap (6/6) without going green. Parent issue: #355.

### Scope (one item)
- failing check `gate`

Red on 7b722aa of PR #360.

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #360". Keep the change small; do not reuse the parent branch `ai/355`.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.gitignore`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/demo-docs-commands.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/template-actions.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Fix - Failing `gate` Check (Issue #411)

**Objective:** Verify the fix for the failing `gate` check introduced in PR #360.

**1. Test Case: Gate Group Selection - Basic Green**
   * **Name:** Gate Group Green
   * **Setup:**  Run the `gate` check with a configuration that should result in a green outcome.
   * **Assertion:** `gate` check passes.
   * **File:** `tests/unit/gate-groups.test.ts`
   * **Edge Case:** Ensure the configuration doesn't contain any known problematic values.

**2. Test Case: Gate Group Selection - Red (Simulated Error)**
   * **Name:** Gate Group Red
   * **Setup:**  Manually modify the `gate` configuration to trigger a red outcome (e.g., invalid group name).
   * **Assertion:** `gate` check fails.
   * **File:** `tests/unit/gate-groups.test.ts`
   * **Edge Case:** Verify the error message is informative.

**3. Test Case: Gate Selection - Valid Selection**
   * **Name:** Gate Selection Valid
   * **Setup:**  Verify a valid gate selection is processed correctly.
   * **Assertion:** `gate` check passes.
   * **File:** `tests/unit/gate-selection.test.ts`

**4. Test Case: Gate Selection - Invalid Selection**
   * **Name:** Gate Selection Invalid
   * **Setup:**  Verify an invalid gate selection is handled correctly.
   * **Assertion:** `gate` check fails.
   * **File:** `tests/unit/gate-selection.test.ts`
   * **Edge Case:**  Ensure the check handles different types of invalid input.

**5. Test Case: Configuration File Validation**
   * **Name:** Config File Validation
   * **Setup:**  Test various invalid configurations in `.coderabbit.yaml`.
   * **Assertion:** `gate` check fails.
   * **File:** `.coderabbit.yaml`

**6. Test Case: Environment Variable Validation**
    * **Name:** Env Variable Validation
    * **Setup:** Test invalid values in `.env.example`
    * **Assertion:** `gate` check fails.
    * **File:** `.env.example`

**7. Test Case: Redaction Check - No Redaction Needed**
   * **Name:** Redaction Green
   * **Setup:**  Ensure redaction isn't triggered when it shouldn't be.
   * **Assertion:** `gate` check passes.
   * **File:** `tests/unit/run-output-redaction.test.ts`

**8. Test Case:  Edge Case - Empty Configuration**
    * **Name:** Empty Config
    * **Setup:**  Run with an empty `.coderabbit.yaml`.
    * **Assertion:** `gate` check fails.
    * **File:** `.coderabbit.yaml`
