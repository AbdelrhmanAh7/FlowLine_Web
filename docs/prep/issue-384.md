# Prep for #384: Follow-up from #383: non-blocking review findings

> Offline floor prep (2026-10-23T22:10Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=383 -->
Follow-up from #383 (Trend: Outbound guardrails: scoped node credentials, volume caps, approval gate (#165)).

P2/P3 findings from the reviewers. They do not block #383 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p2] src/i18n/messages/ar.json:1781: The Arabic translation for 'maxSendsPerMinuteHint' uses parentheses which may need to be mirrored in RTL layout for better visual consistency.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:978: The Arabic translation for 'outbound_capped' is accurate but could potentially be more descriptive if needed.

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

## Test Plan - Issue #384: Localization Review Follow-up

**Objective:** Verify localization review findings, specifically regarding Arabic translations.

**1. Parentheses RTL Consistency:**
   * **Name:** Arabic RTL Parentheses Check
   * **Setup:**  Run the application with Arabic locale enabled. Inspect `ar.json:1781`.
   * **Assertion:** Verify parentheses are mirrored correctly in the RTL layout.
   * **File:** `src/i18n/messages/ar.json`
   * **Edge Case:** Different screen resolutions.

**2. Outbound_capped Description:**
   * **Name:** Outbound_capped Description Review
   * **Setup:**  Review `ar.json:978`.
   * **Assertion:** Confirm the existing translation is sufficient or identify potential improvements.
   * **File:** `src/i18n/messages/ar.json`
   * **Edge Case:**  Future expansion of the feature – does the description remain relevant?

**3.  UI Localization Test (General):**
   * **Name:** UI Localization Display
   * **Setup:**  Run the application with Arabic locale.
   * **Assertion:** Verify all Arabic text is displayed correctly within the UI.
   * **File:**  All UI files (e.g., components, pages).
   * **Edge Case:**  Complex UI elements with nested text.

**4.  Data Validation (Arabic):**
   * **Name:** Arabic Data Integrity
   * **Setup:**  Simulate outbound requests with Arabic locale.
   * **Assertion:** Verify data is correctly translated and displayed in Arabic.
   * **File:**  Relevant API endpoints, UI components.

**5.  Regression Test (Existing Arabic):**
   * **Name:** Existing Arabic Functionality
   * **Setup:** Run existing tests with Arabic locale enabled.
   * **Assertion:** Ensure no regressions are introduced.
   * **File:** `tests/unit/demo-docs-commands.test.ts`, `tests/unit/docs-index.test.ts`
   * **Edge Case:**  Changes to related code impacting Arabic translations.
