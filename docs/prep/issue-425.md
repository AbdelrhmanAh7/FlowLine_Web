# Prep for #425: fix: failing check `verify` (split from #380)

> Offline floor prep (2026-10-24T12:22Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#380 item=check:verify -->
Split from PR #380 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/380), which reached the fix-round cap (6/6) without going green. Parent issue: #375.

### Scope (one item)
- failing check `verify`

Red on dae4b8d of PR #380.

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #380". Keep the change small; do not reuse the parent branch `ai/375`.

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
- `AI_QUESTIONS.md`
- `DESIGN_DECISIONS.md`

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

## Test Plan: Fix - Failing `verify` Check (Issue #425)

**Goal:** Verify the fix for the failing `verify` check introduced in PR #380.

**1. Test Case: Landing Interaction Verification**
   * **Name:** Landing Page Verify
   * **Setup:** Deploy PR #380. Navigate to the landing page.
   * **Assertion:**  All elements on the landing page are present and correctly displayed.
   * **File:** `e2e/landing-interaction.spec.ts`
   * **Edge Case:** Different browser resolutions.

**2. Test Case: P2 Actions Verification**
   * **Name:** P2 Actions Functionality
   * **Setup:** Deploy PR #380. Trigger a P2 action.
   * **Assertion:** The action executes successfully and produces the expected output.
   * **File:** `tests/integration/p2-actions.test.ts`
   * **Edge Case:** Invalid input parameters.

**3. Test Case: Demo Docs Commands Verification**
   * **Name:** Demo Command Execution
   * **Setup:** Deploy PR #380. Execute a demo command.
   * **Assertion:** The command executes successfully and produces the expected output.
   * **File:** `tests/unit/demo-docs-commands.test.ts`
   * **Edge Case:** Command with missing arguments.

**4. Test Case: Docs Check Script Verification**
   * **Name:** Docs Check Script Validation
   * **Setup:** Deploy PR #380. Run the Docs Check Script.
   * **Assertion:** The script identifies and reports any issues accurately.
   * **File:** `tests/unit/docs-check-script.test.ts`
   * **Edge Case:** Script run on a document with no issues.

**5. Test Case: Gate Group Selection Verification**
   * **Name:** Gate Group Selection
   * **Setup:** Deploy PR #380. Select a gate group.
   * **Assertion:** The selected gate group is correctly applied.
   * **File:** `tests/unit/gate-groups.test.ts`
   * **Edge Case:** Selecting a non-existent gate group.

**6. Test Case: Gate Selection Verification**
   * **Name:** Gate Selection
   * **Setup:** Deploy PR #380. Select a gate.
   * **Assertion:** The selected gate is correctly applied.
   * **File:** `tests/unit/gate-selection.test.ts`
   * **Edge Case:** Selecting a gate with no associated rules.

**7. Test Case: Redaction Output Verification**
   * **Name:** Redaction Output
   * **Setup:** Deploy PR #380. Trigger redaction.
   * **Assertion:** Sensitive data is correctly redacted from the output.
   * **File:** `tests/unit/run-output-redaction.test.ts`
   * **Edge Case:** Redaction applied to a document with no sensitive data.
