# Prep for #454: fix: ar.json: src/i18n/messages/ar.json:2370: Arabic text 'صفقة مكسوبة → عرض سعر Mi… (split from #445)

> Offline floor prep (2026-10-24T19:55Z): capacity 0 — claude: claude is text-only for coding (coding success 27%; codex: Codex 5-h window 70% ≥ 70% (30% buffer) — next win; agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#445 item=finding:9c8bf91e0489 -->
Split from PR #445 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/445), which reached the fix-round cap (6/6) without going green. Parent issue: #421.

### Scope (one item)
- ar.json: src/i18n/messages/ar.json:2370: Arabic text 'صفقة مكسوبة → عرض سعر Mi…

src/i18n/messages/ar.json:2370: Arabic text 'صفقة مكسوبة → عرض سعر Mizano' uses a right-pointing arrow (→) U+2192 which is not appropriate for RTL layout. Should use a proper RTL arrow or dash.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/445#issuecomment-6358144681

**7 more item(s) from the parent, for the same task:**
- qa finding: (non-blocking) [p2] src/engine/design-templates.ts:240: The template …: (non-blocking) [p2] src/engine/design-templates.ts:240: The template name 'deal-won-mizano-quote' in the code contains an arrow (→) which should be consistent with the localization files.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/445#issuecomment-6358144681
- qa finding: (non-blocking) [p3] src/i18n/messages/ar.json:2371: The Arabic transl…: (non-blocking) [p3] src/i18n/messages/ar.json:2371: The Arabic translation for the customer node 'Mizano — Create customer (needs approval)' contains Latin characters in the label. Consider providing a full Arabic translation.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/445#issuecomment-635…
- ar.json: src/i18n/messages/ar.json:2371: The Arabic translation for the Mizano…: src/i18n/messages/ar.json:2371: The Arabic translation for the Mizano template node labels now consistently uses em-dash (—) instead of regular hyphen (-). The unit test in tests/unit/i18n.test.ts explicitly verifies this with toContain('—') and not.toContain('-') assertions.

https://github.com/Ab…
- EVIDENCE.md: docs/evidence/421/EVIDENCE.md:10: The Arabic text 'صفقة مكسوبة → عرض …: docs/evidence/421/EVIDENCE.md:10: The Arabic text 'صفقة مكسوبة → عرض سعر Mizano' uses a right-pointing arrow (→) which is appropriate for RTL consistency.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/445#issuecomment-6358144681
- EVIDENCE.md: docs/evidence/421/EVIDENCE.md:2369: The Arabic translations correctly…: docs/evidence/421/EVIDENCE.md:2369: The Arabic translations correctly use em-dash (—) instead of regular hyphen (-) in node labels: 'Mizano — إنشاء عميل (يحتاج موافقة)', 'Mizano — إنشاء مسودة عرض سعر', 'Slack — عرض السعر جاهز'.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/445#issuecomment-63…
- qa finding: (non-blocking) [p2] docs/evidence/421/EVIDENCE.md:110: The document c…: (non-blocking) [p2] docs/evidence/421/EVIDENCE.md:110: The document correctly specifies RTL direction for Arabic locale with 'dir="rtl"'.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/445#issuecomment-6358144681
- qa finding: (non-blocking) [p2] docs/implementation/PHASE4BETAREPORT.md:407: The …: (non-blocking) [p2] docs/implementation/PHASE4_BETA_REPORT.md:407: The Arabic translation 'صفقة مكس

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.gitattributes`
- `.github/actions/gate-report/action.yml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.gitignore`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`

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

**Test Plan: Fix - ar.json Localization Issues (#454)**

**Overall Goal:** Verify the fixes implemented in the `ar.json` file regarding RTL arrow usage, hyphen vs. em-dash, and Latin character inconsistencies.

**1. ar.json - Arrow Replacement (2370)**
*   **Test Case:** Verify correct RTL arrow usage.
*   **Setup:**  Inspect the `ar.json` file, specifically line 2370.
*   **Assertion:** Ensure the arrow character (→) is replaced with a proper RTL arrow character or em-dash (—).
*   **File:** `src/i18n/messages/ar.json`

**2. Template Name Consistency (Design Templates)**
*   **Test Case:** Verify consistent use of arrow in template names.
*   **Setup:** Inspect `src/engine/design-templates.ts` for 'deal-won-mizano-quote'.
*   **Assertion:** Ensure the template name does not contain the arrow character.
*   **File:** `src/engine/design-templates.ts`

**3. Arabic Translation - Em-Dash Validation (2371)**
*   **Test Case:** Verify em-dash usage in customer node labels.
*   **Setup:** Inspect `src/i18n/messages/ar.json` for 'Mizano — Create customer (needs approval)'.
*   **Assertion:** Confirm the label uses the em-dash (—) instead of a hyphen (-).
*   **File:** `src/i18n/messages/ar.json`

**4. Evidence Document - Arrow Consistency (EVIDENCE.md)**
*   **Test Case:** Verify arrow usage in evidence document.
*   **Setup:** Inspect `docs/evidence/421/EVIDENCE.md` for 'صفقة مكسوبة → عرض سعر Mizano'.
*   **Assertion:** Confirm the arrow character (→) is present and appropriate for RTL.
*   **File:** `docs/evidence/421/EVIDENCE.md`

**5.  Documentation - RTL Direction (PHASE4BETAREPORT.md)**
*   **Test Case:** Verify RTL direction specification.
*   **Setup:** Inspect `docs/implementation/PHASE4_BETA_REPORT.md` for Arabic translations.
*   **Assertion:** Confirm the `dir="rtl"` attribute is present and correctly applied.
*   **File:** `docs/implementation/PHASE4_BETA_REPORT.md`

**6. Regression Test - Template Names (Design Templates)**
*   **Test Case:** Ensure consistent use of arrow in template names.
*   **Setup:** Run the application with the updated templates.
*   **Assertion:** Verify that all template names use the correct character.
*   **File:** `src/engine/design-templates.ts`

**7.  Unit Test - Em-Dash Verification (tests/unit/i18n.test.ts)**
*   **Test Case:** Verify the unit test correctly identifies em-dash usage.
*   **Setup:** Run the unit test.
*   **Assertion:** The test passes, confirming the em-dash is correctly detected.
*   **File:** `tests/unit/i18n.test.ts`

**Edge Cases:**

*   Large text blocks – Ensure the em-dash replacement doesn't introduce formatting issues in longer strings.
*   Future updates – Consider how this fix impacts future localization changes.
