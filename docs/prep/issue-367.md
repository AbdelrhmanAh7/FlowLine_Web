# Prep for #367: Follow-up from #362: non-blocking review findings

> Offline floor prep (2026-10-23T18:41Z): capacity 0 — agy: agy daily code budget (150) used; agy-med: agy daily code budget (150) used; agy-low: agy daily code budget (150) used; agy-pro: agy daily code budget (150) used. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=362 -->
Follow-up from #362 (Fresh restart of #164: Import an n8n workflow JSON into FlowLine as an editable graph (replaces #267) (#295)).

P2/P3 findings from the reviewers. They do not block #362 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p2] src/i18n/messages/ar.json:145: Arabic translation for 'importN8nHint' uses proper Modern Standard Arabic with consistent terminology. The text flows correctly in RTL layout.
- Localization Reviewer: [p2] src/i18n/messages/ar.json:148: Arabic translation for 'importN8nInvalid' uses proper Modern Standard Arabic with consistent terminology.
- Localization Reviewer: [p2] src/i18n/messages/ar.json:149: Arabic translation for 'importN8nNotWorkflow' uses proper Modern Standard Arabic with consistent terminology.
- Localization Reviewer: [p2] src/i18n/messages/ar.json:150: Arabic translation for 'importN8nSubmit' uses proper Modern Standard Arabic with consistent terminology.
- Localization Reviewer: [p2] src/i18n/messages/ar.json:151: Arabic translation for 'importN8nFile' uses proper Modern Standard Arabic with consistent terminology.
- Localization Reviewer: [p2] src/i18n/messages/ar.json:152: Arabic translation for 'importN8nFileInput' uses proper Modern Standard Arabic with consistent terminology.
- Localization Reviewer: [p2] src/app/w/[slug]/flows/dashboard.tsx:142: The ImportN8nDialog component properly handles RTL layout with Arabic translations. The dialog title and text are correctly localized.

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

## Test Plan - Issue #367: Localization Follow-up

**Objective:** Verify Arabic translations and RTL layout handling across the application.

**1. Dialog Title Localization:**
* **Name:** RTL Dialog Title Test
* **Setup:** Navigate to the ImportN8nDialog.
* **Assertion:** Dialog title "Import N8n Workflow" is correctly localized to Arabic in RTL layout.
* **File:** `src/app/w/[slug]/flows/dashboard.tsx:142`

**2. Text Localization - ImportN8nHint:**
* **Name:** Hint Text Localization Test
* **Setup:** Observe the "importN8nHint" text within the ImportN8nDialog.
* **Assertion:** Text is correctly translated to Modern Standard Arabic.
* **File:** `src/i18n/messages/ar.json:145`

**3. Text Localization - ImportN8nInvalid:**
* **Name:** Invalid Text Localization Test
* **Setup:** Observe the "importN8nInvalid" text.
* **Assertion:** Correct Arabic translation.
* **File:** `src/i18n/messages/ar.json:148`

**4. Text Localization - ImportN8nNotWorkflow:**
* **Name:** Not Workflow Text Localization Test
* **Setup:** Observe "importN8nNotWorkflow".
* **Assertion:** Correct Arabic translation.
* **File:** `src/i18n/messages/ar.json:149`

**5. Text Localization - ImportN8nSubmit:**
* **Name:** Submit Text Localization Test
* **Setup:** Observe "importN8nSubmit".
* **Assertion:** Correct Arabic translation.
* **File:** `src/i18n/messages/ar.json:150`

**6. Text Localization - ImportN8nFile:**
* **Name:** File Text Localization Test
* **Setup:** Observe "importN8nFile".
* **Assertion:** Correct Arabic translation.
* **File:** `src/i18n/messages/ar.json:151`

**7. Text Localization - ImportN8nFileInput:**
* **Name:** Input File Text Localization Test
* **Setup:** Observe "importN8nFileInput".
* **Assertion:** Correct Arabic translation.
* **File:** `src/i18n/messages/ar.json:152`

**8. RTL Layout - All Texts:**
* **Name:** Comprehensive RTL Layout Test
* **Setup:**  Simulate a user interaction within the ImportN8nDialog.
* **Assertion:** All localized text elements render correctly in RTL layout.

**9. Edge Case - Empty Translation:**
* **Name:** Empty Translation Check
* **Setup:**  Verify the `ar.json` file contains valid JSON structure.
* **Assertion:**  No syntax errors or missing keys.

**10.  .coderabbit.yaml Verification:**
* **Name:** YAML Configuration Check
* **Setup:** Inspect the `.coderabbit.yaml` file.
* **Assertion:**  Correct configuration for localization.
