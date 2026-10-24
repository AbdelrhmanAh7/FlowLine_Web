# Prep for #460: fix: GITHUB_WORKFLOW.md: docs/GITHUBWORKFLOW.md:16: The replacement guidelines are incomplete … (split from #458)

> Offline floor prep (2026-10-24T20:48Z): capacity 0 — claude: claude is text-only for coding (coding success 27%; codex: codex pacing: not enough room for a coding run (~1; agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#458 item=finding:38ae3264e2ce -->
Split from PR #458 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/458), which carries ai-stuck without going green. Parent issue: #449.

### Scope (one item)
- GITHUB_WORKFLOW.md: docs/GITHUBWORKFLOW.md:16: The replacement guidelines are incomplete …

docs/GITHUB_WORKFLOW.md:16: The replacement guidelines are incomplete and lack the specific procedures for checking the 'gate' status, which is the core requirement of the blocker issue.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/458#issuecomment-6384391952

**1 more item(s) from the parent, for the same task:**
- GITHUB_WORKFLOW.md: docs/GITHUBWORKFLOW.md:16: The new guidelines don't mention how to ve…: docs/GITHUB_WORKFLOW.md:16: The new guidelines don't mention how to verify that the 'gate' check is green on PRs #360, #330, and #308, which is the main acceptance criterion of the issue.

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

## Test Plan: GITHUB_WORKFLOW.md - Gate Status Verification

**Issue:** Incomplete replacement guidelines regarding 'gate' status verification.

**Goal:** Ensure PRs consistently pass the 'gate' check (specifically on #360, #330, #308).

**1. Test Case: Gate Check - PR #360**
   * **Name:** Gate Check - Successful
   * **Setup:** Create a new PR from `main` that includes changes impacting #360.
   * **Assertion:** Verify the 'gate' status is green.
   * **File:** `docs/GITHUB_WORKFLOW.md`

**2. Test Case: Gate Check - PR #330**
   * **Name:** Gate Check - Successful
   * **Setup:** Create a new PR from `main` that includes changes impacting #330.
   * **Assertion:** Verify the 'gate' status is green.
   * **File:** `docs/GITHUB_WORKFLOW.md`

**3. Test Case: Gate Check - PR #308**
   * **Name:** Gate Check - Successful
   * **Setup:** Create a new PR from `main` that includes changes impacting #308.
   * **Assertion:** Verify the 'gate' status is green.
   * **File:** `docs/GITHUB_WORKFLOW.md`

**4. Test Case: Gate Check - No Changes**
   * **Name:** Gate Check - No Impact
   * **Setup:** Create a new PR from `main` with no changes.
   * **Assertion:** Verify the 'gate' status is green (baseline).
   * **File:** `docs/GITHUB_WORKFLOW.md`

**5. Test Case: Gate Check - Invalid Change**
   * **Name:** Gate Check - Failure (Simulated)
   * **Setup:** Create a PR with changes that *would* cause a failure. (Requires manual intervention to simulate a failure).
   * **Assertion:** Verify the 'gate' status is *not* green.
   * **File:** `docs/GITHUB_WORKFLOW.md`

**6. Test Case: Gate Check - Branch Off Main**
    * **Name:** Gate Check - Fresh Branch
    * **Setup:** Create a new branch from `main`. Make a small change.
    * **Assertion:** Verify the 'gate' status is green.
    * **File:** `docs/GITHUB_WORKFLOW.md`

**7. Test Case: Gate Check - Documentation Update**
    * **Name:** Gate Check - Documentation Change
    * **Setup:** Update the `docs/GITHUB_WORKFLOW.md` file with a minor change (e.g., typo).
    * **Assertion:** Verify the 'gate' status remains green.
    * **File:** `docs/GITHUB_WORKFLOW.md`

**8. Test Case: Gate Check - PR with Large Changes**
    * **Name:** Gate Check - Large PR
    * **Setup:** Create a PR with a significant number of changes.
    * **Assertion:** Verify the 'gate' status is green.
    * **File:** `docs/GITHUB_WORKFLOW.md`

**Edge Cases:**  Large PRs, changes impacting multiple gate groups, potential for transient issues.  Focus on consistent green status across all specified PRs.
