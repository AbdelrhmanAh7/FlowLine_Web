# Verification Evidence — Issue #301: Fresh restart of #145: Mizano connection type: base URL + scoped API key with 'Test connection' (replaces #215, closes #145)

**Tested commit SHA:** `216ebec6` (Merge remote-tracking branch 'origin/main' into ai/301)  
**Date:** 2026-10-22  
**Test environment:** macOS, Node 26.10.0, Vitest 5.0.2, pnpm 10.32.1  
**Originating Sentry issue:** None (feature request #145, restarted as #301; part of FlowLine G5 #144)  

---

## Explicit Acceptance Criteria

| AC | Description | Verification |
|----|-------------|--------------|
| **AC1** | Mizano connection type supports base URL and scoped API key, stored encrypted at rest via crypto v2 envelope (`openSecret`), never echoed back in plain text or connection listings | `tests/contract/mizano-connection.test.ts`, `tests/unit/test-connection.test.ts`, and `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` |
| **AC2** | Test connection endpoint `POST /api/workspaces/[wid]/connections/[cid]/test` verifies saved credentials with an 8 s deadline: calls Mizano `GET /api/health` then `GET /api/me`, returns `{ ok: true, provider: "Mizano", accountLabel }` without leaking secret, bounds and sanitizes failures (`AUTHENTICATION_FAILED`, `PROVIDER_UNREACHABLE`, `EGRESS_BLOCKED`, `PROVIDER_ERROR`, `TEST_NOT_SUPPORTED`, `NOT_CONNECTION_OWNER`), and refuses caller-supplied URL/key | `tests/contract/mizano-connection.test.ts` (23 tests), `tests/unit/test-connection.test.ts` (8 tests), `tests/contract/mizano-fake.test.ts` (8 tests), `tests/unit/connection-test-i18n.test.ts` (11 tests) |
| **AC3** | Integrations UI (`/w/[slug]/integrations`): saved connection card displays "Test connection" button for non-OAuth providers (Mizano), triggers test mutation, and displays localized success ("Connection OK — {account}" / "الاتصال سليم — {account}") or error toast with full Arabic RTL layout support | `src/app/w/[slug]/integrations/page.tsx`, `tests/unit/connection-test-i18n.test.ts` (11 tests), `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` |
| **AC4** | E2E-army suite includes API test and UI tests (LTR and RTL) tagged `@issue-301` and covering touched features (`feat:fl-connections`, `feat:fl-integrations`, `feat:fl-i18n-rtl`) | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` (3 tests) |

---

## Changes Summary

1. **Test Connection Logic (`src/integrations/connection-test.ts`)**:
   - `runConnectionTest`: enforces 8 s deadline (`TEST_TIMEOUT_MS = 8_000`), performs Mizano health probe `GET /api/health` validating healthy response (`ok|healthy|up`), followed by `provider.identity()` (`GET /api/me`) returning account label.
   - `testError`: maps provider error kinds to safe, bounded `HttpError` codes with fixed messages, preventing provider internals or keys from leaking to client.

2. **Server-side Validation & Access Control (`src/server/connection-test.ts`)**:
   - `testConnection`: checks workspace authorization with `integration.manage` (403 for viewers, 404 for strangers), validates UUID connection id (404 on invalid), ensures private connections are only tested by creator (403 `NOT_CONNECTION_OWNER`), opens secret via `openSecret` with AAD binding, and rejects OAuth connections (400 `TEST_NOT_SUPPORTED`).
   - Endpoint takes NO body to prevent host spoofing.

3. **API Route (`src/app/api/workspaces/[wid]/connections/[cid]/test/route.ts`)**:
   - Thin POST route delegating to `testConnection` and responding via `jsonNoStore`.

4. **UI Integration (`src/app/w/[slug]/integrations/page.tsx`)**:
   - Added "Test connection" button on saved connection card for non-OAuth providers with loading state.
   - Handled success and failure toasts using localized strings.

5. **Internationalization (`src/i18n/connection-test.ts`, `ar.json`, `en.json`)**:
   - Added `connectionTestErrorText` mapping API error codes to localized strings.
   - Added symmetric translation keys for EN and AR in `messages/en.json` and `messages/ar.json`.

6. **Fake Provider Server (`e2e/fakes/provider-server.ts`)**:
   - Updated `mizano` handler in fake provider to return distinct workspace identity bound to account token (`Alice A Mizano` for account a, `Bob B Mizano` for account b).

---

## Reviewer Finding Resolution Matrix

| Prior Finding on #215 | Resolution on #301 |
|-----------------------|-------------------|
| `route.ts:115` - bloated route logic | Refactored into separate modular files: `src/server/connection-test.ts` (44 lines) and `src/integrations/connection-test.ts` (72 lines). `route.ts` is a 12-line thin handler. |
| `mizano.ts:64` - provider definition | `src/integrations/providers/mizano.ts` kept canonical to `origin/main`; connection test logic lives cleanly in `src/integrations/connection-test.ts`. |
| `tests/mizano-provider.test.ts` helper and imports | Deleted legacy test file; test coverage provided via standard `tests/contract/mizano-connection.test.ts` (using `provider("mizano")` via registry) and unit test `tests/unit/test-connection.test.ts`. |
| 'valid API key' test assert | `tests/contract/mizano-connection.test.ts` explicitly asserts returned account label (`"Alice A Mizano"`), requests sent (`GET /api/health`, `GET /api/me`), and headers. |

---

## Verification Report

| AC | Verification Method / Command | Exit Code | Observed Result |
|---|---|---|---|
| **AC1** | `pnpm vitest run tests/contract/mizano-connection.test.ts tests/unit/test-connection.test.ts` (test: `returns the account label for a good key` & never echoes token; `succeeds for workspace owner/editor and returns account label without echoing secret`); `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:79-111` | 0 | **PASS** — API key is encrypted at rest using workspace secret envelope; API responses never return `token`; test endpoint takes no body and never echoes secret. |
| **AC2** | `pnpm vitest run tests/contract/mizano-connection.test.ts tests/unit/connection-test-i18n.test.ts tests/unit/test-connection.test.ts` (tests: 400 `AUTHENTICATION_FAILED`, 502 `PROVIDER_UNREACHABLE` with 8s deadline, 400 `EGRESS_BLOCKED`, 502 `PROVIDER_ERROR`; translation tests for EN and AR); `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:113-146` (UI card flows in EN and AR RTL) | 0 | **PASS** — Every error maps to a bounded code with user-friendly translated text in EN and AR (RTL); raw provider body discarded. |
| **AC3** | `pnpm vitest run tests/contract/mizano-connection.test.ts tests/contract/mizano-fake.test.ts tests/contract/mizano.test.ts tests/unit/connection-test-i18n.test.ts tests/unit/test-connection.test.ts` | 0 | **PASS** — 100 passed (100) across 5 test files against the mocked HTTP fake provider server (`e2e/fakes/provider-server.ts`). |
| **AC4** | `pnpm vitest related --run --passWithNoTests tests/contract/mizano-connection.test.ts tests/contract/mizano-fake.test.ts tests/unit/connection-test-i18n.test.ts tests/unit/test-connection.test.ts` & `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` | 0 | **PASS** — Tagged `@issue-301` e2e-army scenarios for API and UI (EN and AR RTL) covering `feat:fl-connections`, `feat:fl-integrations`, and `feat:fl-i18n-rtl`. |

---

## Changed Covering Tests

1. `tests/contract/mizano-connection.test.ts` (23 tests):
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
4. `tests/unit/test-connection.test.ts` (8 tests):
   - Unit tests covering `testConnection` authorization (`integration.manage`), non-UUID 404, missing connection 404, private connection ownership 403, creator permission, OAuth 400 rejection, and registry check.
5. `tests/unit/connection-test-i18n.test.ts` (11 tests):
   - Validates that every code from the test route (`AUTHENTICATION_FAILED`, `PROVIDER_UNREACHABLE`, `PROVIDER_ERROR`, `EGRESS_BLOCKED`, `NOT_CONNECTION_OWNER`, `CONNECTION_NOT_FOUND`, `UNKNOWN_PROVIDER`, `TEST_NOT_SUPPORTED`) resolves to non-empty, localized text in both English and Arabic.
   - Asserts Arabic contains Arabic characters (`/[؀-ۿ]/`) and never leaks the server's English message.
6. `tests/unit/i18n-content-text.test.ts` (43 tests):
   - Validates symmetric catalog keys in Arabic and English for Mizano provider and actions.
7. `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`:
   - `@issue-301 AC1/AC2: a saved Mizano connection keeps its scoped key server-side, and Test connection checks only the saved URL` (tags: `feat:fl-connections`, `lvl:api`)
   - `@issue-301 AC2: the saved Mizano connection's card offers a Test connection control that reports the account` (tags: `feat:fl-integrations`, `feat:fl-sign-in`, `lvl:ui`)
   - `@issue-301 AC2 Arabic: the Test connection control and its OK result are translated and the page is right-to-left` (tags: `feat:fl-i18n-rtl`, `feat:fl-integrations`, `lvl:ui`)

---

## Regression Proof: Fails on Base, Passes on Head

Tested command:
`pnpm vitest run tests/contract/mizano-connection.test.ts tests/unit/connection-test-i18n.test.ts`

### On Base (`origin/main`)
- `tests/contract/mizano-connection.test.ts` does not exist on `origin/main`.
- `tests/unit/connection-test-i18n.test.ts` does not exist on `origin/main`.
- `src/server/connection-test.ts` and `src/integrations/connection-test.ts` do not exist on `origin/main`.
- Command fails with exit code 1 (`No test files found, exiting with code 1`).

### On Head (`ai/301`)
- Command exits with code 0:
  `Test Files 2 passed (2)`
  `Tests 34 passed (34)`
- Across the full suite:
  `pnpm vitest run tests/contract/mizano-connection.test.ts tests/contract/mizano-fake.test.ts tests/contract/mizano.test.ts tests/unit/connection-test-i18n.test.ts tests/unit/test-connection.test.ts tests/unit/i18n-content-text.test.ts`
  `Test Files 6 passed (6)`
  `Tests 143 passed (143)`

---

## UI / RTL & LTR Verification

- **English UI:** On `/app/integrations` (or `/w/{slug}/integrations`), the Mizano connection card renders a "Test connection" button (`<Button size="sm">Test connection</Button>`). Clicking it executes `POST /api/workspaces/{wid}/connections/{cid}/test` and displays:
  `Connection OK — Alice A Mizano`
- **Arabic UI (RTL):** On `/app/integrations` with cookie `fl_locale=ar`:
  - `document.documentElement.dir` evaluates to `"rtl"`.
  - Button text is translated: `"اختبار الاتصال"`.
  - Successful result is translated: `"الاتصال سليم — Alice A Mizano"`.
  - Error messages resolve to Arabic strings (`integrations.card.testAuthFailed`, `testUnreachable`, `testProviderError`, `testEgressBlocked`, etc.) without falling back to English server strings.

---

## Static Checks and Verification Commands

```
# Vitest related / targeted test run
$ pnpm vitest run tests/contract/mizano-connection.test.ts tests/contract/mizano-fake.test.ts tests/contract/mizano.test.ts tests/unit/connection-test-i18n.test.ts tests/unit/test-connection.test.ts tests/unit/i18n-content-text.test.ts
 Test Files  6 passed (6)
      Tests  143 passed (143)
# Exit code: 0

# Lint (run synchronously)
$ pnpm lint
# Exit code: 0 (clean, no warnings, no errors)

# Typecheck
$ pnpm typecheck
# Exit code: 0 (clean, no errors)

# Evidence secrets check
$ node scripts/check-evidence-secrets.mjs
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
