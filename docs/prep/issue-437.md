# Prep for #437: Follow-up from #436: non-blocking review findings

> Offline floor prep (2026-10-24T14:28Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=436 -->
Follow-up from #436 (Follow-up from #334: non-blocking review findings (#340)).

P2/P3 findings from the reviewers. They do not block #436 and do not start a fix round; they are tracked here, one issue per PR.

- QA Second Opinion: [p2] tests/unit/i18n.test.ts:191: The new guard `no local template titles contain misplaced left-pointing arrows (←)` applies a one-off P3 styling finding as a repo-wide invariant over every entry in `ar.localTemplates`. In RTL source text a `←` is not inherently misplaced (Unicode bidi mirrors U+2190 to U+2192, so `←` is what renders a right-pointing glyph), so a future template that intentionally needs a leftwards arrow in source would fail this test without any behavioural regression. Scope the assertion to `deal-won-mizano-quote` (or to names where the arrow denotes forw
- QA Second Opinion: [p3] tests/unit/i18n.test.ts:187: `expect(name).toBe("صفقة مكسوبة → عرض سعر Mizano")` duplicates the identical exact-string assertion added at `tests/unit/i18n-content-text.test.ts:101` and also added lines 187-188 restate the same. Two exact-equality copies in different files mean any future copy edit must be applied twice; keep the exact-string check in one place and use the directional `toContain("→")` / `not.toContain("←")` assertions here.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:361: The Arabic name 'صفقة مكسوبة ← عرض سعر Mizano' has been correctly updated to use a right-to-left arrow (→) as 'صفقة مكسوبة → عرض سعر Mizano' for better RTL layout consistency.
- Localization Reviewer: [p3] tests/unit/i18n-content-text.test.ts:98: Test case updated to verify the Arabic template name contains the correct right-pointing arrow (→) and does not contain the left-pointing arrow (←).
- Localization Reviewer: [p3] tests/unit/i18n.test.ts:183: Added test suite 'local template localization consistency (#340)' with two test cases that verify RTL arrow consistency for the 'deal-won-mizano-quote' template and guard against misplaced left-pointing arrows (←) in all local templates.

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

## Test Plan - Issue #437: FlowLine_Web - Non-Blocking Review Findings

**Objective:** Verify findings from P2/P3 reviews related to i18n and RTL localization.

**1. Template Arrow Consistency:**
   * **Name:** `deal-won-mizano-quote` Arrow Test
   * **Setup:**  Run `tests/unit/i18n.test.ts` with the `deal-won-mizano-quote` template.
   * **Assertion:** Verify the rendered text contains `→` and *does not* contain `←`.
   * **File:** `tests/unit/i18n.test.ts:191`

**2.  Local Template Guard Test:**
   * **Name:** `Local Template Guard Regression`
   * **Setup:**  Run `tests/unit/i18n.test.ts` with a variety of local template names.
   * **Assertion:**  The guard `no local template titles contain misplaced left-pointing arrows (←)` should *not* fail.
   * **File:** `tests/unit/i18n.test.ts:191`

**3. Exact String Assertion Duplication:**
   * **Name:** `i18n-content-text.test.ts Duplication`
   * **Setup:**  Run `tests/unit/i18n-content-text.test.ts` and `tests/unit/i18n.test.ts`.
   * **Assertion:** Verify the exact string assertion at `tests/unit/i18n-content-text.test.ts:101` is used, not the duplicated one.
   * **File:** `tests/unit/i18n-content-text.test.ts:101` & `tests/unit/i18n.test.ts:187`

**4. RTL Arrow Consistency - Mizano:**
   * **Name:** `Mizano Arrow Test`
   * **Setup:** Run `tests/unit/i18n.test.ts` with the `ar.json` file.
   * **Assertion:** Verify the Arabic name uses `→` and *not* `←`.
   * **File:** `src/i18n/messages/ar.json:361`

**5.  Test Case Update Verification:**
   * **Name:** `i18n-content-text.test.ts Update`
   * **Setup:** Run `tests/unit/i18n-content-text.test.ts`.
   * **Assertion:**  Verify the updated test case correctly asserts the right-pointing arrow.
   * **File:** `tests/unit/i18n-content-text.test.ts:98`

**6. Local Template Localization Consistency Test:**
   * **Name:** `Local Template Localization Consistency`
   * **Setup:** Run `tests/unit/i18n.test.ts` with the 'deal-won-mizano-quote' template.
   * **Assertion:** Verify the test suite passes and the guard is functioning correctly.
   * **File:** `tests/unit/i18n.test.ts:183`

**Edge Cases:**
*  Test with a completely new, custom local template name.
*  Test with a template name containing special characters.
