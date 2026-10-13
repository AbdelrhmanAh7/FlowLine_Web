# Prep for #145: Mizano connection type: base URL + scoped API key with 'Test connection'

> Offline floor prep (2026-10-13T03:08Z): capacity 0 — codex: held until 10-18 11:15Z (5 d 8 h) (codex week 100%; opencode: held until 03:08Z (opencode rate-limited 6× in a r; agy: held until 10-14 14:35Z (1 d 11 h) ( error: Indivi; or-laguna: or-laguna paced: openrouter-free rpd 50/day used (. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Part of #144 (FlowLine G5 · Mizano connector v1).

## Scope
Add a `mizano` provider connection (base URL, API key stored encrypted like other connection secrets) and a Test connection button that calls Mizano `GET /api/health` (and later a key-introspection endpoint).

## Acceptance
- [ ] Connection saved encrypted; key never returned to the client after save
- [ ] Test connection shows OK / a clear error (401, unreachable)
- [ ] Unit test with a mocked HTTP server

## How to test manually
1. Settings → Connections → Add → Mizano; enter the Mizano test link and a key
2. Click Test connection: OK
3. Enter a wrong key: a clear 401 message

Test link: https://abdelrahmans-mac-mini.tailb66912.ts.net:8444 (Mizano: :8446). Blocked by the Mizano scoped API keys task (MZ G5) for live calls; mocks are enough to merge.


## Acceptance checklist

- [ ] Connection saved encrypted; key never returned to the client after save
- [ ] Test connection shows OK / a clear error (401, unreachable)
- [ ] Unit test with a mocked HTTP server

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`
- `EVIDENCE.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`

## Test plan (ollama:gemma3:4b)

## Mizano Connection Type - Test Plan (Issue #145)

**Goal:** Verify the new Mizano connection type with test connection functionality.

**1. Key Encryption & Storage:**
   * **Test Case:** Verify Key Encryption
      * **Setup:** Add Mizano connection with valid key.
      * **Assertion:** Key is not visible in UI or logs.
      * **File:** `tests/unit/focused-run-env.test.ts`

**2. Test Connection - Successful Connection:**
   * **Test Case:** Test Connection - OK Response
      * **Setup:** Add Mizano connection.
      * **Assertion:** Test connection returns "OK" or equivalent success message.
      * **File:** `e2e/landing-interaction.spec.ts` (mocked response)

**3. Test Connection - Invalid Key (401):**
   * **Test Case:** Test Connection - Invalid Key
      * **Setup:** Add Mizano connection with incorrect key.
      * **Assertion:** Test connection returns a 401 error.
      * **File:** `e2e/landing-interaction.spec.ts` (mocked error)

**4. Health Endpoint Test:**
   * **Test Case:** Health Endpoint Verification
      * **Setup:** Add Mizano connection.
      * **Assertion:** `GET /api/health` returns a 200 OK status.
      * **File:** `tests/unit/docs-check-script.test.ts` (mocked response)

**5. Key Introspection (Future):**
   * **Test Case:** Key Introspection Mock
      * **Setup:** Add Mizano connection. Mock key introspection endpoint.
      * **Assertion:**  Mocked endpoint returns expected data.
      * **File:** `tests/unit/test-integration-env.test.ts` (mocked endpoint)

**6. Edge Case - Empty Key:**
   * **Test Case:** Empty Key Input
      * **Setup:** Add Mizano connection with empty key.
      * **Assertion:** Test connection returns a 401 or similar error.

**7. Edge Case - Invalid URL:**
   * **Test Case:** Invalid URL Input
      * **Setup:** Add Mizano connection with an invalid URL.
      * **Assertion:** Test connection returns a 401 or similar error.

**8. Unit Test - Mocked HTTP Server:**
   * **Test Case:** Unit Test - Mocked Server
      * **Setup:** Create unit test with mocked HTTP server.
      * **Assertion:** Unit test passes, verifying correct HTTP request and response handling.
      * **File:** `tests/unit/p2-actions.test.ts`

**9. Test Link Verification:**
   * **Test Case:** Test Link Functionality
      * **Setup:** Add Mizano connection with provided test link.
      * **Assertion:** Test connection successfully connects to the provided test link.
      * **File:** `e2e/landing-interaction.spec.ts` (mocked response)

**10. Test Link - Blocked by MZ G5:**
    * **Test Case:** Test Link - Blocked
       * **Setup:** Add Mizano connection with provided test link.
       * **Assertion:** Test connection fails due to MZ G5 blocking.
       * **File:** `e2e/landing-interaction.spec.ts` (mocked error)
