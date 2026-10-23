# Prep for #357: Fresh restart of #100: Landing demo media (2/2): landing embed + walkthrough — hero loop, bento loops, 53 s walkthrough…

> Offline floor prep (2026-10-23T15:33Z): capacity 0 — agy: agy: every pool account is out of quota (current l; agy-med: agy: every pool account is out of quota (current l; agy-low: agy: every pool account is out of quota (current l; agy-pro: agy: every pool account is out of quota (current l. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-restart pr=AbdelrhmanAh7/FlowLine_Web#136 issue=100 -->
PR #136 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/136) for issue #100 reached the fix-round cap without going green: 33 open finding(s), 11 day(s) old, fix rounds 6/6. Splitting it would not help, so the task starts again.

### Scope
Implement issue #100 as written, from the current default branch, on a NEW branch (never `ai/100`; do not cherry-pick it wholesale).

What the reviewers flagged on the old attempt (avoid repeating it):
- qa finding: AIQUESTIONS.md / artifacts/issue-100/EVIDENCE.md: Playwright executed…
- EVIDENCE.md: artifacts/issue-100/EVIDENCE.md: the AC table says 'browser specs run…
- qa finding: docs/landing/DEMOMEDIA.md and docs/implementation/PHASE4BETAREPORT.md…
- AI_QUESTIONS.md: AIQUESTIONS.md: the author states the diff is 2,193 added lines again…
- 100-landing-demo.e2e.ts: e2e-army/100-landing-demo.e2e.ts: the issue asks for e2e-army/96-land…
- qa finding: In src/i18n/messages/ar.json, all Arabic strings are correctly transl…

### Done when
- the acceptance criteria of #100 pass on the new branch, with tests;
- the PR body says "Closes #100" and "Supersedes #136"; keep the change as small as the issue allows.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/ci/env.test.template`
- `.gitignore`
- `AI_QUESTIONS.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/BRIEF.md`

## Existing tests nearby

- `e2e/tools/webkit-env.mjs`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan - Issue #100: Landing Demo Media

**Goal:** Verify the landing demo media functionality (hero loop, bento loops, 53s walkthrough) works as expected.

**1. Hero Loop Verification**
   * **Name:** Hero Loop Display
   * **Setup:** Deploy PR #136 to a staging environment.
   * **Assertion:** Verify the hero loop images and text are displayed correctly in the browser.
   * **File:** `docs/landing/DEMOMEDIA.md` (visual inspection)

**2. Bento Loops Functionality**
   * **Name:** Bento Loop Playback
   * **Setup:** Navigate to the bento loops section.
   * **Assertion:** Verify the bento loops play seamlessly without errors.
   * **File:** `e2e/tools/webkit-env.mjs` (playback verification)

**3. 53s Walkthrough Test**
   * **Name:** Walkthrough Duration
   * **Setup:** Start the 53s walkthrough.
   * **Assertion:** Verify the walkthrough completes within 53 seconds.
   * **File:** `e2e-army/100-landing-demo.e2e.ts` (timing verification)

**4. Arabic String Localization (Edge Case)**
   * **Name:** Arabic String Display
   * **Setup:** Navigate to the landing page in Arabic.
   * **Assertion:** Verify all Arabic strings are correctly translated and displayed.
   * **File:** `src/i18n/messages/ar.json` (localization verification)

**5.  E2E Test Suite Regression**
   * **Name:** E2E Test Suite Run
   * **Setup:** Run the entire E2E test suite.
   * **Assertion:** All tests pass.
   * **File:** `e2e-army/100-landing-demo.e2e.ts` (regression testing)

**6. Browser Compatibility (Edge Case)**
   * **Name:** Chrome QA Report
   * **Setup:** Review the Chrome QA report (artifacts/ai-hub/chrome-qa-756d69c/REPORT.md)
   * **Assertion:** Verify no critical or major issues are reported.
   * **File:** `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md` (browser compatibility)
