# Prep for #405: fix: qa finding: Documentation for account security page has been added in docs/securi… (split from #327)

> Offline floor prep (2026-10-24T08:30Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#327 item=finding:d7428e368701 -->
Split from PR #327 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/327), which reached the fix-round cap (6/6) without going green. Parent issue: #318.

### Scope (one item)
- qa finding: Documentation for account security page has been added in docs/securi…

Documentation for account security page has been added in docs/security/ACCOUNT_SECURITY.md and referenced in docs/README.md

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/327#issuecomment-6282577680

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #327". Keep the change small; do not reuse the parent branch `ai/318`.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.env.example`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/gate.yml`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`

## Existing tests nearby

- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Account Security Documentation Fix (#405)

**Objective:** Verify the addition of account security documentation and its correct referencing.

**1. Documentation Verification:**
   * **Test Case:** Verify `ACCOUNT_SECURITY.md` exists and contains relevant security information.
      * **Setup:** Clone repository.
      * **Assertion:** File exists at `docs/security/ACCOUNT_SECURITY.md`. Content review for key security topics.
      * **File:** `docs/security/ACCOUNT_SECURITY.md`
   * **Test Case:** Verify `README.md` references `ACCOUNT_SECURITY.md`.
      * **Setup:** Clone repository.
      * **Assertion:** `README.md` contains a link to `docs/security/ACCOUNT_SECURITY.md`.
      * **File:** `docs/README.md`

**2. Reference Integrity:**
   * **Test Case:** Verify the link in `README.md` is functional.
      * **Setup:** Clone repository.
      * **Assertion:** Clicking the link in `README.md` navigates to `docs/security/ACCOUNT_SECURITY.md`.
      * **File:** `docs/README.md`

**3. Edge Cases:**
   * **Test Case:** Verify the documentation is accessible via the website (manual check).
      * **Setup:** Deploy a test environment.
      * **Assertion:** The account security page is accessible and displays the added documentation.
      * **File:** N/A (Manual Verification)

**Total Test Cases: 3**
