# Prep for #448: Follow-up from #445: non-blocking review findings

> Offline floor prep (2026-10-24T18:58Z): capacity 0 — claude: claude is text-only for coding (coding success 27%; codex: codex pacing: not enough room for a coding run (~1; agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=445 -->
Follow-up from #445 (fix: 147-mizano-create-customer-and-quote.e2e.ts: e2e-army/147-mizano-create-customer-and-quote.e2e.ts:96: The test exp… (#421) [2/2]).

P2/P3 findings from the reviewers. They do not block #445 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p2] src/engine/design-templates.ts:240: The template name 'deal-won-mizano-quote' in the code contains an arrow (→) which should be consistent with the localization files.
- Localization Reviewer: [p3] src/i18n/messages/ar.json:2371: The Arabic translation for the customer node 'Mizano — Create customer (needs approval)' contains Latin characters in the label. Consider providing a full Arabic translation.

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

## FlowLine_Web - Issue #448 Test Plan

**Objective:** Verify Localization Review findings (P2/P3) related to template names and Arabic translations.

**1. Template Name Consistency:**
   * **Name:** Deal Won Mizano Quote - Arrow Check
   * **Setup:** Run e2e test creating a customer and quote with the 'deal-won-mizano-quote' template.
   * **Assertion:** Verify the template name in `design-templates.ts` does *not* contain an arrow (→).
   * **File:** `design-templates.ts`

**2. Arabic Translation - Latin Characters:**
   * **Name:** Arabic Label - Latin Character Check
   * **Setup:**  Locate the Arabic translation for "Mizano — Create customer (needs approval)" in `ar.json`.
   * **Assertion:** Verify the label *does not* contain Latin characters.
   * **File:** `ar.json`

**3. Template Name - Different Quote Types:**
   * **Name:** Multiple Template Names
   * **Setup:** Create quotes with various templates (e.g., 'deal-won-mizano-quote', 'deal-lost-mizano-quote').
   * **Assertion:** Ensure all template names are consistent across the codebase.
   * **File:** `design-templates.ts`

**4. Localization - Full Arabic Translation:**
   * **Name:** Full Arabic Translation - Request
   * **Setup:**  Review the Arabic translation for "Mizano — Create customer (needs approval)".
   * **Assertion:** Verify a complete, fully translated Arabic label is provided.
   * **File:** `ar.json`

**5. Edge Case - Template Name Length:**
   * **Name:** Long Template Name
   * **Setup:** Attempt to create a quote with a very long template name (exceeding typical limits).
   * **Assertion:** Verify the system handles the long name gracefully (no errors, correct display).
   * **File:** `design-templates.ts`

**6. Edge Case - Empty Template Name:**
   * **Name:** Empty Template Name
   * **Setup:** Attempt to create a quote with an empty template name.
   * **Assertion:** Verify the system handles the empty name gracefully (no errors, default behavior).
   * **File:** `design-templates.ts`

**7. Regression - Existing Quote Creation:**
   * **Name:** Existing Quote Creation
   * **Setup:** Run existing quote creation tests.
   * **Assertion:** Verify no localization issues are introduced during quote creation.
   * **Files:** `tests/unit/demo-docs-commands.test.ts`, `tests/unit/docs-check-script.test.ts`

**Note:** These test cases are focused on the specific localization review findings.  Further regression testing of the core quote creation functionality is recommended.
