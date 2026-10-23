# Prep for #346: Follow-up from #188: non-blocking review findings

> Offline floor prep (2026-10-23T08:29Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=188 -->
Follow-up from #188 (Field validation packet: fix the 2 scoring gaps in packet.json (VP-05/VP-06) (#142)).

P2/P3 findings from the reviewers. They do not block #188 and do not start a fix round; they are tracked here, one issue per PR.

- QA Engineer: [p2] artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run5-v2-c2b0541/RESULTS.md:1: This run is superseded by run 6 and 7, which provide more accurate scoring records for the fixed gaps. Run 5 was scored with an earlier version of the owner-decision rule.
- QA Engineer: [p2] artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run5-v2-c2b0541/RESULTS.md:37: VP-05's ownerDecision result is marked as superseded because it passed only due to the quoted policy line, which the current scorer would strip and fail.
- QA Engineer: [p2] artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run5-v2-c2b0541/RESULTS.md:41: VP-06's ownerDecision result is superseded for the same reason as VP-05 - it passed only due to the quoted policy line.
- QA Engineer: [p3] artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run5-v2-c2b0541/RESULTS.md:61: The run's VP-03 reply differs from run 4 (Arabic-only confirmation vs. price quote), but the cause is not investigated here (logged as VF-05 in BUGS.md).
- QA Engineer: [p3] artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run5-v2-c2b0541/RESULTS.md:65: Raw results.json is not committed, only attached to the PR, which follows the AGENTS.md evidence rule but may make verification harder.

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

## Test Plan - Issue #346: FlowLine Field Validation - Non-Blocking Review Findings

**Objective:** Verify findings related to superseded runs and VP-05/VP-06 scoring discrepancies.

**1. Run 6 & 7 Verification (RESULTS.md:1-37)**
* **Test Case:** Confirm VP-05/VP-06 scoring aligns with Run 6 & 7.
* **Setup:**  Load Run 6 & 7 data.
* **Assertion:**  Scoring values match Run 6 & 7.
* **File:** RESULTS.md

**2. Quoted Policy Line Validation (RESULTS.md:37, 41)**
* **Test Case:** Verify scorer correctly handles quoted policy lines.
* **Setup:**  Load Run 5 data.
* **Assertion:**  Scoring passes when policy line is quoted.
* **File:** RESULTS.md

**3. VP-03 Reply Discrepancy (RESULTS.md:61)**
* **Test Case:**  Confirm VP-03 reply difference.
* **Setup:** Load Run 5 data.
* **Assertion:**  VP-03 reply matches Run 4 (Arabic-only).
* **File:** RESULTS.md

**4. Raw Results.json Verification (RESULTS.md:65)**
* **Test Case:**  Verify attachment of raw results.json.
* **Setup:**  Load Run 5 data.
* **Assertion:**  raw.json is attached to PR.
* **File:** RESULTS.md

**5.  .coderabbit.yaml Validation**
* **Test Case:** Ensure .coderabbit.yaml file is present and valid.
* **Setup:** Review the file.
* **Assertion:** File exists and conforms to standards.
* **File:** .coderabbit.yaml

**Edge Cases:**
* Varying policy line lengths (quoted vs. unquoted).
* Different language confirmations (Arabic vs. Price Quote).
