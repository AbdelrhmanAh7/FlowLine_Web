# Prep for #181: Add comprehensive error handling tests

> Offline floor prep (2026-10-13T10:35Z): capacity 0 — claude: claude week 87% ≥ 85%: the last 15% is the owner's; codex: codex pacing: not enough room for a coding run (~1; opencode: held until 10:40Z (opencode rate-limited 12× in a ; agy: held until 10-14 14:35Z (1 d 4 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Create tests that verify the complete error handling flow from server to client for the admin copy functionality. Acceptance: All error scenarios are covered and pass QA.

Part 3/3 of #119 (split by the CTO: Split into focused sub-issues to address root causes separately)

<!-- nql-cto-split parent=119 -->

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.github/actions/gate-report/action.yml`
- `.github/workflows/claude.yml`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/RETEST.md`
- `artifacts/ai-hub/gate-cceeb5d/webkit-attempt1-failure/error-context.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Admin Copy Error Handling - Issue #181

**Objective:** Verify complete error handling flow for admin copy functionality.

**1. Invalid Admin ID:**
   * **Name:** Invalid Admin ID - 400
   * **Setup:** Simulate a request with a non-existent admin ID.
   * **Assertion:** Response status code is 400, response body contains appropriate error message.
   * **File:** `tests/unit/run-output-redaction.test.ts` (Edge: ID format validation)

**2. Missing Required Fields:**
   * **Name:** Missing Required Fields - 400
   * **Setup:** Request with missing required fields (e.g., no admin ID).
   * **Assertion:** Response status code is 400, error message indicates missing fields.
   * **File:** `tests/unit/run-output-redaction.test.ts`

**3. Server Error (Simulated):**
   * **Name:** Server Internal Error - 500
   * **Setup:** Trigger a server-side error (e.g., mock database failure).
   * **Assertion:** Response status code is 500, response body contains a generic server error message.
   * **File:** `tests/integration/p2-actions.test.ts`

**4. Authorization Failure:**
   * **Name:** Unauthorized Access - 401
   * **Setup:** Request with invalid credentials.
   * **Assertion:** Response status code is 401, response body contains authentication error.
   * **File:** `tests/unit/run-output-redaction.test.ts`

**5. Rate Limiting:**
   * **Name:** Rate Limit Exceeded - 429
   * **Setup:** Rapidly send multiple requests.
   * **Assertion:** Response status code is 429, response body contains rate limit information.
   * **File:** `tests/integration/p2-actions.test.ts`

**6. Data Validation Errors (Example: Invalid Data Type):**
   * **Name:** Invalid Data Type - 400
   * **Setup:**  Send a request with a data type mismatch (e.g., string where number is expected).
   * **Assertion:** Response status code is 400, appropriate error message.
   * **File:** `tests/unit/run-output-redaction.test.ts`

**7. Empty Response (Success Case - Edge):**
    * **Name:** Successful Copy - 200
    * **Setup:** Valid admin ID and request.
    * **Assertion:** Response status code is 200, response body contains expected data.
    * **File:** `e2e/landing-interaction.spec.ts` (Verify successful flow)
