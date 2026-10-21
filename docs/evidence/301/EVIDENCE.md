# Evidence for Issue #301: Mizano connection type: base URL + scoped API key with 'Test connection' (replaces #215, closes #145)

## Acceptance Criteria

| AC | Description | Verification |
|----|-------------|--------------|
| **AC1** | Mizano connection type supports base URL and scoped API key, stored encrypted at rest via crypto v2 envelope (`openSecret`), never echoed back in plain text or connection listings | `tests/contract/mizano-connection.test.ts`, `tests/unit/test-connection.test.ts`, and `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` |
| **AC2** | Test connection endpoint `POST /api/workspaces/[wid]/connections/[cid]/test` verifies saved credentials with an 8 s deadline: calls Mizano `GET /api/health` then `GET /api/me`, returns `{ ok: true, provider: "Mizano", accountLabel }` without leaking secret, bounds and sanitizes failures (`AUTHENTICATION_FAILED`, `PROVIDER_UNREACHABLE`, `EGRESS_BLOCKED`, `PROVIDER_ERROR`, `TEST_NOT_SUPPORTED`, `NOT_CONNECTION_OWNER`), and refuses caller-supplied URL/key | `tests/contract/mizano-connection.test.ts` (14 tests), `tests/unit/test-connection.test.ts` (8 tests), `tests/contract/mizano-fake.test.ts` (8 tests) |
| **AC3** | Integrations UI (`/w/[slug]/integrations`): saved connection card displays "Test connection" button for non-OAuth providers (Mizano), triggers test mutation, and displays localized success ("Connection OK — {account}" / "الاتصال سليم — {account}") or error toast with full Arabic RTL layout support | `src/app/w/[slug]/integrations/page.tsx`, `tests/unit/connection-test-i18n.test.ts` (10 tests), `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` |
| **AC4** | E2E-army suite includes API test and UI tests (LTR and RTL) tagged `@issue-301` and covering touched features (`feat:fl-connections`, `feat:fl-integrations`, `feat:fl-i18n-rtl`) | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` (3 tests) |

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

## Verification Commands & Outputs

```bash
# 1. Vitest related test run
npx vitest related --run --passWithNoTests --maxWorkers=1 \
  'src/app/api/workspaces/[wid]/connections/[cid]/test/route.ts' \
  'src/app/w/[slug]/integrations/page.tsx' \
  src/i18n/connection-test.ts \
  src/integrations/connection-test.ts \
  src/server/connection-test.ts \
  tests/contract/mizano-connection.test.ts \
  tests/contract/mizano-fake.test.ts \
  tests/unit/connection-test-i18n.test.ts \
  tests/unit/test-connection.test.ts

# Output:
# ✓ |contract| tests/contract/mizano-connection.test.ts (23 tests)
# ✓ |contract| tests/contract/mizano-fake.test.ts (8 tests)
# ✓ |unit| tests/unit/connection-test-i18n.test.ts (10 tests)
# ✓ |unit| tests/unit/test-connection.test.ts (8 tests)
# Test Files 4 passed (4)
# Tests 49 passed (49)
# Exit code: 0

# 2. Typecheck
pnpm typecheck
# Output: Exit code 0 (tsc --noEmit clean)

# 3. Lint
pnpm lint
# Output: Exit code 0 (eslint clean)

# 4. Check evidence secrets
node scripts/check-evidence-secrets.mjs
# Output: 0 local secret value(s) checked across 180 file(s); 0 hit(s). Exit code 0
```

## Reviewer Finding Resolution Matrix

| Prior Finding on #215 | Resolution on #301 |
|-----------------------|-------------------|
| `route.ts:115` - bloated route logic | Refactored into separate modular files: `src/server/connection-test.ts` (44 lines) and `src/integrations/connection-test.ts` (72 lines). `route.ts` is a 12-line thin handler. |
| `mizano.ts:64` - provider definition | `src/integrations/providers/mizano.ts` kept canonical to `origin/main`; connection test logic lives cleanly in `src/integrations/connection-test.ts`. |
| `tests/mizano-provider.test.ts` helper and imports | Deleted legacy test file; test coverage provided via standard `tests/contract/mizano-connection.test.ts` (using `provider("mizano")` via registry) and unit test `tests/unit/test-connection.test.ts`. |
| 'valid API key' test assert | `tests/contract/mizano-connection.test.ts` explicitly asserts returned account label (`"Alice A Mizano"`), requests sent (`GET /api/health`, `GET /api/me`), and headers. |
