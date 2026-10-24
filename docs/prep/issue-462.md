# Prep for #462: fix(i18n): use RTL-correct arrow in ar.json deal-won → Mizano quote template label (split from #454)

> Offline floor prep (2026-10-24T21:10Z): capacity 0 — claude: claude is text-only for coding (coding success 27%; codex: codex pacing: not enough room for a coding run (~1; agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Supersedes part of #445 / #454. Parent issue: #421.

### Problem
`src/i18n/messages/ar.json:2370` has 'صفقة مكسوبة → عرض سعر Mizano'. U+2192 (→) is not bidi-mirrored, so in RTL it visually points against the reading direction.

### Do
1. Branch fresh off `ai/421`; do not reuse `ai/421-p2` or `ai/454`.
2. Test first: add a case in `tests/unit/i18n.test.ts` asserting that no value in `ar.json` contains U+2192 (→). Add a case asserting the deal-won template label uses U+2190 (←), i.e. 'صفقة مكسوبة ← عرض سعر Mizano'. Confirm the test fails before the fix.
3. Replace → with ← in that ar.json string and in any other ar.json values that contain →. Leave en.json unchanged; → is correct for LTR.
4. If `src/engine/design-templates.ts` (~line 240) hard-codes a display name containing →, make it read from the i18n key instead of a literal. Leave the template id `deal-won-mizano-quote` unchanged.
5. Keep the existing em-dash (—) assertions in `tests/unit/i18n.test.ts` passing and untouched.
6. Add one e2e-army/Playwright RTL check: with the Arabic locale, open the template gallery and assert the deal-won Mizano template label renders with ← inside a `dir="rtl"` container.

### Acceptance criteria
- No U+2192 remains in ar.json values; new unit tests pass.
- Existing i18n tests are unchanged and green.
- The e2e RTL check passes, and CI is fully green with no skipped or weakened tests.
- The PR body says "Supersedes part of #445".
- The diff touches only ar.json, the test files, and at most design-templates.ts.

Part 1/2 of #454 (split by the CTO: Split #454 into two small parts: the ar.json RTL arrow fix with a unit test, and a docs sync. Drop the non-actionable praise findings and keep brand names Latin. Restart fresh off ai/421.)

<!-- nql-cto-split parent=454 -->

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/pull_request_template.md`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.gitignore`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/demo-docs-commands.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/template-actions.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Fix RTL Arrow in ar.json - Issue #462

**Overall Goal:** Verify the fix for the RTL-incorrect arrow character in the Arabic i18n file.

**1. Unit Test - Arrow Presence:**
   * **Name:** Arrow Absence Verification
   * **Setup:**  `tests/unit/i18n.test.ts`
   * **Assertion:**  Assert that no string in `ar.json` contains the U+2192 (→) character.
   * **Edge Case:** Ensure the test passes *before* making any changes.

**2. Unit Test - Correct Arrow Usage:**
   * **Name:** Deal Won Template Label - RTL Arrow
   * **Setup:** `tests/unit/i18n.test.ts`
   * **Assertion:** Assert that the `deal-won` template label in `ar.json` uses the U+2190 (←) character.
   * **Edge Case:** Verify the test fails initially, confirming the incorrect arrow is present.

**3. E2E Playwright RTL Check:**
   * **Name:** Template Gallery - RTL Rendering
   * **Setup:** Playwright with Arabic locale.
   * **Assertion:** Open the template gallery. Assert the `deal-won-mizano-quote` template label renders with the U+2190 (←) character within a `<div dir="rtl">` container.
   * **Edge Case:** Verify the container is correctly set to `dir="rtl"`.

**4. ar.json - Arrow Replacement:**
   * **Setup:** Manual inspection of `ar.json`.
   * **Assertion:** Replace all instances of U+2192 (→) with U+2190 (←).

**5. Design Template Check:**
   * **Setup:** `src/engine/design-templates.ts`
   * **Assertion:** Verify that the display name for the template is read from the i18n key, not a literal string.

**6. Existing Test Coverage:**
   * **Setup:** `tests/unit/i18n.test.ts`
   * **Assertion:**  Verify that the em-dash (—) assertions remain unchanged and pass.

**Files Involved:** `ar.json`, `tests/unit/i18n.test.ts`, `src/engine/design-templates.ts`
