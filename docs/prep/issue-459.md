# Prep for #459: fix: GITHUB_WORKFLOW.md: docs/GITHUBWORKFLOW.md:1: The PR removes critical documentation about… (split from #458)

> Offline floor prep (2026-10-24T20:25Z): capacity 0 — claude: claude is text-only for coding (coding success 27%; codex: codex pacing: not enough room for a coding run (~1; agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#458 item=finding:e9b50fe293d0 -->
Split from PR #458 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/458), which carries ai-stuck without going green. Parent issue: #449.

### Scope (one item)
- GITHUB_WORKFLOW.md: docs/GITHUBWORKFLOW.md:1: The PR removes critical documentation about…

docs/GITHUB_WORKFLOW.md:1: The PR removes critical documentation about the GitHub workflow, including information about the 'gate' check, PR merging requirements, and CI tier processes, which are directly relevant to the blocker issue about checking 'gate' status on PRs.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/458#issuecomment-6384391952

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #458". Keep the change small; do not reuse the parent branch `ai/449`.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.gitignore`
- `AGENTS.md`
- `CLAUDE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`

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

## Test Plan: Issue #459 - GITHUB_WORKFLOW Documentation Fix

**Objective:** Verify the restored documentation in `docs/GITHUB_WORKFLOW.md` accurately reflects the GitHub workflow and resolves the blocker issue (#449).

**1. Test Case: Gate Check Verification**
   * **Name:** Gate Status Documentation
   * **Setup:** Clone the repository, checkout the PR branch.
   * **Assertion:** Verify the documentation clearly explains the 'gate' check process and its relevance to PR status.
   * **File:** `docs/GITHUB_WORKFLOW.md`

**2. Test Case: PR Merging Requirements**
   * **Name:** Merging Process Details
   * **Setup:** Review the documentation for PR merging requirements.
   * **Assertion:** Confirm the documentation details the necessary steps for PR merging.
   * **File:** `docs/GITHUB_WORKFLOW.md`

**3. Test Case: CI Tier Processes**
   * **Name:** CI Tier Information
   * **Setup:** Examine the documentation regarding CI tier processes.
   * **Assertion:** Verify the documentation accurately describes the CI tier processes.
   * **File:** `docs/GITHUB_WORKFLOW.md`

**4. Test Case: Action Workflow - Gate Report**
   * **Name:** Gate Report Action
   * **Setup:** Examine the `gate-report` action in `.github/actions/`.
   * **Assertion:** Verify the documentation explains the gate report action and its integration.
   * **File:** `.github/actions/gate-report/action.yml`

**5. Test Case: Workflow - Docs**
   * **Name:** Docs Workflow
   * **Setup:** Review the `docs.yml` workflow.
   * **Assertion:** Verify the workflow is correctly configured to generate documentation.
   * **File:** `.github/workflows/docs.yml`

**6. Test Case: Workflow - Gate**
   * **Name:** Gate Workflow
   * **Setup:** Review the `gate.yml` workflow.
   * **Assertion:** Verify the workflow is correctly configured to manage gate statuses.
   * **File:** `.github/workflows/gate.yml`

**7. Test Case: Template - PR Template**
    * **Name:** PR Template Content
    * **Setup:** Review the PR template.
    * **Assertion:** Verify the template includes the necessary information for PRs.
    * **File:** `.github/pull_request_template.md`

**Edge Cases:**
*   Verify documentation is consistent across all files.
*   Ensure documentation is updated to reflect any changes in the GitHub workflow.
