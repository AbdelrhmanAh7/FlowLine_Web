# Prep for #363: Follow-up from #359: non-blocking review findings

> Offline floor prep (2026-10-23T18:19Z): capacity 0 — agy: agy daily code budget (150) used; agy-med: agy daily code budget (150) used; agy-low: agy daily code budget (150) used; agy-pro: agy daily code budget (150) used. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=359 -->
Follow-up from #359 (Fresh restart of #197: Account security page (2/4): enable MFA with secret, backup codes and code check (replaces #259) (#304)).

P2/P3 findings from the reviewers. They do not block #359 and do not start a fix round; they are tracked here, one issue per PR.

- QA Second Opinion: [p3] e2e-army/72-federated-mfa-failure-audit.e2e.ts:85: Tests assert the literal English string "Off" while carrying feat:fl-i18n-rtl tags; this ties the assertions to the default locale and provides no translated/RTL label coverage. Use a stable test id/attribute or a locale-aware assertion.

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

## Test Plan: Issue #363 - MFA Locale Assertion

**Objective:** Verify and address the reviewer's P2/P3 finding regarding the "Off" string assertion in `e2e-army/72-federated-mfa-failure-audit.e2e.ts`.

**1. Test Case: Locale-Aware Assertion - English**
   * **Name:** English MFA Failure - Locale Assertion
   * **Setup:**  Run the test case with English locale enabled.
   * **Assertion:** Verify the UI displays "Off" correctly, but also confirms the presence of `feat:fl-i18n-rtl` tags.
   * **File:** `e2e-army/72-federated-mfa-failure-audit.e2e.ts`
   * **Edge Case:** Verify the test passes with different browser locales.

**2. Test Case: RTL Locale Assertion - Arabic**
   * **Name:** RTL MFA Failure - Locale Assertion
   * **Setup:** Run the test case with Arabic locale enabled.
   * **Assertion:** Verify the UI displays the translated/RTL version of "Off" (e.g., "خارج").
   * **File:** `e2e-army/72-federated-mfa-failure-audit.e2e.ts`
   * **Edge Case:** Verify the test passes with different browser locales.

**3. Test Case: Stable Test ID Assertion**
   * **Name:** Stable ID Assertion
   * **Setup:** Modify the test to use a stable test ID attribute instead of a literal string.
   * **Assertion:** Verify the test passes with the new stable ID.
   * **File:** `e2e-army/72-federated-mfa-failure-audit.e2e.ts`

**4. Test Case:  Default Locale Override**
   * **Name:** Default Locale Override
   * **Setup:**  Ensure the default locale is set to English.
   * **Assertion:** Verify the assertion still fails.
   * **File:** `e2e-army/72-federated-mfa-failure-audit.e2e.ts`

**5. Test Case:  RTL Locale Override**
   * **Name:** RTL Locale Override
   * **Setup:** Ensure the default locale is set to Arabic.
   * **Assertion:** Verify the assertion still fails.
   * **File:** `e2e-army/72-federated-mfa-failure-audit.e2e.ts`

**6. Regression Test:** Verify existing tests related to MFA functionality still pass.
   * **File:** `tests/unit/demo-docs-commands.test.ts`, `tests/unit/docs-check-script.test.ts` etc.
