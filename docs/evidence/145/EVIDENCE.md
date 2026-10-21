# Verification Evidence — Issue #145: Mizano connection type: base URL + scoped API key with 'Test connection'

**Tested commit SHA:** `HEAD` (recorded on commit)  
**Date:** 2026-10-21  
**Test environment:** macOS, Node 26.10.0, Vitest 5.0.2, pnpm 10.32.1  
**Originating Sentry issue:** None (feature request #145; part of FlowLine G5 #144)  

---

## Explicit Acceptance Criteria

- **AC1:** Connection saved encrypted; key never returned to the client after save.
  - Stored credentials encrypted at rest (`secretEnc`, `keyId`, `legacyCrypto`) via `src/server/crypto.ts`.
  - Scoped API key (`token`) is omitted from connection create, list, update, and get API responses.
  - Test connection route (`POST /api/workspaces/{wid}/connections/{cid}/test`) takes no body and never echoes key material.
- **AC2:** Test connection shows OK / a clear error (401, unreachable, egress blocked) with full i18n in English and Arabic (RTL).
  - Valid connection returns `{ ok: true, provider: "Mizano", accountLabel: "..." }`.
  - Invalid/revoked key (401) maps to bounded code `AUTHENTICATION_FAILED` ("Invalid API key" / Arabic equivalent).
  - Network timeout / unreachable maps to `PROVIDER_UNREACHABLE` (502, 8s deadline).
  - Private network / invalid URL maps to `EGRESS_BLOCKED` (400).
  - Other provider errors map to `PROVIDER_ERROR` (502); provider response body and error messages are discarded.
  - All bounded error codes have dedicated translations in `messages/en.json` and `messages/ar.json`, verified by unit tests; RTL direction verified.
- **AC3:** Unit/contract test with a mocked HTTP server.
  - Mocked fake provider server (`e2e/fakes/provider-server.ts`) exercises health, identity, and error branches.
  - Contract suite (`tests/contract/mizano-connection.test.ts`, `tests/contract/mizano-fake.test.ts`, `tests/contract/mizano.test.ts`) verifies behavior over HTTP without contacting external networks.

---

## Verification Report

| AC | Verification Method / Command | Exit Code | Observed Result |
|---|---|---|---|
| **AC1** | `pnpm vitest run tests/contract/mizano-connection.test.ts` (test: `returns the account label for a good key` & never echoes token); `tests/integration/mizano-connection-test.test.ts:98-106` (`secretEnc` verified at rest; connection list omits `token`); `e2e-army/145-mizano-connection-test.e2e.ts:79-99` | 0 | **PASS** — API key is encrypted at rest using workspace secret envelope; API responses never return `token`; test endpoint takes no body and never echoes secret. |
| **AC2** | `pnpm vitest run tests/contract/mizano-connection.test.ts tests/unit/connection-test-i18n.test.ts` (tests: 400 `AUTHENTICATION_FAILED`, 502 `PROVIDER_UNREACHABLE` with 8s deadline, 400 `EGRESS_BLOCKED`, 502 `PROVIDER_ERROR`; translation tests for EN and AR); `e2e-army/145-mizano-connection-test.e2e.ts:173-206` (UI card flows in EN and AR RTL) | 0 | **PASS** — Every error maps to a bounded code with user-friendly translated text in EN and AR (RTL); raw provider body discarded. |
| **AC3** | `pnpm vitest run tests/contract/mizano-connection.test.ts tests/contract/mizano-fake.test.ts tests/contract/mizano.test.ts tests/unit/connection-test-i18n.test.ts tests/unit/e2e-army-tooling.test.ts` | 0 | **PASS** — 104 passed (104) across 5 test files against the mocked HTTP fake provider server (`e2e/fakes/provider-server.ts`). |

---

## Changed Covering Tests

1. `tests/contract/mizano-connection.test.ts` (24 tests):
   - `calls GET /api/health first, then GET /api/me, both with the scoped key as a Bearer` (AC2, AC3)
   - `reports a rejected key as an auth failure, never a raw provider message` (AC2)
   - `refuses a base URL that is not a bare https origin before a request is sent` (AC2)
   - `a failing health check stops before /api/me` (AC2)
   - `does not trust a 200 health response of degraded/proxy/null, and never asks for /api/me` (AC2)
   - `gives the connection test its 8 s default deadline` (AC2)
   - `returns the account label for a good key` (AC1, AC2)
   - `a wrong key is a 400 AUTHENTICATION_FAILED with fixed text` (AC2)
   - `an instance that does not answer within the deadline is a 502 PROVIDER_UNREACHABLE` (AC2)
   - `a connection dropped by the instance is a 502 PROVIDER_UNREACHABLE` (AC2)
   - `an unhealthy or failing instance is a 502 PROVIDER_ERROR; the provider text is not echoed` (AC2)
   - `a private-network base URL is refused as 400 EGRESS_BLOCKED and never sent` (AC2)
   - Full `testError` kind-to-code mapping coverage (AC2)
2. `tests/contract/mizano-fake.test.ts` (8 tests):
   - Tests fake server `/api/health` and `/api/me` endpoints under `FLOWLINE_ENV=test`.
3. `tests/contract/mizano.test.ts` (50 tests):
   - Contract tests for Mizano provider definition, actions, schema validation, and URL checking.
4. `tests/unit/connection-test-i18n.test.ts` (10 tests):
   - Validates that every code from the test route (`AUTHENTICATION_FAILED`, `PROVIDER_UNREACHABLE`, `PROVIDER_ERROR`, `EGRESS_BLOCKED`, `NOT_CONNECTION_OWNER`, `CONNECTION_NOT_FOUND`, `UNKNOWN_PROVIDER`, `TEST_NOT_SUPPORTED`) resolves to non-empty, localized text in both English and Arabic.
   - Asserts Arabic contains Arabic characters (`/[؀-ۿ]/`) and never leaks the server's English message.
5. `tests/unit/e2e-army-tooling.test.ts` (12 tests):
   - Validates repo stays strictly within the 8 top-level `e2e-army/*.e2e.ts` file cap.
6. `tests/integration/mizano-connection-test.test.ts` (10 tests):
   - Tests access rules (owner/editor OK, viewer 403, non-member 404, private 403), unknown ID 404, OAuth refusal 400, revoked key 400, timeout 502, and encryption at rest.
7. `tests/integration/app-entry.test.ts` (6 tests):
   - Validates `/app/integrations` redirects properly into the member workspace.
8. `e2e-army/145-mizano-connection-test.e2e.ts`:
   - `@issue-145 AC1/AC2: a saved Mizano connection keeps its scoped key server-side, and Test connection checks only the saved URL` (tags: `feat:fl-connections`, `lvl:api`)
   - `@issue-145 AC2: the saved Mizano connection's card offers a Test connection control that reports the account` (tags: `feat:fl-integrations`, `feat:fl-sign-in`, `lvl:ui`)
   - `@issue-145 AC2 Arabic: the Test connection control and its OK result are translated and the page is right-to-left` (tags: `feat:fl-i18n-rtl`, `feat:fl-integrations`, `lvl:ui`)
   - Consolidates #147 and #148 Mizano actions to maintain the strict 8-file cap.

---

## Regression Proof: Fails on Base, Passes on Head

Tested command:
`pnpm vitest run tests/contract/mizano-connection.test.ts tests/unit/connection-test-i18n.test.ts`

### On Base (`origin/main`)
- `tests/contract/mizano-connection.test.ts` does not exist on `origin/main`.
- `src/server/connection-test.ts` and `src/integrations/connection-test.ts` do not exist on `origin/main`.
- Command fails with exit code 1 (`No test files found`).

### On Head (`ai/145`)
- Command exits with code 0:
  `Test Files 2 passed (2)`
  `Tests 34 passed (34)`
- Across the full 5-file suite:
  `pnpm vitest run tests/contract/mizano-connection.test.ts tests/contract/mizano-fake.test.ts tests/contract/mizano.test.ts tests/unit/connection-test-i18n.test.ts tests/unit/e2e-army-tooling.test.ts`
  `Test Files 5 passed (5)`
  `Tests 104 passed (104)`

---

## UI / RTL & LTR Verification

- **English UI:** On `/app/integrations`, the Mizano connection card renders a "Test connection" button. Clicking it executes `POST /api/workspaces/{wid}/connections/{cid}/test` and displays:
  `Connection OK — Alice A Mizano`
- **Arabic UI (RTL):** On `/app/integrations` with `fl_locale=ar`:
  - `document.documentElement.dir` evaluates to `"rtl"`.
  - Button text is translated: `"اختبار الاتصال"`.
  - Successful result is translated: `"الاتصال سليم — Alice A Mizano"`.
  - Error messages resolve to Arabic strings (`integrations.card.testAuthFailed`, `testUnreachable`, `testProviderError`, `testEgressBlocked`, etc.) without falling back to English server strings.

---

## Static Checks and Verification Commands

```
$ pnpm vitest run tests/contract/mizano-connection.test.ts tests/contract/mizano-fake.test.ts tests/contract/mizano.test.ts tests/unit/connection-test-i18n.test.ts tests/unit/e2e-army-tooling.test.ts
 Test Files  5 passed (5)
      Tests  104 passed (104)
   Duration  2.44s
# Exit code: 0

$ pnpm lint
> eslint . --cache --cache-location node_modules/.cache/eslint/
# Exit code: 0 (clean, no warnings, no errors)

$ pnpm typecheck
> tsc --noEmit
# Exit code: 0 (clean, no errors)

$ pnpm check:evidence
check-evidence-secrets: 0 local secret value(s) checked across 177 file(s); 0 hit(s)
# Exit code: 0
```

---

## Security Posture

- **No new dependencies** added.
- **No secrets read or written** beyond the existing encrypted credential storage (`src/server/crypto.ts`).
- **No permissions/workflow tokens** changed.
- **SSRF and key exfiltration prevented:**
  - Route accepts no request body; caller cannot supply an override URL or redirect credentials.
  - Stored key is only ever sent to the connection's own saved `baseUrl`.
  - Base URL must be an https origin with no path; link-local, loopback, private IP, and intranet hosts are blocked via `checkUrl` (Egress guard).
- **Redaction & error sanitization:**
  - Raw provider HTTP response body and error messages are discarded.
  - Bounded error codes mapped to sanitized user-facing messages.
  - Stored key is never echoed in API responses or UI.
- **Zero test-stack / private log leaks:**
  - Accidental `.e2e-stack-145.log` removed from git and `.e2e-stack-*.log` ignored in `.gitignore`.
