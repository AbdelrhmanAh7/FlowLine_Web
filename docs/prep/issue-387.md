# Prep for #387: Follow-up from #308: non-blocking review findings

> Offline floor prep (2026-10-24T03:46Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=308 -->
Follow-up from #308 (fix: qa finding: docs/implementation/PHASE4BETAREPORT.md, new 108 section: the report … (split from #214) (#303)).

P2/P3 findings from the reviewers. They do not block #308 and do not start a fix round; they are tracked here, one issue per PR.

- QA Second Opinion: [p2] docs/implementation/PHASE4_BETA_REPORT.md:139: The H3 paragraph now says `tests/integration/email-token-lock-order.test.ts` passed locally on 2026-10-08, but the same paragraph still says 'the other integration files were not run locally and CI runs them' right after the member-lock-order sentence, and later says sec-federated-mfa-regression was executed locally too. Since email-token-lock-order is one of those 'other integration files', the paragraph still gives readers two contradictory statuses for it, which is the exact class of inconsistency issue #303 asked to rem
- QA Second Opinion: [p2] docs/evidence/303/EVIDENCE.md:31: The 'Changed Covering Tests' section lists `tests/integration/federated-lock-order.test.ts`, `tests/integration/account-delete-sso-lock-order.test.ts` and `tests/integration/pg-lock-helpers.ts` as changed, but this PR only touches EVIDENCE.md, PHASE4_BETA_REPORT.md and the new unit test. Listing files that are not in the diff misleads reviewers validating the change; keep this section to files actually changed on this branch.
- QA Second Opinion: [p2] tests/unit/email-token-lock-order-docs.test.ts:14: The doc-wide negative assertion only rejects `not executed`/`unexecuted` when it appears in the same sentence as `email-token-lock-order` (`[^.\n]*?` stops at the first period) and does not cover 'not run locally' phrasing. A regressed doc saying '... email-token-lock-order.test.ts. It was not executed locally.' or 'email-token-lock-order.test.ts was not run locally' would pass, so the test does not fully guard the behaviour issue #303 is fixing. Add a section-level assertion for each location (as done for the H3 and Re

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

## Test Plan - Issue #387: Non-Blocking Review Findings

**Goal:** Verify identified inconsistencies and gaps in documentation related to #308 and #303.

**1. H3 Paragraph Consistency (PHASE4_BETA_REPORT.md:139)**
   * **Name:** Report Status Verification
   * **Setup:** Open PHASE4_BETA_REPORT.md.
   * **Assertion:** Verify the H3 paragraph consistently reports the execution status of `tests/integration/email-token-lock-order.test.ts` (passed locally, CI runs).
   * **Edge Case:** Ensure the paragraph accurately reflects the current state of the test.

**2. Changed Tests Listing (EVIDENCE.md:31)**
   * **Name:** Accurate Test File Listing
   * **Setup:** Open EVIDENCE.md.
   * **Assertion:** Verify the "Changed Covering Tests" section lists *only* files modified in this PR.
   * **Edge Case:**  Ensure no extraneous files are listed.

**3. Doc-Wide Negative Assertion (email-token-lock-order-docs.test.ts:14)**
   * **Name:** Assertion Coverage
   * **Setup:** Open email-token-lock-order-docs.test.ts.
   * **Assertion:** Verify the negative assertion correctly identifies "not executed" or "not run locally" phrasing.
   * **Edge Case:** Test with variations in phrasing (e.g., "was not run locally").

**4.  Re-test H3 Paragraph (PHASE4_BETA_REPORT.md:139)**
   * **Name:**  Re-verify H3 Paragraph
   * **Setup:**  Same as Case 1.
   * **Assertion:**  Confirm the H3 paragraph is consistent.

**5.  Verify Evidence File (EVIDENCE.md:31)**
    * **Name:** Evidence File Accuracy
    * **Setup:** Open EVIDENCE.md.
    * **Assertion:** Confirm the "Changed Covering Tests" section accurately reflects the changes.
    * **Edge Case:**  Check for any outdated or incorrect file names.

**6.  Test Assertion Coverage (email-token-lock-order-docs.test.ts:14)**
    * **Name:**  Full Assertion Coverage
    * **Setup:**  Same as Case 3.
    * **Assertion:**  Verify the test covers all relevant negative phrasing.
    * **Edge Case:**  Test with edge cases of phrasing.
