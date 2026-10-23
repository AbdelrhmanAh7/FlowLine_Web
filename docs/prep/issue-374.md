# Prep for #374: fix: 117-flows-list-dashboard.e2e.ts: blocker (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC1): … (split fro…

> Offline floor prep (2026-10-23T19:54Z): capacity 0 — agy: agy daily code budget (150) used; agy-med: agy daily code budget (150) used; agy-low: agy daily code budget (150) used; agy-pro: agy daily code budget (150) used. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#362 item=finding:863f2f089a0a -->
Split from PR #362 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/362), which reached the fix-round cap (6/6) without going green. Parent issue: #295.

### Scope (one item)
- 117-flows-list-dashboard.e2e.ts: blocker (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC1): …

**blocker** (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC1): the test only checks that the steps render. It never edits the Shape step, saves or autosaves, or reopens the flow to confirm the change persisted, so the issue's "editable graph" criterion is unproven.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/362#discussion_r4337196663

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #362". Keep the change small; do not reuse the parent branch `ai/295`.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.github/actions/gate-report/action.yml`
- `.github/workflows/claude.yml`
- `.gitignore`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `CLAUDE.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/template-actions.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: 117-flows-list-dashboard.e2e.ts - Editable Graph Verification

**Issue:** Blocker - Test lacks persistence verification.

**Goal:** Ensure the test accurately validates the "editable graph" functionality.

**Test Cases:**

1.  **Create Flow & Edit:**
    *   Setup: Create a simple flow with a shape.
    *   Action: Modify the shape’s properties.
    *   Assertion: Verify the shape’s properties are updated visually. File: `117-flows-list-dashboard.e2e.ts`
2.  **Save Flow:**
    *   Setup: Same as above.
    *   Action: Explicitly save the flow.
    *   Assertion: Verify the shape’s properties remain updated after save. File: `117-flows-list-dashboard.e2e.ts`
3.  **Autosave Flow:**
    *   Setup: Same as above.
    *   Action: Make a minor edit, trigger autosave.
    *   Assertion: Verify the shape’s properties remain updated after autosave. File: `117-flows-list-dashboard.e2e.ts`
4.  **Reopen Flow:**
    *   Setup: Save flow as above.
    *   Action: Reopen the flow.
    *   Assertion: Verify the shape’s properties remain updated after reopening. File: `117-flows-list-dashboard.e2e.ts`
5.  **Edge Case - Complex Shape:**
    *   Setup: Create a flow with a complex shape (multiple inputs, connections).
    *   Action: Edit the complex shape.
    *   Assertion: Verify all shape properties are updated correctly. File: `117-flows-list-dashboard.e2e.ts`
6. **Edge Case - Large Edit:**
    * Setup: Create a flow with a shape.
    * Action: Make a large change to the shape's properties.
    * Assertion: Verify the shape's properties are updated correctly. File: `117-flows-list-dashboard.e2e.ts`

**Notes:**  Focus on robustly testing save/autosave functionality.  Consider adding a retry mechanism to the test if persistence fails.  Monitor Claude’s output for potential issues.
