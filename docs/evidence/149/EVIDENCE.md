# Evidence — Issue #149: Template 'Deal won → Mizano quote' with approval step

**Target Issue:** #149 (Part of #144 FlowLine G5 · Mizano connector v1)  
**Branch:** `ai/149`  
**Date:** 2026-10-20  

---

## Explicit Numbered Acceptance Criteria

### AC1: Template listed in the gallery (EN + AR)
- **Requirement:** The "Deal won → Mizano quote" template is registered in `DESIGN_TEMPLATES` and displayed in the templates gallery under the Connected section with full English and Arabic translations (including RTL display).
- **Implementation:**
  - `src/engine/design-templates.ts`: `deal-won-mizano-quote` registered with category `Sales`, requires `mizano` and `slack`.
  - `src/app/w/[slug]/templates/page.tsx`: Gallery displays design templates with localized titles, descriptions, requirements, and interactive "Use template" buttons.
  - `src/i18n/messages/en.json` & `src/i18n/messages/ar.json`: Localized strings under `designTemplates.deal-won-mizano-quote`.
- **Covering Tests & Verification:**
  - `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`:
    - `@issue-149 AC1: the gallery offers 'Deal won → Mizano quote' with a Use template button`
    - `@issue-149 AC1 (Arabic): the template is offered in Arabic and the page is right-to-left`
  - `tests/unit/deal-won-mizano-template.test.ts`:
    - `is offered only once every action it calls is registered, and held back until then` (exit code: 0)

### AC2: The approval step blocks until approved; reject ends the run without calls to Mizano
- **Requirement:** Starting a run pauses at the approval step (`waiting_approval`). The approval payload (`argsPreview`) contains the customer details AND the quote lines. Rejecting terminates the run (`failed` with `APPROVAL_REJECTED`) and makes 0 calls to Mizano or Slack.
- **Implementation:**
  - `src/engine/design-templates.ts`: `requireApproval: true` on node `customer` (`mizano.create_customer`), mapping customer details and quote lines into the input arguments.
  - `src/integrations/providers/mizano.ts`: `mizano.create_customer` accepts optional `lines` in its input schema for approval display without sending them to the Mizano customer endpoint.
- **Covering Tests & Verification:**
  - `tests/unit/deal-won-mizano-template.test.ts`:
    - `puts the approval on the first Mizano call, so nothing reaches Mizano before it is granted` (exit code: 0)
    - `blocks at the approval while it is pending: no Mizano call is made` (exit code: 0)
    - `rejecting ends the run with no call to Mizano and no Slack message` (exit code: 0)
  - `tests/integration/deal-won-mizano-approval.test.ts`:
    - `waits for approval with nothing sent to Mizano, shows customer and lines, then runs once approved` (asserts `approval.argsPreview` contains customer details and quote lines) (exit code: 0)
    - `rejecting ends the run: no call reaches Mizano, nothing is posted to Slack` (exit code: 0)
  - `tests/contract/mizano.test.ts`:
    - `accepts optional quote lines for approval preview and omits them from the customer API request` (exit code: 0)

### AC3: e2e spec for the template happy path with a mocked Mizano
- **Requirement:** Approving the pending approval creates the customer in Mizano, creates a draft quote with 2-decimal lines, and notifies Slack. Using the template in the UI creates an editable canvas flow.
- **Implementation:**
  - `src/engine/design-templates.ts`: Connected graph `deal` → `won` → `prepare` → `customer` (approval) → `quote` → `notify`.
- **Covering Tests & Verification:**
  - `tests/integration/deal-won-mizano-approval.test.ts`:
    - Verified real worker path creates customer, draft quote with 2-decimal lines, and Slack notification upon approval (exit code: 0).
  - `tests/unit/deal-won-mizano-template.test.ts`:
    - `approved: creates the customer, then a draft quote for that customer with two-decimal amounts, then tells Slack` (exit code: 0)
  - `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`:
    - `@issue-149 AC3: using 'Deal won → Mizano quote' creates an editable flow with the approval step`

---

## Verification Execution Summary

| Command | Exit Code | Result | Scope / Notes |
|---|---|---|---|
| `pnpm typecheck` | 0 | Clean (0 errors) | Full repo TypeScript check (`tsc --noEmit`) |
| `pnpm lint` | 0 | Clean (0 errors) | Full repo ESLint check |
| `pnpm vitest run tests/unit/deal-won-mizano-template.test.ts` | 0 | 8 passed (8 tests) | Unit tests verifying graph wiring, approval gate, and rejection/approval flows |
| `pnpm vitest run tests/contract/mizano.test.ts` | 0 | 51 passed (51 tests) | Contract tests verifying Mizano actions including customer creation with lines |
| `FLOWLINE_ENV=test DATABASE_URL=postgres://flowline@localhost:5432/flowline_test_149 pnpm vitest run tests/integration/deal-won-mizano-approval.test.ts` | 0 | 4 passed (4 tests) | Integration test verifying real worker claim, gate pausing with customer + lines preview, approval, and rejection |
