# Prep for #351: Fresh restart of #117: [e2e] Flows list and dashboard failing on main (replaces #139)

> Offline floor prep (2026-10-23T09:30Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-restart pr=AbdelrhmanAh7/FlowLine_Web#139 issue=117 -->
PR #139 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/139) for issue #117 reached the fix-round cap without going green: 43 open finding(s), 11 day(s) old, fix rounds 6/6. Splitting it would not help, so the task starts again.

### Scope
Implement issue #117 as written, from the current default branch, on a NEW branch (never `ai/117`; do not cherry-pick it wholesale).

What the reviewers flagged on the old attempt (avoid repeating it):
- qa finding: e2e-army/117-flows-list-dashboard.e2e.ts (AC1 assertion, publishedVer…
- qa finding: AIQUESTIONS.md ('Done on this branch'): states the test 'has not been…
- AI_QUESTIONS.md: AIQUESTIONS.md: the Fix-review section asks to change 'Closes 117' to…
- qa finding: AIQUESTIONS.md is a decision-request note committed to the repo root …
- qa finding: e2e-army/117-flows-list-dashboard.e2e.ts (rows.map(updatedAt) orderin…
- qa finding: src/db/schema.ts likely still defines flowversion.version as non‑null…

### Done when
- the acceptance criteria of #117 pass on the new branch, with tests;
- the PR body says "Closes #117" and "Supersedes #139"; keep the change as small as the issue allows.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/ci/env.test.template`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/demo-docs-commands.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan - Issue #351: Flows List & Dashboard Fix

**Goal:** Verify successful implementation of #117 on a new branch, addressing identified issues.

**1. Flows List Display:**
   * **Name:** Flows List - Basic Display
   * **Setup:** Deploy new branch. Navigate to Flows List.
   * **Assertion:** All flows are displayed correctly with expected data.
   * **File:** `e2e-army/117-flows-list-dashboard.e2e.ts`
   * **Edge Case:** Empty flows list.

**2. Dashboard Functionality:**
   * **Name:** Dashboard - Data Refresh
   * **Setup:** Deploy new branch. Navigate to Dashboard. Trigger data refresh.
   * **Assertion:** Dashboard data updates correctly.
   * **File:** `e2e-army/117-flows-list-dashboard.e2e.ts`
   * **Edge Case:** Network connectivity issues during refresh.

**3. Flow Version Validation:**
   * **Name:** Flow Version - Null Check
   * **Setup:** Deploy new branch. Inspect flow details.
   * **Assertion:** `flowversion.version` is correctly defined as non-null in `src/db/schema.ts`.
   * **File:** `src/db/schema.ts`
   * **Edge Case:**  Schema update not reflected in the database.

**4. AI Questions Verification:**
   * **Name:** AI Questions - Decision Request
   * **Setup:** Deploy new branch. Review `AIQUESTIONS.md`.
   * **Assertion:**  "Closes #117" is correctly stated.
   * **File:** `AIQUESTIONS.md`

**5. Row Ordering Test:**
   * **Name:** Row Ordering - Sort Stability
   * **Setup:** Deploy new branch. Navigate to Flows List.
   * **Assertion:** Flows are consistently sorted by `updatedAt`.
   * **File:** `e2e-army/117-flows-list-dashboard.e2e.ts`
   * **Edge Case:**  Large number of flows.

**6.  QA Finding - AC1 Assertion:**
   * **Name:** AC1 Assertion - Data Accuracy
   * **Setup:** Deploy new branch. Navigate to Flows List.
   * **Assertion:** Verify data displayed matches expected values.
   * **File:** `e2e-army/117-flows-list-dashboard.e2e.ts`

**7.  QA Finding - Webkit Environment:**
   * **Name:** Webkit Environment - Browser Compatibility
   * **Setup:** Deploy new branch. Navigate to Flows List.
   * **Assertion:** Flows List renders correctly in the specified Webkit environment.
   * **File:** `e2e/tools/webkit-env.mjs`
