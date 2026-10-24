# Prep for #439: Follow-up from #438: non-blocking review findings

> Offline floor prep (2026-10-24T14:48Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=438 -->
Follow-up from #438 (Follow-up from #366: non-blocking review findings (#370)).

P2/P3 findings from the reviewers. They do not block #438 and do not start a fix round; they are tracked here, one issue per PR.

- QA Engineer: [p2] e2e-army/147-mizano-create-customer-and-quote.e2e.ts:37: The test now uses a diacritic-resilient regex pattern for Arabic text with optional shaddah (U+0651) to ensure cross-platform compatibility across different font renderers and headless CI environments.
- QA Engineer: [p3] docs/evidence/364/EVIDENCE.md:19: Updated Arabic text to normalized canonical form without combining diacritic for consistency with the actual implementation.
- QA Second Opinion: [p2] docs/evidence/370/EVIDENCE.md:17: The evidence claims `Line 51 (agent.assert): ... "(regex pattern in agent assertion)"` and AC1 (line 7) claims both line 51 and 54 use a diacritic-resilient regex, but line 51 is a quoted string with a literal `?`, not a regex. The verification evidence therefore overstates what the test verifies and will mislead future reviewers into believing AC1 is met.
- QA Second Opinion: [p3] docs/evidence/370/EVIDENCE.md:49: The Diff Summary reports `2 files changed, 3 insertions(+), 3 deletions(-)`, but the PR also adds this new 67-line `docs/evidence/370/EVIDENCE.md` file (3 files changed). Update the summary so the evidence accurately reflects the diff.
- Localization Reviewer: [p2] docs/evidence/364/EVIDENCE.md:19: The Arabic text has been normalized to remove the shaddah (ّ) diacritic mark for consistency across systems.
- Localization Reviewer: [p2] e2e-army/147-mizano-create-customer-and-quote.e2e.ts:51: Updated to use a diacritic-tolerant regex pattern for Arabic text matching to handle optional shaddah (ّ) character.
- Localization Reviewer: [p2] e2e-army/147-mizano-create-customer-and-quote.e2e.ts:54: Updated to use a diacritic-tolerant regex pattern for Arabic text matching to handle optional shaddah (ّ) character.

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

## Test Plan - Issue #439: Non-Blocking Review Findings

**Objective:** Verify fixes related to Arabic text normalization and regex patterns across documentation and tests.

**1. e2e-army/147-mizano-create-customer-and-quote.e2e.ts:**
   * **Test Case:** Regex Match Arabic with Shaddah - Setup: Create customer with Arabic name. Assertion: Verify regex correctly matches name with optional shaddah. (File: e2e-army/147-mizano-create-customer-and-quote.e2e.ts:51, 54) - Edge Case: Shaddah absent.
   * **Test Case:** Regex Match Arabic without Shaddah - Setup: Create customer with Arabic name. Assertion: Verify regex correctly matches name without shaddah. (File: e2e-army/147-mizano-create-customer-and-quote.e2e.ts:37) - Edge Case: Shaddah present.

**2. docs/evidence/364/EVIDENCE.md & 370/EVIDENCE.md:**
   * **Test Case:** Evidence Text Consistency - Setup: Review evidence files. Assertion: Verify normalized Arabic text and regex patterns align with implementation. (Files: 364/EVIDENCE.md, 370/EVIDENCE.md) - Edge Case: Discrepancy in regex usage.

**3. Regression Test (General):**
   * **Test Case:** Arabic Name Creation - Setup: Create customer with various Arabic names (with and without shaddah). Assertion: Verify the system correctly handles Arabic names and avoids errors. (File: tests/unit/demo-docs-commands.test.ts) - Edge Case: Extremely long Arabic name.

**4. Documentation Review:**
   * **Test Case:**  Text Normalization Verification - Setup: Inspect EVIDENCE.md files. Assertion: Verify normalized Arabic text is consistent across all files. (Files: EVIDENCE.md) - Edge Case: Inconsistent normalization across different sections.

**Priority:** High – Directly addresses non-blocking review findings.
