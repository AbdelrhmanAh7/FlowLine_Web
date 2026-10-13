# Prep for #147: Mizano steps: 'Create customer' and 'Create draft quote'

> Offline floor prep (2026-10-13T10:14Z): capacity 0 — claude: claude week 87% ≥ 85%: the last 15% is the owner's; codex: codex pacing: not enough room for a coding run (~1; opencode: held until 10:40Z (opencode rate-limited 12× in a ; agy: held until 10-14 14:35Z (1 d 4 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Part of #144 (FlowLine G5 · Mizano connector v1).

## Scope
Two HTTP-backed steps on the Mizano connection: `POST /api/customers` {name, company, email, phone, taxId?} and `POST /api/quotes` {customerId, currency, lines[{item, qty, unitPrice, taxRate}]} (decimal strings). Idempotency-Key from the run id.

## Acceptance
- [ ] Both steps appear in the builder under Mizano
- [ ] Re-running the same run does not create a second customer/quote (idempotency key)
- [ ] Integration test against a mocked Mizano API

## How to test manually
1. Build: Manual trigger → Create customer → Create draft quote
2. Run it with a test customer: the customer and draft quote appear in Mizano (:8446)
3. Run the same run again: no duplicate

Test link: https://abdelrahmans-mac-mini.tailb66912.ts.net:8444 (Mizano: :8446). Blocked by the Mizano scoped API keys task (MZ G5) for live calls; mocks are enough to merge.


## Acceptance checklist

- [ ] Both steps appear in the builder under Mizano
- [ ] Re-running the same run does not create a second customer/quote (idempotency key)
- [ ] Integration test against a mocked Mizano API

## Candidate files

- `.coderabbit.yaml`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Mizano Customer & Quote Creation - Issue #147

**Goal:** Verify idempotency and correct data flow for customer and quote creation via Mizano.

**1. Idempotency Test:**
   * **Name:** Duplicate Run
   * **Setup:** Trigger run with existing run ID.
   * **Assertion:** Verify no new customer/quote is created in Mizano.
   * **File:** `tests/unit/run-output-redaction.test.ts`

**2. Customer Creation - Valid Data:**
   * **Name:** Valid Customer
   * **Setup:** Create customer with all required fields.
   * **Assertion:** Customer appears in Mizano.
   * **File:** `e2e/landing-interaction.spec.ts`

**3. Customer Creation - Missing Tax ID:**
   * **Name:** Missing Tax ID
   * **Setup:** Create customer without taxId.
   * **Assertion:** Customer is created, but taxId is null/empty in Mizano.
   * **File:** `e2e/landing-interaction.spec.ts`

**4. Quote Creation - Valid Data:**
   * **Name:** Valid Quote
   * **Setup:** Create quote with valid customer ID, currency, and lines.
   * **Assertion:** Quote and lines appear in Mizano.
   * **File:** `e2e/landing-interaction.spec.ts`

**5. Quote Creation - Decimal Precision:**
   * **Name:** Decimal Precision
   * **Setup:** Create quote with decimal values for qty and unitPrice.
   * **Assertion:** Values are correctly formatted in Mizano.
   * **File:** `tests/unit/docs-check-script.test.ts` (Data validation)

**6. Edge Case - Empty Customer Name:**
   * **Name:** Empty Customer Name
   * **Setup:** Create customer with an empty name.
   * **Assertion:**  Mizano handles the empty name gracefully (e.g., error message).
   * **File:** `e2e/landing-interaction.spec.ts`

**7. Edge Case - Zero Quantity:**
   * **Name:** Zero Quantity
   * **Setup:** Create quote with a zero quantity.
   * **Assertion:** Quote is created with zero quantity.
   * **File:** `e2e/landing-interaction.spec.ts`

**8. Mock API Verification:**
   * **Name:** Mock API Response
   * **Setup:** Manual trigger, observe Mizano response.
   * **Assertion:** Response matches expected format and data.
   * **File:** `tests/integration/p2-actions.test.ts` (Integration test)

**9. Builder Verification:**
   * **Name:** Step Presence
   * **Setup:** Manually build the flow.
   * **Assertion:**  `POST /api/customers` and `POST /api/quotes` steps are visible in the builder.
   * **File:** N/A (Manual Verification)

**10. Run ID Generation:**
    * **Name:** Run ID Verification
    * **Setup:** Trigger a run.
    * **Assertion:** The run ID is correctly generated and used in the API calls.
    * **File:** `tests/unit/docs-check-script.test.ts` (Data validation)
