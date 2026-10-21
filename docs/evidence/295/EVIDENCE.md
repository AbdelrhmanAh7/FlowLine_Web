# Verification Report for Issue #295 (replaces #164, supersedes #267)

**Branch:** `ai/295` (targeting `main`, open PR #362)  
**Originating Sentry issue:** None (feature request #164 / #295, approved by founder)  
**Tested Commit SHA:** `06760a09` (merge `1f54cc85`)

---

## Numbered Acceptance Criteria

- **AC1 (Import n8n JSON via paste into editable graph)**: On the flows page (`/w/[slug]/flows`), clicking "Import from n8n" opens a modal dialog. Pasting a valid n8n workflow JSON (containing supported nodes: webhook, function/code, http) and clicking "Import" creates an editable flow with mapped nodes (Webhook -> `trigger.webhook`, function/code -> `code.js`, httpRequest -> `http.request`) and opens the flow canvas displaying the imported steps.
- **AC2 (Unsupported node placeholders block runs)**: Any unmapped n8n node (or HTTP node with expressions/unpreserved headers/body/auth, or code >20,000 chars, or unsupported triggers) is imported as an "Unsupported n8n node: <type> — replace" placeholder (`placeholder: true`, `REPLACE_WITH_...` expression). `validateGraph` flags the placeholder with `SETUP_REQUIRED`, blocking flow execution and publishing until replaced.
- **AC3 (Arabic RTL localization)**: In Arabic (`/ar`), the "Import from n8n" button, dialog title, hint, file upload button, textarea label, and import action button are localized in Arabic and rendered in RTL layout (`dir="rtl"`).
- **AC4 (File upload button)**: The import dialog includes an "Upload .json file" button backed by a hidden file input (with distinct accessible labels `importN8nFile` and `importN8nFileInput`) accepting `.json,application/json`.
- **AC5 (File upload parsing & inspection)**: Uploading a valid `.json` file containing an n8n workflow populates the JSON textarea with the file's contents without submitting automatically, allowing inspection before import.
- **AC6 (Invalid JSON validation & error handling)**: Pasting or uploading text that is not valid JSON displays an alert in the dialog stating it is not valid JSON (`importN8nInvalid`) and does not create a flow.
- **AC7 (Non-n8n JSON validation & error handling)**: Uploading a valid JSON that is not an n8n workflow (missing `nodes` array) displays an alert stating it is not an n8n workflow (`importN8nNotWorkflow`).
- **AC8 (HTTP, Code, and Edge mapping specifics + cleanup)**:
  - HTTP: supports method from `method` (V3) and `requestMethod` (legacy); maps URL; safe GET is retriable/idempotent; non-safe is non-idempotent; maps plain JSON body and string headers; URL or body/headers containing expressions (`{{...}}`, `=...`) or credentials (`[CREDENTIAL:...]`, `$credentials`) become placeholders.
  - Code: prepends warning comment `// Code uses n8n items API - review before running\n`; caps code length at 20,000 characters; longer code becomes a placeholder.
  - Edges/Connections: maps main connections from n8n; collapses duplicate edges; rejects self-connections and duplicate node names.
  - Flow creation: rejects mixed template and n8n creation; enforces 512 KB graph size limit.
  - Isolation & Cleanup: file fixtures use exclusive temporary directories (`mkdtempSync` + `flag: "wx"`); created flows are deleted via DELETE in `finally`.

---

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| AC1 | Import n8n JSON creates editable flow with mapped steps | `npx vitest run tests/unit/n8n-import.test.ts -t "maps webhook, function and HTTP nodes"`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC1`) | 0 | 1 passed in 3ms (`tests/unit/n8n-import.test.ts:20`) |
| AC2 | Unsupported node placeholders block execution with SETUP_REQUIRED | `npx vitest run tests/unit/n8n-import.test.ts -t "placeholder"`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC8`) | 0 | 3 passed in 3ms (`tests/unit/n8n-import.test.ts:46, 56, 75`) |
| AC3 | Arabic RTL localization & full catalogue parity | `npx vitest run tests/unit/i18n.test.ts`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC3`) | 0 | 16 passed in 56ms (English has exactly the Arabic keys, RTL confirmed) |
| AC4 | File upload button for .json files | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC4`)<br>`src/app/w/[slug]/flows/dashboard.tsx:142-146` | 0 | Accessible button `flows.importN8nFile` and input `flows.importN8nFileInput` verified |
| AC5 | Uploading valid .json populates textarea for inspection | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC5`)<br>`src/app/w/[slug]/flows/dashboard.tsx:114-138` | 0 | Textarea value inspected via regex matcher (`/Webhook/`, `/Shape/`) |
| AC6 | Invalid JSON shows error alert | `npx vitest run tests/unit/n8n-import.test.ts -t "rejects input that is not an n8n workflow"`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC2`, `@issue-295 AC6`) | 0 | 1 passed in 1ms (`tests/unit/n8n-import.test.ts:98`) |
| AC7 | Valid JSON not an n8n workflow shows error alert | `npx vitest run tests/unit/n8n-import.test.ts -t "rejects input that is not an n8n workflow"`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC7`) | 0 | Error alert `flows.importN8nNotWorkflow` verified in UI and server |
| AC8 | HTTP & code parameter mapping, limits, connections, cleanup | `npx vitest run tests/unit/n8n-import.test.ts` (all 24 tests)<br>`e2e-army/117-flows-list-dashboard.e2e.ts:153-294` | 0 | 24 passed in 8ms (URL expressions, credentials, limits, deduplication) |
| Static | TypeScript typecheck | `pnpm typecheck` | 0 | `tsc --noEmit` exit 0 clean |
| Static | ESLint code style and rules | `pnpm lint` | 0 | `eslint` exit 0 clean |

---

## Changed Covering Tests

- `e2e-army/117-flows-list-dashboard.e2e.ts`: Added natural-language e2e-army scenarios (@issue-295 AC1-AC8) in an existing file to respect the FlowLine 8-file cap.
- `tests/unit/n8n-import.test.ts`: Added 24 unit tests covering node mapping, connections, placeholder validation, HTTP options, expression detection, code limits, edge cases, and size limits.
- `tests/integration/flows.test.ts`: Added 3 integration tests covering flow creation with n8n input, rejection of mixed template+n8n input, and rejection of invalid n8n input.

---

## CodeRabbit Review Threads Addressed (PR #362)

1. **`writeWorkflowFile` fixture concurrency (line 154)**: Replaced with `createWorkflowFixture(name, content)` using exclusive directory creation via `mkdtempSync(join(tmpdir(), "fl-army-295-"))` and `writeFileSync` with `flag: "wx"`, cleaned up in `finally` with `rmSync(fixture.dir, { recursive: true, force: true })`.
2. **Dashboard import controls (line 165)**: Implemented `ImportN8nDialog` with paste area, file upload, full validation, accessible labels, and localized button in `PageHeader`.
3. **Editable canvas assertion (line 171)**: Added assertions for `Flow name` value (`Army lead intake`), mapped step labels, and unsupported placeholder node.
4. **Accessible file input (line 225)**: Assigned distinct label `flows.importN8nFileInput` (`"n8n workflow file"`) to the file input to eliminate accessible role collision with the upload button.
5. **Test cleanup (line 295)**: Added `try ... finally` block in AC8 to issue `DELETE /api/flows/${flow.id}` to prevent flow leakage in test workspace.

---

## Reviewer Findings Addressed (from old PR #267)

1. **Upload button text localization (AC4)**: Verified in both `/en` ("Upload .json file") and `/ar` ("رفع ملف .json").
2. **File upload validation in UI**: Validates JSON syntax and confirms presence of `nodes` array with at least 1 node.
3. **Error handling in UI for file upload**: Sets error state displaying `<p role="alert">` with `importN8nInvalid` or `importN8nNotWorkflow` and marks textarea invalid.
4. **Textarea inspection after upload (AC5)**: Verified textarea retains parsed text allowing review before mutation.
5. **URL containing expressions or credentials**: In `src/server/n8n-import.ts`, URLs with `{{...}}` expressions, `[CREDENTIAL:...]`, `$credentials`, or `=...` become unsupported placeholders.
6. **Unit test coverage**: 24 unit tests in `tests/unit/n8n-import.test.ts` provide complete coverage for all new behaviors.
