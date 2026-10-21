# Verification Report for Issue #374 (split from PR #362, parent #295)

**Branch:** `ai/374`  
**Originating Sentry issue:** None (feature enhancement / blocker finding fix split from PR #362)  
**Tested Commit SHA:** `ac330e68`  
**Supersedes part of:** #362  

---

## Numbered Acceptance Criteria

- **AC1 (Import n8n JSON creates editable flow with step persistence across reload)**:
  Importing an n8n workflow creates a flow canvas with mapped nodes (Webhook -> `trigger.webhook`, Shape function -> `code.js`, Notify -> `http.request`, Filter -> unsupported placeholder `transform.json`). Clicking the Shape step opens its configuration drawer, changing the step name to "Shape Edited", closing the drawer triggers autosave (`data-testid="save-status"` reaches `"saved"`), and reloading the page proves that the change persisted on the server by rendering "Shape Edited".
- **AC2 (Pasting invalid JSON is rejected without flow creation)**:
  Pasting non-JSON text into the import dialog displays an error alert (`flows.importN8nInvalid`) and creates no flow.
- **AC3 (Arabic RTL localization & layout)**:
  The import dialog renders with full Arabic localization and `dir="rtl"` layout when `fl_locale=ar`.
- **AC4 (File upload button for .json files)**:
  The import dialog includes an "Upload .json file" accessible button backed by a hidden file input accepting `.json,application/json`.
- **AC5 (File upload parses and populates textarea for inspection)**:
  Uploading a valid n8n workflow file populates the JSON textarea without automatic submission, allowing inspection before import.
- **AC6 (Uploading invalid JSON displays error)**:
  Uploading an invalid JSON file displays an error alert and does not create a flow.
- **AC7 (Uploading non-n8n JSON displays error)**:
  Uploading a valid JSON that is not an n8n workflow displays `flows.importN8nNotWorkflow`.
- **AC8 (Unsupported placeholders block execution until replaced)**:
  An imported flow containing an unsupported node placeholder is flagged with `SETUP_REQUIRED` by `validateGraph`, returning HTTP 422 `INVALID_FLOW` on run attempts.
- **AC9 (Flows page resolves without 404)**:
  Navigating to `/w/{slug}/flows` resolves placeholder slug tokens to the authenticated user's workspace without 404 errors.

---

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| AC1 | Import n8n JSON creates editable flow; editing Shape step persists after reload | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-374 (split from #362, #295) AC1`)<br>`tests/unit/n8n-import.test.ts` | 0 | Proves node mapping, drawer editing, autosave wait, and reload persistence |
| AC2 | Pasting invalid JSON rejected | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC2`) | 0 | Alert displayed, no flow created |
| AC3 | Arabic RTL localization & layout | `tests/unit/i18n.test.ts`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC3`) | 0 | 16/16 unit tests passed; RTL layout confirmed |
| AC4 | File upload button for .json files | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC4`) | 0 | File button and input verified |
| AC5 | File upload parses and populates textarea | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC5`) | 0 | Textarea populated with workflow JSON |
| AC6 | Uploading invalid JSON displays error | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC6`) | 0 | Error alert displayed |
| AC7 | Uploading non-n8n JSON displays error | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC7`)<br>`tests/unit/n8n-import.test.ts` | 0 | Alert `importN8nNotWorkflow` displayed |
| AC8 | Unsupported node placeholders block execution | `tests/unit/n8n-import.test.ts`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC8`) | 0 | HTTP 422 `INVALID_FLOW` confirmed |
| AC9 | `/w/{slug}/flows` resolves without 404 | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC9`) | 0 | Workspace resolves without 404 error |
| Static | TypeScript typecheck | `pnpm typecheck` | 0 | `tsc --noEmit` exit code 0 |
| Static | ESLint code style and rules | `pnpm lint` | 0 | `eslint` exit code 0 |
| Unit | n8n import suite (31 tests) | `npx vitest run tests/unit/n8n-import.test.ts` | 0 | 31 passed in 9ms |
| Unit | i18n parity suite (16 tests) | `npx vitest run tests/unit/i18n.test.ts` | 0 | 16 passed in 41ms |

---

## Changed Covering Tests

- `e2e-army/117-flows-list-dashboard.e2e.ts`: Updated AC1 natural-language scenario to verify that the imported graph is fully editable, editing the Shape step in the drawer triggers autosave, and reloading the page confirms the updated step name persisted.
- `tests/unit/n8n-import.test.ts`: 31 comprehensive unit tests covering node mapping, placeholder validation, edge case parameters, BOM stripping, export metadata tolerance, and input validation.
- `tests/integration/flows.test.ts`: Integration tests covering flow creation with n8n workflow payload, rejection of mixed template+n8n input, and error handling for invalid n8n input.

---

## Review Findings Addressed

1. **CodeRabbit Blocker (AC1) — Editable Graph Unproven**:
   - **Symptom**: CodeRabbit noted on PR #362: "the test only checks that the steps render. It never edits the Shape step, saves or autosaves, or reopens the flow to confirm the change persisted, so the issue's 'editable graph' criterion is unproven."
   - **Fix**: In `e2e-army/117-flows-list-dashboard.e2e.ts` (@issue-374 AC1), the test now:
     1. Clicks the Shape step to open its configuration drawer (`NodeDrawer`).
     2. Modifies the step name to "Shape Edited".
     3. Closes the drawer and waits for `data-testid="save-status"` to reach `"saved"`.
     4. Reloads the browser page via `await browser.reload()`.
     5. Asserts and expects that the reloaded flow editor displays the renamed step "Shape Edited".
   - **Evidence**: Covered by `e2e-army/117-flows-list-dashboard.e2e.ts` (@issue-374 AC1).
