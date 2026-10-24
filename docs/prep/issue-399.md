# Prep for #399: fix: failing check `gate` (split from #330)

> Offline floor prep (2026-10-24T07:28Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#330 item=check:gate -->
Split from PR #330 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/330), which reached the fix-round cap (6/6) without going green. Parent issue: #320.

### Scope (one item)
- failing check `gate`

Red on da62dde of PR #330.

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #330". Keep the change small; do not reuse the parent branch `ai/320`.

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

## Test Plan: Fix - Failing `gate` Check (Issue #399)

**Objective:** Verify the fix for the failing `gate` check introduced in PR #330.

**1. Test Case: Gate Group Selection - Basic Green**
   * **Name:** Gate Group Green
   * **Setup:**  Simulate a scenario where all gate group conditions are met.
   * **Assertion:** `gate` check passes.
   * **File:** `tests/unit/gate-groups.test.ts`
   * **Edge Case:** Ensure correct group selection logic.

**2. Test Case: Gate Group - Red Condition**
   * **Name:** Gate Group Red
   * **Setup:**  Introduce a single condition within a gate group that evaluates to red.
   * **Assertion:** `gate` check fails.
   * **File:** `tests/unit/gate-groups.test.ts`
   * **Edge Case:** Verify the correct red condition triggers the failure.

**3. Test Case: Single Gate - Green**
   * **Name:** Single Gate Green
   * **Setup:**  A single gate condition evaluates to green.
   * **Assertion:** `gate` check passes.
   * **File:** `tests/unit/gate-selection.test.ts`
   * **Edge Case:** Verify basic gate functionality.

**4. Test Case: Single Gate - Red**
   * **Name:** Single Gate Red
   * **Setup:** A single gate condition evaluates to red.
   * **Assertion:** `gate` check fails.
   * **File:** `tests/unit/gate-selection.test.ts`
   * **Edge Case:** Verify basic gate functionality.

**5. Test Case: Complex Gate Group - Mixed Red/Green**
   * **Name:** Complex Gate Group
   * **Setup:**  A gate group with multiple conditions, some red, some green.
   * **Assertion:** `gate` check passes if all green conditions are met, fails otherwise.
   * **File:** `tests/unit/gate-groups.test.ts`
   * **Edge Case:**  Test combinations of red and green conditions.

**6. Test Case:  Empty Gate Group**
   * **Name:** Empty Gate Group
   * **Setup:**  A gate group with no conditions.
   * **Assertion:** `gate` check passes.
   * **File:** `tests/unit/gate-groups.test.ts`
   * **Edge Case:**  Ensure no unexpected behavior.

**7. Test Case:  Null/Undefined Inputs (if applicable)**
   * **Name:** Null Input
   * **Setup:**  Simulate null/undefined input to gate logic.
   * **Assertion:**  `gate` check handles gracefully (e.g., returns a default value or fails consistently).
   * **File:** `tests/unit/gate-selection.test.ts` (adapt based on implementation)

**8. Test Case:  Boundary Value Testing (if applicable)**
   * **Name:** Boundary Value
   * **Setup:**  Test values at the edges of the expected input range.
   * **Assertion:** `gate` check behaves as expected.
   * **File:** `tests/unit/gate-selection.test.ts` (adapt based on implementation)
