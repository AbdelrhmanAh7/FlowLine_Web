# Prep for #345: Follow-up from #139: non-blocking review findings

> Offline floor prep (2026-10-23T08:08Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=139 -->
Follow-up from #139 ([e2e] Flows list and dashboard failing on main (#117)).

P2/P3 findings from the reviewers. They do not block #139 and do not start a fix round; they are tracked here, one issue per PR.

- QA Engineer: [p2] src/app/w/[slug]/flows/dashboard.tsx:121: The Dashboard button is added with `className="text-xs"` which makes it smaller than other navigation items. Consider using a consistent size with other navigation elements for better UI consistency.
- QA Engineer: [p3] src/app/w/[slug]/flows/dashboard.tsx:234: The `runCount` display uses both `data-testid="runCount"` and `data-testid-alt="run-count"`. Using multiple test IDs for the same element is confusing and unnecessary; prefer a single, consistent test ID.

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

## Test Plan - Issue #345: FlowLine Web - Dashboard UI Consistency

**Objective:** Verify and address UI inconsistencies identified in the dashboard regarding button size and test ID usage.

**1. Button Size Consistency:**

*   **Test Case:** Verify Dashboard button size.
    *   **Setup:** Navigate to the Flows dashboard.
    *   **Assertion:** Button size matches other navigation elements (e.g., using a visual comparison tool).
    *   **File:** `src/app/w/[slug]/flows/dashboard.tsx:121`
    *   **Edge Case:** Different browser resolutions.

**2. Test ID Consistency:**

*   **Test Case:** Verify single test ID usage.
    *   **Setup:** Navigate to the Flows dashboard.
    *   **Assertion:** `runCount` uses only one `data-testid` (e.g., `data-testid="runCount"`).
    *   **File:** `src/app/w/[slug]/flows/dashboard.tsx:234`
    *   **Edge Case:**  Different data-testid values.

**3. Navigation Element Size Comparison**
*   **Test Case:** Compare sizes of all navigation elements.
    *   **Setup:** Navigate to the Flows dashboard.
    *   **Assertion:** All navigation elements have the same size.
    *   **File:** `src/app/w/[slug]/flows/dashboard.tsx:121`
    *   **Edge Case:** Different browser resolutions.

**4. Test ID Validation**
*   **Test Case:** Validate the test ID usage.
    *   **Setup:** Navigate to the Flows dashboard.
    *   **Assertion:** `runCount` uses only one `data-testid` (e.g., `data-testid="runCount"`).
    *   **File:** `src/app/w/[slug]/flows/dashboard.tsx:234`
    *   **Edge Case:**  Different data-testid values.

**5. Regression Test (Size)**
*   **Test Case:** Verify the size of the dashboard button after the fix.
    *   **Setup:** Run existing tests.
    *   **Assertion:** The button size is consistent with other navigation elements.
    *   **File:** `src/app/w/[slug]/flows/dashboard.tsx:121`
    *   **Edge Case:**  Different browser resolutions.
