# Prep for #352: Follow-up from #136: non-blocking review findings

> Offline floor prep (2026-10-23T09:58Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=136 -->
Follow-up from #136 (Landing demo media (2/2): landing embed + walkthrough — hero loop, bento loops, 53 s walkthrough, reduced motion (#100)).

P2/P3 findings from the reviewers. They do not block #136 and do not start a fix round; they are tracked here, one issue per PR.

- QA Second Opinion: [p2] docs/evidence/100/EVIDENCE.md:19: This copy of the evidence says AC7's non-zero CLS is "Not an accepted deviation" and that owner sign-off is required, while artifacts/issue-100/EVIDENCE.md:21 and docs/landing/DEMO_MEDIA.md describe the same result as an "accepted deviation". Two committed evidence sets disagree about whether AC7 is waived; keep one canonical record with a single consistent verdict.
- QA Second Opinion: [p3] e2e-army/100-landing-demo.e2e.ts:8: The header comment states that reduced motion "cannot be emulated by the e2e-army web engine", but the test itself emulates it via addInitScript overriding window.matchMedia (lines 33-40). Correct the comment so maintainers are not misled into thinking AC2 is uncovered.

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

## Test Plan - Issue #352: Non-Blocking Review Findings

**Goal:** Verify and resolve discrepancies identified in the non-blocking review of #136.

**1. Evidence Discrepancy (Docs/Evidence/100/EVIDENCE.md):**
   * **Test Case:** Verify consistent CLS verdict for AC7.
   * **Setup:**  Review `docs/evidence/100/EVIDENCE.md` and `artifacts/issue-100/EVIDENCE.md`.
   * **Assertion:**  Ensure a single, canonical verdict for AC7's CLS is present across all evidence documents.
   * **File:** `docs/evidence/100/EVIDENCE.md`

**2. Reduced Motion Test (e2e-army/100-landing-demo.e2e.ts):**
   * **Test Case:** Validate the header comment accurately reflects test behavior.
   * **Setup:** Run `e2e-army/100-landing-demo.e2e.ts`. Observe the overridden `window.matchMedia` behavior.
   * **Assertion:**  The header comment should accurately state that reduced motion is emulated.
   * **File:** `e2e-army/100-landing-demo.e2e.ts`

**3.  General Landing Demo Functionality (Multiple Files):**
   * **Test Case:** Verify core demo loops function as expected.
   * **Setup:** Navigate to the landing demo page.
   * **Assertion:**  All hero loops, bento loops, and the 53s walkthrough function correctly.
   * **File:**  (Covered by existing tests: `tests/unit/demo-docs-commands.test.ts`, `tests/unit/docs-check-script.test.ts`, `tests/unit/docs-index.test.ts`)

**4. Edge Case - High Traffic Simulation (Existing Tests):**
   * **Test Case:**  Stress test the demo loops under simulated high traffic.
   * **Setup:**  Run existing load tests.
   * **Assertion:**  Demo loops remain responsive and functional.
   * **File:** (Existing load tests – `tests/unit/gate-groups.test.ts`, `tests/unit/gate-selection.test.ts`)

**5.  Configuration Verification (.coderabbit.yaml):**
    * **Test Case:** Verify the configuration file is correct.
    * **Setup:** Inspect the `.coderabbit.yaml` file.
    * **Assertion:**  All settings are valid and aligned with requirements.
    * **File:** `.coderabbit.yaml`
