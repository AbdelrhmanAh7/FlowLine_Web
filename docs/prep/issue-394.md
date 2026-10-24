# Prep for #394: Follow-up from #321: non-blocking review findings

> Offline floor prep (2026-10-24T06:24Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=321 -->
Follow-up from #321 (fix: qa finding: docs/implementation/PHASE4BETAREPORT.md, new 108 section: the fix is … (split from #214) (#315)).

P2/P3 findings from the reviewers. They do not block #321 and do not start a fix round; they are tracked here, one issue per PR.

- QA Second Opinion: [p2] artifacts/summary.md:1: This is an unrelated agent scratch file ("No prior conversation to summarize", all sections empty, unclosed ```markdown fence) added at the repo root. It is not part of the #315 fix and should be removed from the PR.
- QA Second Opinion: [p2] tests/unit/account-delete-lock-order-docs.test.ts:92: The AC5 test only asserts that EVIDENCE.md contains the strings "AC5", the QA comment URL and "b9ae3ee", so it passes with the mislabeled citation in docs/evidence/315/EVIDENCE.md and actively locks in the wrong URL as evidence. It does not verify any CTO decision, and it will give false assurance on the unresolved #108 acceptance criterion.
- QA Second Opinion: [p2] docs/evidence/315/EVIDENCE.md:35: The "Regression on base" row reports exit 1 because the test did not exist on base. A non-existent test always "fails", so this does not demonstrate that the new assertions detect the bad attribution. Either show the new test's assertions failing against the base docs (where the deadlock was credited to #109) or drop the row.

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

## Test Plan - Issue #394: Follow-up on #321

**Goal:** Verify and address the QA findings outlined in #394.

**1. Artifact Removal:**
   * **Test Case:** Remove `artifacts/summary.md`
      * **Setup:** Clone PR.
      * **Assertion:** File is absent after removal.
      * **File:** `artifacts/summary.md`

**2. AC5 Test Validation:**
   * **Test Case:** Verify AC5 test logic.
      * **Setup:**  Run `tests/unit/account-delete-lock-order-docs.test.ts`.
      * **Assertion:**  AC5 test fails with the mislabeled citation, demonstrating the flawed assertion.
      * **File:** `tests/unit/account-delete-lock-order-docs.test.ts`

**3. EVIDENCE.md Regression Row:**
   * **Test Case:** Validate Regression on base row.
      * **Setup:** Run `tests/unit/account-delete-lock-order-docs.test.ts`.
      * **Assertion:** The row reports exit 1 due to the non-existent test.
      * **File:** `docs/evidence/315/EVIDENCE.md`

**4.  Evidence Citation Verification:**
   * **Test Case:** Verify correct evidence citation.
      * **Setup:** Inspect `docs/evidence/315/EVIDENCE.md`.
      * **Assertion:**  Correct citation is present and active.
      * **File:** `docs/evidence/315/EVIDENCE.md`

**5. Gate Group Test Coverage:**
   * **Test Case:** Ensure gate group tests remain functional.
      * **Setup:** Run `tests/unit/gate-groups.test.ts`.
      * **Assertion:** All assertions pass.
      * **File:** `tests/unit/gate-groups.test.ts`

**Edge Cases:**
*   Different base branches.
*   Variations in documentation content.
