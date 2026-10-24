# Prep for #431: Follow-up from #427: non-blocking review findings

> Offline floor prep (2026-10-24T13:26Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=427 -->
Follow-up from #427 ([blocker] check "verify" is red on 5 PRs (one shared cause?) (#335)).

P2/P3 findings from the reviewers. They do not block #427 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p2] docs/evidence/335/EVIDENCE.md:81: The evidence document is comprehensive and clearly explains the root cause of the failing 'verify' checks across multiple PRs.
- Localization Reviewer: [p3] tests/unit/ci-workflows.test.ts:531: Added test cases to ensure CI workflow preservation and no test bypassing, which is good practice.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`

## Existing tests nearby

- `tests/unit/demo-docs-commands.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan - Issue #431: Follow-up on Non-Blocking Review Findings

**Objective:** Verify the impact of the Localization Reviewer's P2/P3 findings and confirm the added test cases.

**1. CI Workflow Preservation (tests/unit/ci-workflows.test.ts):**

*   **Name:** CI Workflow Branching Test
*   **Setup:** Create a branch with a deliberate code change that *should* trigger a CI workflow.
*   **Assertion:** Verify the CI workflow runs successfully.
*   **Edge Case:** Simulate a failed CI step to ensure proper error handling.

**2. Test Bypassing Prevention (tests/unit/ci-workflows.test.ts):**

*   **Name:**  Test Case Coverage Check
*   **Setup:**  Modify the CI workflow configuration to intentionally bypass a test.
*   **Assertion:** Verify that the bypass is detected and reported.
*   **Edge Case:**  Attempt to bypass multiple tests simultaneously.

**3. Evidence Document Validation (docs/evidence/335/EVIDENCE.md):**

*   **Name:** Root Cause Clarity Test
*   **Setup:**  Review the EVIDENCE.md document.
*   **Assertion:**  Confirm the document clearly explains the 'verify' check failure root cause.
*   **Edge Case:**  Introduce a minor change to the failing code and re-verify the explanation's accuracy.

**4. New Test Case Coverage (tests/unit/docs-check-script.test.ts):**

*   **Name:**  Script Execution Test
*   **Setup:**  Run the docs-check-script.test.ts.
*   **Assertion:**  Verify the script executes without errors and produces the expected output.
*   **Edge Case:**  Provide invalid input to the script.

**5.  Configuration Validation (.coderabbit.yaml, .github workflows):**

*   **Name:**  Workflow Configuration Review
*   **Setup:** Inspect the YAML files.
*   **Assertion:** Verify configurations align with requirements.
*   **Edge Case:**  Introduce a syntax error in a YAML file.
