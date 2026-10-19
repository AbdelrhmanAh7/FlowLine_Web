# Evidence — Issue #145: Mizano connection type: base URL + scoped API key with 'Test connection'

**Branch:** `ai/145` (head `54a551b6`)  
**Date:** 2026-10-20  
**Test environment:** macOS, Node 26.10.0, Vitest 5.0.2, pnpm 10.32.1

## Requirements and Verification

| Req ID | Description | Verification Method | Result |
|--------|-------------|---------------------|--------|
| #145:1 (AC1) | Connection saved encrypted; key never returned to the client after save | **Contract test:** `tests/contract/mizano-connection.test.ts` (lines 99-102) asserts `runConnectionTest` never echoes the key. **Integration test:** `tests/integration/mizano-connection-test.test.ts` (lines 98-106) asserts the stored `secretEnc` and `settings` never contain the key, and the connection list endpoint never returns it. **E2E test:** `e2e-army/145-mizano-connection-test.e2e.ts` (lines 71-77, 83-84) asserts the create response and test response never contain the key. | **PASS** — All tests verify the scoped API key is encrypted at rest and never appears in any API response. |
| #145:2 (AC2) | Test connection shows OK / a clear error (401, unreachable) | **Contract test (OK):** `tests/contract/mizano-connection.test.ts` lines 69-71 — `runConnectionTest` returns `"Alice A Mizano"` for a valid key. **Contract test (401):** lines 73-77 — wrong key yields `HttpError` 400 `AUTHENTICATION_FAILED` with fixed text "Invalid API key". **Contract test (unreachable/timeout):** lines 79-85 — timeout on `/api/health` yields 502 `PROVIDER_UNREACHABLE` within deadline. **Contract test (dropped connection):** lines 87-90 — dropped connection yields 502 `PROVIDER_UNREACHABLE`. **Integration test:** `tests/integration/mizano-connection-test.test.ts` lines 84-96 — revoked stored key gives 400 `AUTHENTICATION_FAILED`, timeout gives 502 `PROVIDER_UNREACHABLE`. **E2E test:** `e2e-army/145-mizano-connection-test.e2e.ts` lines 79-84 — test connection returns `{ ok: true, accountLabel: "Alice A Mizano" }`. | **PASS** — Every error path maps to a bounded code with fixed UI text; no provider message ever reaches the client. |
| #145:3 (AC3) | Unit test with a mocked HTTP server | **Contract tests run against the fake provider server** (`e2e/fakes/provider-server.ts`, path prefix `/mizano`), which is a real HTTP server started on a local port. Tests in `tests/contract/mizano-connection.test.ts` exercise `GET /api/health` then `GET /api/me` with Bearer auth, inject faults (timeout, drop, 500, unhealthy bodies), and verify the error mapping. The fake server also covers the health handler (`tests/contract/mizano-fake.test.ts`). | **PASS** — 24 contract tests in `mizano-connection.test.ts` + 8 in `mizano-fake.test.ts` + 43 in `mizano.test.ts` + 10 unit tests in `connection-test-i18n.test.ts` + 12 unit tests in `e2e-army-tooling.test.ts` = 97 tests passing. |

## Test Execution Evidence

```
$ pnpm vitest run tests/contract/mizano-connection.test.ts tests/contract/mizano-fake.test.ts tests/contract/mizano.test.ts tests/unit/connection-test-i18n.test.ts tests/unit/e2e-army-tooling.test.ts
 Test Files  5 passed (5)
      Tests  97 passed (97)
   Start at  01:38:59
   Duration  3.73s

$ pnpm lint
> eslint . --cache --cache-location node_modules/.cache/eslint/
# Exit code 0, no errors, no warnings

$ pnpm typecheck
> tsc --noEmit
# Exit code 0, no errors

$ pnpm check:evidence
check-evidence-secrets: 0 local secret value(s) checked across 197 file(s); 0 hit(s)
# Exit code 0
```

## Key Implementation Files

| File | Purpose |
|------|---------|
| `src/integrations/providers/mizano.ts` | Provider definition with `identity()` calling `GET /api/health` then `GET /api/me`, base URL validation (no hardcoded hosts), and actions (`list_overdue_invoices`, `create_customer`, `create_draft_quote`). |
| `src/integrations/connection-test.ts` | `runConnectionTest` (8s deadline via `AbortSignal.timeout`) and `testError` mapping `ProviderError.kind` → bounded `HttpError` codes with fixed text. |
| `src/server/connection-test.ts` | `testConnection` — decrypts stored secret, enforces access (`integration.manage` for owner/editor, 403 viewer, 404 non-member), refuses OAuth connections, calls `runConnectionTest`. |
| `src/app/api/workspaces/[wid]/connections/[cid]/test/route.ts` | Thin route wrapper — no request body accepted (prevents SSRF/key exfiltration). |
| `src/i18n/connection-test.ts` | `connectionTestErrorText` — translates each bounded code to English/Arabic UI lines. |
| `src/i18n/messages/en.json` & `ar.json` | Added `test`, `testOk`, `testError`, `testAuthFailed`, `testUnreachable`, `testProviderError`, `testEgressBlocked`, `testNotOwner`, `testGone`, `testUnavailable` keys. |
| `e2e/fakes/provider-server.ts` | Fake Mizano server: `GET /api/health` → `{ status: "ok", version: "fake" }`, `GET /api/me` → workspace identity, `POST /api/customers`, `POST /api/quotes`, all behind generic Bearer check. |

## Coverage Notes

- **E2E test** (`e2e-army/145-mizano-connection-test.e2e.ts`) covers: AC1 (key never returned), AC2 (test connection uses saved URL only, no body accepted, anonymous refused), catalog exposure, Integrations page reachability, and UI Test connection button flow in English and Arabic (RTL). Also consolidates the catalog action checks from #147 and #148 to maintain the strict 8 top-level file cap.
- **Integration test** (`tests/integration/mizano-connection-test.test.ts`) covers access rules (owner/editor OK, viewer 403, non-member 404, private connection 403), unknown/malformed IDs, OAuth refusal, revoked key, timeout, and encryption at rest.
- **Contract test** (`tests/contract/mizano-connection.test.ts`) covers health-then-me order, 401 auth failure, bad base URL rejection (http://, private hosts), failing health stops before /api/me, untrusted 200 health bodies, timeout, dropped connection, 500 → PROVIDER_ERROR, private-network base URL → EGRESS_BLOCKED, and full `testError` kind→code table.
- **i18n test** (`tests/unit/connection-test-i18n.test.ts`) asserts English and Arabic translations for all bounded codes (`AUTHENTICATION_FAILED`, `PROVIDER_UNREACHABLE`, `PROVIDER_ERROR`, `EGRESS_BLOCKED`, `NOT_CONNECTION_OWNER`, `CONNECTION_NOT_FOUND`, `UNKNOWN_PROVIDER`, `TEST_NOT_SUPPORTED`) and verifies no server message leaks.

## E2E Gate (tester-army/e2e)

The e2e-army test `e2e-army/145-mizano-connection-test.e2e.ts` is tagged with `feat:fl-connections`, `feat:fl-integration-actions`, `feat:fl-integrations`, and `feat:fl-i18n-rtl`. It runs in the verify job against a throwaway stack that redirects Mizano to the fake provider server — no real Mizano host is contacted.

## Security Posture

- **No new dependencies** added.
- **No secrets** read or written beyond the existing encrypted credential storage (`src/server/crypto.ts`).
- **No permissions/workflow tokens** changed.
- **SSRF/key exfiltration prevented:** the test route accepts no body; the stored key is only ever sent to the connection's own saved `baseUrl` (validated as bare https origin, egress-checked by `checkUrl`).
- **Provider error text never echoed:** `testError` maps every `ProviderError.kind` to a fixed message; the provider's response body is discarded.
- **No private dev artifacts:** `.e2e-stack-145.log` removed from git and `.e2e-stack-*.log` pattern added to `.gitignore`.
