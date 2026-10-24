# Prep for #396: Follow-up from #327: non-blocking review findings

> Offline floor prep (2026-10-24T07:06Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=327 -->
Follow-up from #327 (fix: qa finding: The PR includes changes to src/app/account/security/two-factor-card.t… (split from #269) (#318)).

P2/P3 findings from the reviewers. They do not block #327 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p2] src/app/account/security/two-factor-card.tsx:41: The code correctly sets dir='ltr' for the TOTP secret element with data-testid='totp-secret' to ensure proper display in RTL contexts. Consider adding a comment explaining why this direction is enforced even in RTL contexts.
- Localization Reviewer: [p2] src/app/account/security/two-factor-card.tsx:49: The backup codes container correctly sets dir='ltr' to preserve sequence readability in Arabic/RTL contexts. Consider adding a comment explaining this design decision.

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

## Test Plan - Issue #396: Two-Factor Card RTL Localization

**Objective:** Verify RTL localization fixes identified in review #327.

**1. TOTP Secret Direction Test**
   * **File:** `src/app/account/security/two-factor-card.tsx`
   * **Setup:**  RTL locale configured.
   * **Assertion:** Element with `data-testid='totp-secret'` displays correctly (LTR direction).
   * **Edge Case:** Verify display across different RTL languages.

**2. Backup Codes Direction Test**
   * **File:** `src/app/account/security/two-factor-card.tsx`
   * **Setup:** RTL locale configured.
   * **Assertion:** Backup codes display correctly (LTR direction).
   * **Edge Case:** Verify display with long backup code sequences.

**3.  Direction Consistency Test (Card)**
   * **File:** `src/app/account/security/two-factor-card.tsx`
   * **Setup:**  RTL locale configured.
   * **Assertion:** All elements within the card maintain correct direction.
   * **Edge Case:**  Simulate a rapid switch between RTL and LTR locales.

**4.  Test Suite Coverage**
   * **File:** `tests/unit/demo-docs-commands.test.ts` (Expand existing tests)
   * **Setup:**  RTL locale configured.
   * **Assertion:** Existing tests pass, focusing on UI rendering.

**5.  UI Rendering Test (Dark Mode)**
   * **File:** `src/app/account/security/two-factor-card.tsx`
   * **Setup:** RTL locale configured, Dark Mode enabled.
   * **Assertion:**  All text and icons render correctly in RTL and Dark Mode.

**6.  Edge Case: Complex RTL Text**
   * **File:** `src/app/account/security/two-factor-card.tsx`
   * **Setup:** RTL locale configured.
   * **Assertion:** Complex RTL text (e.g., accented characters) renders without issues.

**7.  Test:  No Locale Change**
   * **File:** `src/app/account/security/two-factor-card.tsx`
   * **Setup:** LTR locale configured.
   * **Assertion:**  The card renders correctly in LTR.

**8.  Test:  Empty State**
    * **File:** `src/app/account/security/two-factor-card.tsx`
    * **Setup:** RTL locale configured.
    * **Assertion:** The card renders correctly in RTL, even when no two-factor card is present.
