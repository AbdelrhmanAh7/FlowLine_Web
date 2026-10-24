# Prep for #390: fix: failing check `gate` (split from #308)

> Offline floor prep (2026-10-24T04:56Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#308 item=check:gate -->
Split from PR #308 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/308), which reached the fix-round cap (6/6) without going green. Parent issue: #303.

### Scope (one item)
- failing check `gate`

Red on 8cf7b24 of PR #308.

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #308". Keep the change small; do not reuse the parent branch `ai/303`.

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

## Test Plan: Fix - Failing `gate` Check (Issue #390)

**Objective:** Verify the fix for the failing `gate` check introduced in PR #308.

**1. Test Case: Gate Group Selection - Basic Green**
   * **Name:** Gate Group Green
   * **Setup:**  Run the `gate` check with a configuration where all gate groups pass.
   * **Assertion:** Check that the `gate` check returns green.
   * **File:** `tests/unit/gate-groups.test.ts`
   * **Edge Case:** Ensure the configuration is valid and doesn’t introduce new errors.

**2. Test Case: Gate Group - Single Red**
   * **Name:** Gate Group Red
   * **Setup:** Modify the `gate` configuration to trigger a single red gate group.
   * **Assertion:** Check that the `gate` check returns red.
   * **File:** `tests/unit/gate-groups.test.ts`
   * **Edge Case:** Verify the specific gate group that’s failing is correctly identified.

**3. Test Case: Gate Selection - No Selection**
   * **Name:** No Gate Selection
   * **Setup:**  Run the `gate` check with no gate selections configured.
   * **Assertion:** Check that the `gate` check returns green.
   * **File:** `tests/unit/gate-selection.test.ts`
   * **Edge Case:**  Ensure the absence of selections doesn’t cause unexpected behavior.

**4. Test Case: Gate Selection - All Red**
   * **Name:** All Gate Red
   * **Setup:** Configure all gate selections to be red.
   * **Assertion:** Check that the `gate` check returns red.
   * **File:** `tests/unit/gate-selection.test.ts`
   * **Edge Case:** Verify the correct error message is displayed.

**5. Test Case: Configuration File Validation**
   * **Name:** Invalid Configuration
   * **Setup:**  Introduce an invalid configuration file (e.g., missing required field).
   * **Assertion:** Check that the `gate` check returns red and an appropriate error message is logged.
   * **File:** `.coderabbit.yaml`
   * **Edge Case:**  Test various invalid configurations to ensure robustness.

**6. Test Case: Environment Variables**
   * **Name:** Missing Environment Variable
   * **Setup:** Remove a required environment variable.
   * **Assertion:** Check that the `gate` check returns red.
   * **File:** `.env.example`
   * **Edge Case:** Test with different missing variables.

**7. Test Case: Action Logs**
   * **Name:** Check Action Logs
   * **Setup:** Run the `gate` check and observe the action logs.
   * **Assertion:** Verify that the logs contain relevant information about the check’s execution.
   * **File:**  (Review logs generated during the check)

**8. Test Case: Gate Group - Mixed Red/Green**
   * **Name:** Mixed Gate Groups
   * **Setup:** Configure a mix of red and green gate groups.
   * **Assertion:** Check that the `gate` check returns red if *any* gate group is red.
   * **File:** `tests/unit/gate-groups.test.ts`
   * **Edge Case:** Verify the correct gate group is identified as the cause of the failure.
