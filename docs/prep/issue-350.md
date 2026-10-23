# Prep for #350: Follow-up from #291: non-blocking review findings

> Offline floor prep (2026-10-23T09:10Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=291 -->
Follow-up from #291 (Account security page (2/4): enable MFA with secret, backup codes and code check (#197)).

P2/P3 findings from the reviewers. They do not block #291 and do not start a fix round; they are tracked here, one issue per PR.

- QA Engineer: [p2] docs/implementation/BETA_USER_GUIDE.md:41: The Arabic translation for the two-factor verification section uses a long dash (—) in 'Backup codes — shown only once', which might not be consistent with typical Arabic punctuation.
- Localization Reviewer: [p2] docs/implementation/BETA_USER_GUIDE.md:40: The Arabic documentation uses a dash (—) in the backup codes warning. Consider using a regular hyphen (-) for consistency with standard Arabic typography.

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

## Test Plan: Issue #350 - MFA Arabic Translation

**Objective:** Verify Arabic translation consistency and punctuation in MFA documentation.

**1. Doc Translation Punctuation Check**
   * **Name:** Arabic Hyphen Consistency - Backup Codes
   * **Setup:**  Review `docs/implementation/BETA_USER_GUIDE.md:40, 41`
   * **Assertion:** Verify use of standard hyphen (-) instead of long dash (—) for backup codes.
   * **File:** `docs/implementation/BETA_USER_GUIDE.md`

**2.  Hyphen Consistency - Backup Codes (Edge Case)**
   * **Name:** Backup Codes - Multiple Instances
   * **Setup:**  Search entire `docs/implementation/BETA_USER_GUIDE.md` for "Backup codes"
   * **Assertion:** Confirm consistent hyphen usage across all instances.
   * **File:** `docs/implementation/BETA_USER_GUIDE.md`

**3.  Reviewer Feedback - Documentation Style**
   * **Name:** Style Guide Adherence - Backup Codes
   * **Setup:**  Inspect `docs/implementation/BETA_USER_GUIDE.md:40, 41` for adherence to standard Arabic typography.
   * **Assertion:** Verify the documentation aligns with recommended Arabic typography guidelines.
   * **File:** `docs/implementation/BETA_USER_GUIDE.md`

**4.  .coderabbit.yaml Review**
   * **Name:** YAML Configuration - MFA
   * **Setup:** Examine `.coderabbit.yaml` for any related MFA configuration settings.
   * **Assertion:** Ensure no inconsistencies in MFA settings reflected in the YAML.
   * **File:** `.coderabbit.yaml`

**5.  Documentation Workflow Verification**
   * **Name:** PR Template Review
   * **Setup:** Review `.github/pull_request_template.md` for relevant MFA information.
   * **Assertion:** Template includes information related to MFA and Arabic translations.
   * **File:** `.github/pull_request_template.md`

**6.  Workflow Configuration Review**
   * **Name:** CI/CD Workflow - Documentation
   * **Setup:** Review `.github/workflows/*` for documentation build and deployment processes.
   * **Assertion:** Ensure documentation builds and deployments are consistent with the Arabic translation.
   * **File:** `.github/workflows/*`
