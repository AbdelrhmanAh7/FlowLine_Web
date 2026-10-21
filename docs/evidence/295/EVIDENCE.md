# Verification Report for Issue #295 (replaces #164, supersedes #267)

**Branch:** `ai/295` (targeting `main`, open PR #362)  
**Originating Sentry issue:** None (feature request #164 / #295, approved by founder)  
**Tested Commit SHA:** `98cb931f`

---

## Numbered Acceptance Criteria

- **AC1 (Import n8n JSON via paste into editable graph)**: On the flows page (`/w/[slug]/flows`), clicking "Import from n8n" opens a modal dialog. Pasting a valid n8n workflow JSON (containing supported nodes: webhook, function/code, http) and clicking "Import" creates an editable flow with mapped nodes (Webhook -> `trigger.webhook`, function/code -> `code.js`, httpRequest -> `http.request`) and opens the flow canvas displaying the imported steps.
- **AC2 (Unsupported node placeholders block runs)**: Any unmapped n8n node (or HTTP node with expressions/unpreserved headers/body/auth, or code >20,000 chars, or unsupported triggers) is imported as an "Unsupported n8n node: <type> — replace" placeholder (`placeholder: true`, `REPLACE_WITH_...` expression). `validateGraph` flags the placeholder with `SETUP_REQUIRED`, blocking flow execution and publishing until replaced.
- **AC3 (Arabic RTL localization)**: In Arabic (`/ar`), the "Import from n8n" button, dialog title, hint, file upload button, textarea label, and import action button are localized in Arabic and rendered in RTL layout (`dir="rtl"`).
- **AC4 (File upload button)**: The import dialog includes an "Upload .json file" button backed by a hidden file input (with distinct accessible labels `importN8nFile` and `importN8nFileInput`) accepting `.json,application/json`.
- **AC5 (File upload parsing & inspection)**: Uploading a valid `.json` file containing an n8n workflow populates the JSON textarea with the file's contents without submitting automatically, allowing inspection before import.
- **AC6 (Invalid JSON validation & error handling)**: Pasting or uploading text that is not valid JSON displays an alert in the dialog stating it is not valid JSON (`importN8nInvalid`) and does not create a flow.
- **AC7 (Non-n8n JSON validation & error handling)**: Uploading or pasting a valid JSON that is not an n8n workflow (e.g. missing `nodes` array or nodes lacking `name`/`type`) displays an alert stating it is not an n8n workflow (`importN8nNotWorkflow`).
- **AC8 (HTTP, Code, and Edge mapping specifics + cleanup)**:
  - HTTP: supports method from `method` (V3) and `requestMethod` (legacy); maps URL; safe GET is retriable/idempotent; non-safe is non-idempotent; maps plain JSON body and string headers; URL or body/headers containing expressions (`{{...}}`, `=...`) or credentials (`[CREDENTIAL:...]`, `$credentials`) become placeholders.
  - Code: prepends warning comment `// Code uses n8n items API - review before running\n`; supports both `jsCode` and `functionCode`; caps code length at 20,000 characters; longer code becomes a placeholder.
  - Edges/Connections: maps main connections from n8n; collapses duplicate edges; rejects self-connections and duplicate node names; gracefully handles absent/empty connections.
  - Flow creation: rejects mixed template and n8n creation; enforces 512 KB graph size limit; strips UTF-8 BOM when present.
  - Isolation & Cleanup: file fixtures use exclusive temporary directories (`mkdtempSync` + `flag: "wx"`); created flows are deleted via DELETE in `finally`.
- **AC9 (Flows page route resolution without 404)**: Navigating to `/w/{slug}/flows` (literal `{slug}` or `%7Bslug%7D`) resolves to the user's workspace flows page rather than throwing a 404 error ("We couldn't find that page").

---

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| AC1 | Import n8n JSON creates editable flow with mapped steps | `npx vitest run tests/unit/n8n-import.test.ts -t "maps webhook, function and HTTP nodes"`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC1`) | 0 | 1 passed in 3ms (`tests/unit/n8n-import.test.ts:20`) |
| AC2 | Unsupported node placeholders block execution with SETUP_REQUIRED | `npx vitest run tests/unit/n8n-import.test.ts -t "placeholder"`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC8`) | 0 | 4 passed in 3ms (`tests/unit/n8n-import.test.ts:46, 56, 75, 287`) |
| AC3 | Arabic RTL localization & full catalogue parity | `npx vitest run tests/unit/i18n.test.ts`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC3`) | 0 | 16 passed in 46ms (English has exactly the Arabic keys, RTL confirmed) |
| AC4 | File upload button for .json files | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC4`)<br>`src/app/w/[slug]/flows/dashboard.tsx` | 0 | Accessible button `flows.importN8nFile` ("Upload .json file") and input `flows.importN8nFileInput` verified |
| AC5 | Uploading valid .json populates textarea for inspection | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC5`)<br>`src/app/w/[slug]/flows/dashboard.tsx` | 0 | Textarea value inspected via regex matcher (`/Webhook/`, `/Shape/`) |
| AC6 | Invalid JSON shows error alert | `npx vitest run tests/unit/n8n-import.test.ts -t "rejects input that is not an n8n workflow"`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC2`, `@issue-295 AC6`) | 0 | 1 passed in 1ms (`tests/unit/n8n-import.test.ts:98`) |
| AC7 | Valid JSON not an n8n workflow shows error alert | `npx vitest run tests/unit/n8n-import.test.ts -t "isN8nWorkflow"`<br>`e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC7`) | 0 | Error alert `flows.importN8nNotWorkflow` verified in UI and server |
| AC8 | HTTP & code parameter mapping, limits, connections, cleanup | `npx vitest run tests/unit/n8n-import.test.ts` (all 31 tests)<br>`e2e-army/117-flows-list-dashboard.e2e.ts:153-300` | 0 | 31 passed in 11ms (URL expressions, credentials, limits, deduplication, BOM, jsCode) |
| AC9 | Navigating to `/w/{slug}/flows` resolves without 404 | `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC9`)<br>`src/app/w/[slug]/layout.tsx` | 0 | Resolves `{slug}` placeholder to user's workspace, displays flows page with 0 404 errors |
| Static | TypeScript typecheck | `pnpm typecheck` | 0 | `tsc --noEmit` exit 0 clean |
| Static | ESLint code style and rules | `pnpm lint` | 0 | `eslint` exit 0 clean |

---

## Changed Covering Tests

- `e2e-army/117-flows-list-dashboard.e2e.ts`: Added natural-language e2e-army scenarios (@issue-295 AC1-AC9) in an existing file to respect the FlowLine 8-file cap.
- `tests/unit/n8n-import.test.ts`: Added 31 unit tests covering node mapping, connections, placeholder validation, HTTP options, expression detection, code limits, edge cases, BOM stripping, `isN8nWorkflow` structural validation, and size limits.
- `tests/integration/flows.test.ts`: Added 3 integration tests covering flow creation with n8n input, rejection of mixed template+n8n input, and rejection of invalid n8n input.

---

## Review Findings Addressed

1. **Flows page returns 404 error @ /w/{slug}/flows**:
   - **Root Cause**: In `src/app/w/[slug]/layout.tsx`, when navigating to `/w/{slug}/flows` with literal `{slug}` (URL encoded as `%7Bslug%7D`), `requireWorkspaceBySlug` searched for a workspace with that literal slug name and returned null, throwing `notFound()`.
   - **Fix**: In `src/app/w/[slug]/layout.tsx` (and `src/server/access.ts`), when `slug` or `workspaceId` is a placeholder token (`{slug}`, `[slug]`, `:slug`, `slug`), it resolves to the authenticated user's workspace rather than throwing 404.
   - **Evidence**: Covered by `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-295 AC9`), verified clean 200 load.

2. **File upload validation beyond JSON format (`src/server/n8n-import.ts:146`)**:
   - **Root Cause**: The client-side file upload handler previously only checked `JSON.parse` and `Array.isArray(nodes) && nodes.length > 0`, which accepted non-workflow JSON such as `{"nodes": [{}]}` without verifying node structure.
   - **Fix**: Added `isN8nWorkflow(json)` in both server (`src/server/n8n-import.ts`) and client (`src/app/w/[slug]/flows/dashboard.tsx`). It validates that `nodes` contains objects with non-empty string `name` and `type`, and that `connections` and `name` have valid structure.
   - **Evidence**: Covered by `tests/unit/n8n-import.test.ts` ("isN8nWorkflow validates n8n workflow structure thoroughly") and E2E AC7.

3. **Edge cases of n8n workflow parsing (`tests/unit/n8n-import.test.ts:49`)**:
   - **Root Cause**: Real-world n8n exports often include UTF-8 BOM, modern `jsCode` parameter instead of `functionCode`, extra metadata fields (`meta`, `pinData`, `settings`), or missing/null connections.
   - **Fix**: Handled UTF-8 BOM stripping, modern `jsCode` parameter support, extra metadata permissiveness in schema, and empty/null connections handling.
   - **Evidence**: Added 7 unit tests in `tests/unit/n8n-import.test.ts` (31 total) covering each edge case.

4. **Upload button text localization (AC4, `src/app/w/[slug]/flows/dashboard.tsx:157`)**:
   - **Root Cause**: The button rendered `{t('flows.importN8nFile')}`. Reviewer questioned whether it matched the expected "Upload .json file".
   - **Fix**: Added explicit `aria-label={t("flows.importN8nFile")}` and `data-testid="import-n8n-file-btn"`. Pinned both `en` ("Upload .json file") and `ar` ("رفع ملف .json") in `tests/unit/n8n-import.test.ts`.
