# Prep for #347: Follow-up from #261: non-blocking review findings

> Offline floor prep (2026-10-23T08:52Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=261 -->
Follow-up from #261 (Account security page (1/4): page, menu link and read-only MFA status (#196)).

P2/P3 findings from the reviewers. They do not block #261 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p2] src/i18n/messages/ar.json:2398: The Arabic translation for 'twoFactor.on' uses parentheses 'مفعّل (نشط)' which is acceptable but could be simplified to 'مفعّل' for consistency with other status messages.
- Localization Reviewer: [p3] docs/implementation/BETA_USER_GUIDE.md:78: The documentation update uses a numbered list format that differs slightly from the existing style, though this is a minor inconsistency.

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

## Test Plan - Issue #347: FlowLine Web - Non-Blocking Review Findings

**Objective:** Verify Localization and Documentation changes from #261 and #347.

**1. Arabic Translation Consistency (ar.json):**
* **Name:** MFA Status - Arabic Consistency
* **Setup:** Deploy to staging.
* **Assertion:** Verify ‘twoFactor.on’ translation uses ‘مفعّل’ instead of ‘مفعّل (نشط)’.
* **File:** `src/i18n/messages/ar.json`
* **Edge Case:** Ensure other status messages also use ‘مفعّل’.

**2. Documentation Style Inconsistency:**
* **Name:** Documentation Formatting
* **Setup:** Deploy to staging.
* **Assertion:** Verify numbered list in `BETA_USER_GUIDE.md` aligns with existing style.
* **File:** `docs/implementation/BETA_USER_GUIDE.md`
* **Edge Case:** Check multiple sections for consistent formatting.

**3. Test Suite Coverage (Existing Tests):**
* **Name:** Docs Index Test
* **Setup:** Deploy to staging.
* **Assertion:** Verify `docs-index.test.ts` passes all existing tests.
* **File:** `tests/unit/docs-index.test.ts`

**4. Gate Workflow Verification:**
* **Name:** Gate Workflow Functionality
* **Setup:** Deploy to staging.
* **Assertion:** Verify the `gate.yml` workflow runs successfully.
* **File:** `.github/workflows/gate.yml`
* **Edge Case:** Trigger the workflow manually.

**5. Localization - Other Messages:**
* **Name:** General Localization Check
* **Setup:** Deploy to staging.
* **Assertion:** Verify all other localized strings are correct.
* **File:** `src/i18n/messages/*`
* **Edge Case:** Test with different locales.
