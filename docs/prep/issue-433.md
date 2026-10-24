# Prep for #433: Follow-up from #432: non-blocking review findings

> Offline floor prep (2026-10-24T13:46Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=432 -->
Follow-up from #432 (Follow-up from #244: non-blocking review findings (#341)).

P2/P3 findings from the reviewers. They do not block #432 and do not start a fix round; they are tracked here, one issue per PR.

- QA Engineer: [p2] src/engine/design-templates.ts:245: The template graph has a hardcoded channel ID 'REPLACE_WITH_CHANNEL_ID' in the Slack notification step. This should be replaced with a proper variable or configuration.
- QA Engineer: [p2] src/server/flows.ts:79: The error message 'That template needs app actions that aren't available yet' could be more specific by listing the missing actions.
- QA Second Opinion: [p2] src/engine/design-templates.ts:40: availableDesignTemplates and heldBackDesignTemplates are exported but have no production caller (only the new unit test uses them), so no gallery or 'Use template' path is actually filtered. The doc comment claims 'the gallery and "Use template" can never hand a user a flow that cannot run', which is false in this diff: users can still be shown a held-back template and then hit the new 409 TEMPLATE_UNAVAILABLE dead end. Either wire these helpers into the gallery/selection code or drop them and the inaccurate claim.
- QA Second Opinion: [p2] tests/unit/template-actions.test.ts:89: The 'formats the missing actions validation message' test re-implements the message locally as formatMissingActionsError instead of exercising the production formatter in src/server/flows.ts. It therefore passes even if the real createFlow message changes or regresses, giving false confidence that the changed behaviour is covered. Assert on the actual HttpError message thrown by createFlow (as the integration tests do) or export and test the real formatting code.
- QA Second Opinion: [p3] docs/evidence/341/EVIDENCE.md:33: The verification table claims '~130 lines changed across code and tests', but the diff adds roughly 285 lines total (~200 for code plus tests). The reported figure is inaccurate; update it to the real count so the assertion that the change is 'well below the 300-line limit' is trustworthy.

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

## Test Plan - Issue #433: Follow-up Non-Blocking Review Findings

**Overall Goal:** Verify identified P2/P3 findings and ensure fixes are implemented correctly.

**1. Template Channel ID (design-templates.ts:245)**
* **Name:** Channel ID Substitution
* **Setup:** Create a flow using a template with the hardcoded channel ID.
* **Assertion:** Verify the Slack notification uses the correct, dynamically retrieved channel ID.
* **File:** src/engine/design-templates.ts

**2. Missing Action Error (flows.ts:79)**
* **Name:** Specific Error Message
* **Setup:** Trigger a flow that requires unavailable app actions.
* **Assertion:** Verify the error message includes a list of missing actions.
* **File:** src/server/flows.ts

**3. Gallery Template Filtering (design-templates.ts:40)**
* **Name:** Gallery Filtering Validation
* **Setup:**  Simulate a user selecting a held-back template via the gallery.
* **Assertion:** Verify the user *can* see the held-back template and receive a 409 error.
* **File:** src/engine/design-templates.ts

**4. Missing Actions Test (template-actions.test.ts:89)**
* **Name:** Correct Test Assertion
* **Setup:** Create a flow that triggers the missing actions validation.
* **Assertion:** Assert that the *actual* HttpError message from `createFlow` is displayed, not the mocked message.
* **File:** tests/unit/template-actions.test.ts

**5. Evidence Table Accuracy (EVIDENCE.md:33)**
* **Name:** Verification Table Accuracy
* **Setup:**  Review the total lines changed in the diff.
* **Assertion:** Verify the reported line count (285) matches the actual line count.
* **File:** docs/evidence/341/EVIDENCE.md

**Edge Cases:**
* All tests should cover both success and failure scenarios.
* Test the dynamic retrieval of channel IDs with different channel configurations.
