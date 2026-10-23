# Prep for #382: Follow-up from #381: non-blocking review findings

> Offline floor prep (2026-10-23T21:50Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=381 -->
Follow-up from #381 (fix: 117-flows-list-dashboard.e2e.ts: blocker (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC1): … (split fro… (#374)).

P2/P3 findings from the reviewers. They do not block #381 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p3] e2e-army/117-flows-list-dashboard.e2e.ts:153: RTL layout verification is included for the import dialog, checking proper Arabic text display and document direction.

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

## Test Plan - Issue #382: Localization Review Follow-up

**Objective:** Verify RTL layout and Arabic text display in the import dialog as identified in the localization review.

**1. RTL Layout Verification**
   * **Name:** Import Dialog RTL Test
   * **Setup:**  Navigate to the import dialog. Ensure Arabic language is selected.
   * **Assertion:** Document direction is correctly displayed as Right-to-Left.
   * **File:** `e2e-army/117-flows-list-dashboard.e2e.ts:153`
   * **Edge Case:** Test with different Arabic locales.

**2. Text Display Accuracy**
   * **Name:** Arabic Text Content Test
   * **Setup:**  Navigate to the import dialog.
   * **Assertion:** All Arabic text within the dialog is displayed correctly.
   * **File:** `e2e-army/117-flows-list-dashboard.e2e.ts:153`
   * **Edge Case:** Test with different font sizes.

**3.  Locale Switching Test**
    * **Name:** Locale Change Test
    * **Setup:**  Navigate to import dialog, switch to different Arabic locales.
    * **Assertion:** Layout and text direction adapt correctly.
    * **File:** `e2e-army/117-flows-list-dashboard.e2e.ts:153`
    * **Edge Case:** Test with less common Arabic locales.

**4.  UI Element Alignment**
    * **Name:** UI Element Alignment Test
    * **Setup:**  Inspect UI elements within the import dialog.
    * **Assertion:** All UI elements are correctly aligned according to RTL layout.
    * **File:** `e2e-army/117-flows-list-dashboard.e2e.ts:153`
    * **Edge Case:** Test with different screen resolutions.

**5.  Performance Test (Basic)**
    * **Name:** Import Dialog Load Time
    * **Setup:**  Navigate to the import dialog.
    * **Assertion:** Import dialog loads within acceptable time.
    * **File:** `e2e-army/117-flows-list-dashboard.e2e.ts:153`
    * **Edge Case:** Simulate network latency.
