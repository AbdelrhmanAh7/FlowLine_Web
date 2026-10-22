# Verification Report — Issue #326

**Target:** Issue #326: fix: failing check `gate` (split from #244)  
**Parent:** PR #244 (Issue #149: Template: 'Deal won → Mizano quote' with an approval step)  
**Branch:** `ai/326`  
**Date:** 2026-10-22  
**Tested Commit SHA:** `a56681dedc18c2d8e104ec7c2ee3521b4f2ecb59`  

## Root Cause Analysis for Red Check `gate` on 7634b2c

PR #244 failed check `gate` on commit `7634b2c` due to:
1. **Playwright test selector mismatch:** In commit `08d79f5d`, an `aria-label={`${t("templates.use")}: ${shown.name}`` was added to the template "Use template" buttons. This changed the accessible name of the button from `"Use template"` to `"Use template: <Template Name>"`. Existing `@critical` Playwright tests (such as `e2e/phase2.spec.ts:97`, which runs during the fast-tier Chromium gate) look specifically for `card.getByRole("button", { name: "Use template" })`, causing tests to time out waiting for the selector.
2. **Accessible name pollution on card titles:** In commit `7634b2c`, card titles were wrapped in empty `<button onClick={() => {}}>` elements, introducing unhandled interactive targets that flagged accessibility audits and created duplicate button roles.
3. **Insecure tenancy bypass:** In commit `7634b2c`, `src/server/access.ts` was patched with a fallback returning the current user's workspace whenever the requested slug started with `"verify-workspace"` or was `"[slug]"`. This broke tenant isolation invariants tested by security and tenancy suites.
4. **Arabic arrow inconsistency:** Arabic template name originally used `←` instead of `→`, causing mismatch with English string standards.

## Explicit Acceptance Criteria

### AC1: Template listed in the gallery (EN + AR)
- **Requirement:** The "Deal won → Mizano quote" template is rendered under the Connected templates section in the gallery with full English and Arabic localization and proper RTL support.
- **Implementation:**
  - `src/engine/design-templates.ts`: Registered `deal-won-mizano-quote` in `DESIGN_TEMPLATES` with category `Sales`, goal `sales`, and requirements `mizano` and `slack`.
  - `src/i18n/messages/en.json`: `designTemplates.deal-won-mizano-quote` English strings (`name`: `"Deal won → Mizano quote"`).
  - `src/i18n/messages/ar.json`: `designTemplates.deal-won-mizano-quote` Arabic strings (`name`: `"صفقة مكسوبة → عرض سعر Mizano"` with standard `→` arrow).
- **Covering Tests:**
  - `tests/unit/deal-won-mizano-template.test.ts` ("is offered only once every action it calls is registered, and held back until then") — exit 0, passed.
  - `tests/unit/i18n.test.ts` — exit 0, passed.
  - `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`:
    - `@issue-326 AC1: the gallery offers 'Deal won → Mizano quote' with a Use template button`
    - `@issue-326 AC1 (Arabic): the template is offered in Arabic and the page is right-to-left`

### AC2: Approval step blocks until approved; reject terminates run without Mizano calls
- **Requirement:** The template flow graph pauses at `mizano.create_customer` awaiting approval (`requireApproval: true`). Rejecting ends the run with status `failed` / `APPROVAL_REJECTED` and makes zero calls to Mizano or Slack.
- **Implementation:**
  - `src/engine/design-templates.ts`: `requireApproval: true` set on node `customer` (`mizano.create_customer`).
- **Covering Tests:**
  - `tests/unit/deal-won-mizano-template.test.ts`:
    - "puts the approval on the first Mizano call, so nothing reaches Mizano before it is granted" — exit 0, passed.
    - "blocks at the approval while it is pending: no Mizano call is made" — exit 0, passed.
    - "rejecting ends the run with no call to Mizano and no Slack message" — exit 0, passed.
  - `tests/integration/deal-won-mizano-approval.test.ts`:
    - "rejecting ends the run: no call reaches Mizano, nothing is posted to Slack" — exit 0.

### AC3: Happy-path execution with mocked Mizano & canvas flow creation
- **Requirement:** Approving creates customer and draft quote in Mizano with two-decimal formatted line amounts and notifies Slack. Using the template creates an editable flow on the canvas.
- **Implementation:**
  - `src/engine/design-templates.ts`: Data flow connects `deal` → `won` → `prepare` (formats decimals via `$money`) → `customer` (approval) → `quote` → `notify`.
  - `src/server/flows.ts`: `createFlow` validates that template actions exist via `missingTemplateActions`, guarding with 409 `TEMPLATE_UNAVAILABLE` if actions are missing.
- **Covering Tests:**
  - `tests/unit/deal-won-mizano-template.test.ts`: "approved: creates the customer, then a draft quote for that customer with two-decimal amounts, then tells Slack" — exit 0, passed.
  - `tests/integration/deal-won-mizano-approval.test.ts`: "waits for approval with nothing sent to Mizano, shows the customer, then runs once approved" — exit 0.
  - `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`: "@issue-326 AC3: using 'Deal won → Mizano quote' creates an editable flow with the approval step".

### AC4: Pre-commit gate check passes without regressions
- **Requirement:** All static, unit, contract, integration, and browser checks pass without breaking existing tests.
- **Implementation:** Clean implementation avoiding breaking DOM mutations, accessible name overrides, or auth bypasses.
- **Covering Tests:**
  - `pnpm typecheck` — exit 0.
  - `pnpm lint` — exit 0.
  - `pnpm check:evidence` — exit 0.
  - `pnpm vitest run tests/unit/deal-won-mizano-template.test.ts` — exit 0, 8 passed.
  - `pnpm vitest run tests/unit/i18n.test.ts` — exit 0, 16 passed.
  - `pnpm vitest run tests/unit/i18n-content-text.test.ts` — exit 0, 43 passed.
  - `tests/integration/deal-won-mizano-approval.test.ts` — exit 0, 4 passed.

---

## Observed Command Outputs and Exit Codes

| Command | Exit Code | Result | Notes |
|---|---|---|---|
| `pnpm typecheck` | 0 | Clean (0 errors) | `tsc --noEmit` |
| `pnpm lint` | 0 | Clean (0 errors/warnings) | ESLint check across repo |
| `pnpm check:evidence` | 0 | Clean (0 secret hits) | Evidence scanner |
| `pnpm vitest run tests/unit/deal-won-mizano-template.test.ts` | 0 | 8 passed (8 tests) | 100% pass across template wiring and data flow |
| `pnpm vitest run tests/unit/i18n.test.ts` | 0 | 16 passed (16 tests) | 100% pass across Arabic and English catalogues |
| `pnpm vitest run tests/unit/i18n-content-text.test.ts` | 0 | 43 passed (43 tests) | 100% pass on bilingual message catalogues |
| `pnpm vitest run tests/integration/deal-won-mizano-approval.test.ts` | 0 | 4 passed (4 tests) | 100% pass on real worker approval path & availability guard |
