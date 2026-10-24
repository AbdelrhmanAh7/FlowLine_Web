# Prep for #444: Follow-up from #440: non-blocking review findings

> Offline floor prep (2026-10-24T17:28Z): capacity 0 — claude: claude failed 3× in a row (skipped for 12 min); codex: codex pacing: not enough room for a coding run (~1; agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=440 -->
Follow-up from #440 (fix: 147-mizano-create-customer-and-quote.e2e.ts: e2e-army/147-mizano-create-customer-and-quote.e2e.ts:96: The test exp… (#421)).

P2/P3 findings from the reviewers. They do not block #440 and do not start a fix round; they are tracked here, one issue per PR.

- QA Second Opinion: [p2] src/engine/design-templates.ts:236: The node is labelled "Deal won?" but the condition is `deal.value > 0`, which does not check whether the deal is won. A won deal with a zero (or missing) value, e.g. a comped/free deal, is routed to the `skipped` "Deal not won" branch and no quote is created. Either test the actual won/status field from the trigger payload or rename/repurpose the branch so the semantics match.
- QA Second Opinion: [p2] e2e-army/147-mizano-create-customer-and-quote.e2e.ts:149: The new AC3 test only asserts the flow name and the canvas label after clicking "Use template"; it never verifies the created graph (edges, trigger, approval flag) or that the prepare step produces the expected output. This is why the double-nested `prepare` config slips through and the template can be broken at runtime while the test stays green. Assert the node/edge structure and the `requireApproval` gate (or run the flow) so the template's behaviour is actually covered.

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

## Test Plan - Issue #444: FlowLine Web - Non-Blocking Review Findings

**Objective:** Verify fixes related to design template routing and test coverage.

**1. Design Template Routing (src/engine/design-templates.ts:236)**

*   **Test Case:** Won Deal Zero Value
    *   **Setup:** Trigger flow with a won deal (status: "Won") and value of 0.
    *   **Assertion:** Verify quote creation is blocked/skipped as per the "Deal not won" branch.
    *   **File:** src/engine/design-templates.ts
*   **Test Case:** Rename/Repurpose Branch
    *   **Setup:** Trigger flow with a won deal (status: "Won") and value of 0.
    *   **Assertion:** Verify the branch name/semantics are updated to reflect the won deal status.
    *   **File:** src/engine/design-templates.ts

**2. e2e Test Coverage (e2e-army/147-mizano-create-customer-and-quote.e2e.ts:149)**

*   **Test Case:** Verify Graph Structure
    *   **Setup:** Run the AC3 test (using template).
    *   **Assertion:** Assert the created graph’s node/edge structure, trigger, and approval flag.
    *   **File:** e2e-army/147-mizano-create-customer-and-quote.e2e.ts
*   **Test Case:** Verify `requireApproval` Gate
    *   **Setup:** Run the AC3 test.
    *   **Assertion:** Verify the `requireApproval` gate is correctly evaluated (or flow runs).
    *   **File:** e2e-army/147-mizano-create-customer-and-quote.e2e.ts

**3. Edge Cases (General)**

*   **Test Case:** Missing Trigger Payload
    *   **Setup:** Trigger flow without a trigger payload.
    *   **Assertion:** Verify the flow handles the missing payload gracefully.
    *   **File:**  (Dependent on trigger mechanism - investigate)
*   **Test Case:** Invalid Template Configuration
    *   **Setup:**  Use a corrupted or invalid template configuration.
    *   **Assertion:** Verify the system throws an appropriate error.
    *   **File:** src/engine/design-templates.ts (Configuration parsing)
