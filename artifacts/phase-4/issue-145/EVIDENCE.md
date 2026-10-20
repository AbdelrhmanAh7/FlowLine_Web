# Evidence — Issue #145: Mizano connection type: base URL + scoped API key with 'Test connection'

**Branch:** `ai/145` (head `82ebf3c1`)  
**Date:** 2026-10-20  
**Test environment:** macOS, Node 26.10.0, Vitest 5.0.2, pnpm 10.32.1  
**Originating Sentry issue:** None (feature request #145; part of FlowLine G5 #144)  

## Explicit Acceptance Criteria & Verification Mapping

| ID | Description | Covering Tests | Verification Command | Exit Code | Result |
|----|-------------|----------------|----------------------|-----------|--------|
| **AC1** | Connection saved encrypted; key never returned to the client after save | `tests/contract/mizano-connection.test.ts:99-102` (`runConnectionTest` never echoes key); `tests/integration/mizano-connection-test.test.ts:98-106` (`secretEnc` at rest, connection list redaction); `e2e-army/145-mizano-connection-test.e2e.ts:71-77,83-84` (create/test responses omit key). | `pnpm vitest run tests/contract/mizano-connection.test.ts` | 0 | **PASS** — Scoped API key encrypted at rest; never returned in API responses or UI. |
| **AC2** | Test connection shows OK / a clear error (401, unreachable) | `tests/contract/mizano-connection.test.ts:69-90` (OK returns accountLabel, 401 maps to `AUTHENTICATION_FAILED`, unreachable/timeout maps to `PROVIDER_UNREACHABLE`); `tests/integration/mizano-connection-test.test.ts:84-96` (revoked key, timeout); `tests/unit/connection-test-i18n.test.ts:1-41` (all codes mapped to English and Arabic translations); `e2e-army/145-mizano-connection-test.e2e.ts:79-84,179-206` (OK and error card flows, LTR and RTL Arabic). | `pnpm vitest run tests/contract/mizano-connection.test.ts tests/unit/connection-test-i18n.test.ts` | 0 | **PASS** — Every error maps to a bounded code with user-friendly translated text in EN and AR (RTL); raw provider body discarded. |
| **AC3** | Unit test with a mocked HTTP server | `tests/contract/mizano-connection.test.ts:1-126` (24 tests against local fake provider server `e2e/fakes/provider-server.ts`); `tests/contract/mizano-fake.test.ts:1-55` (8 tests for fake server health and me handlers); `tests/contract/mizano.test.ts` (43 contract tests). | `pnpm vitest run tests/contract/mizano-connection.test.ts tests/contract/mizano-fake.test.ts tests/contract/mizano.test.ts` | 0 | **PASS** — 75 contract tests against the mocked/fake HTTP server with faults, auth verification, and health checking. Total 104 tests across 5 files including i18n and tooling guards. |

## Test Execution Evidence

```
$ pnpm vitest run tests/contract/mizano-connection.test.ts tests/contract/mizano-fake.test.ts tests/contract/mizano.test.ts tests/unit/connection-test-i18n.test.ts tests/unit/e2e-army-tooling.test.ts
 Test Files  5 passed (5)
      Tests  104 passed (104)
   Start at  05:32:03
   Duration  3.41s

$ pnpm lint
> eslint . --cache --cache-location node_modules/.cache/eslint/
# Exit code 0, no errors, no warnings

$ pnpm typecheck
> tsc --noEmit
# Exit code 0, no errors

$ pnpm check:evidence
check-evidence-secrets: 0 local secret value(s) checked across 176 file(s); 0 hit(s)
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
