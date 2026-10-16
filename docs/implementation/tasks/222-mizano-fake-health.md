# Issue #222 — Mizano fake health handler

Part of #145; status: implemented locally, awaiting harness submission and review on PR #225.

The handler at `e2e/fakes/provider-server.ts:1141` is registered beside Snowflake at `:1945`. It uses dispatch's existing authentication, returns 200 `{ status: "ok", version: "fake" }` for authenticated `GET /api/health`, and 404 `{ message: "Not found" }` for other authenticated paths/methods. Invalid credentials retain the default 401 `{ message: "Unauthorized" }`.

Root cause of the reported 429: previous review responses added a per-account rate limit absent from the acceptance contract, duplicate authentication, and unsupported comments. Commit `63f8a37331974789c3162aee86b07737ca77bf81` already removed these; this continuation verifies and strengthens its regression coverage without changing the parent's logic. Reuses the existing `startFake` helper, generic auth, and Vitest; no dependency needed.

On 2026-10-13, the extended `tests/contract/mizano-fake.test.ts:17` failed against the historical `e1180ae` handler with `expected 429 to be 200` for both seeded accounts (2 failed, 2 passed). The historical file was restored immediately afterward. The auth regression at `:25` also checks that dispatch rejects missing/unknown tokens on an unsupported path before a 404 can be returned.

Local verification with the installed Node 24 runtime: `pnpm typecheck`, `pnpm lint`, and `nice -n 10 pnpm exec vitest run tests/contract/mizano-fake.test.ts tests/contract/zendesk.test.ts --maxWorkers=2` pass (2 files, 9 tests, 0 failures). The repository script is `typecheck`, not the brief's `type-check`. Loopback access is required; the sandbox-only attempt failed at `listen EPERM`, so verification ran with loopback permission.

E2E: not needed — this changes internal fake-server test infrastructure and no user-facing flow. Contract tests exercise the actual fake server; the FlowLine app has no `/mizano` route. Full suite/build are left to hosted CI per the brief. No push, PR mutation, production verification, or deployment is claimed.

## Extension for #147 (create steps, 2026-10-15)

Part of #147; status: implemented locally, awaiting harness submission and review on PR #219.

The same handler now also answers `GET /api/me` with the workspace bound to the scoped key (`{ id: "mizano-ws-a", workspaceName: "Alice A Mizano" }` for `test-token`, `mizano-ws-b`/`Bob B Mizano` for `second-account-token`; #145's Test connection reports that name) and the two write steps: `POST /api/customers` and `POST /api/quotes` require an `Idempotency-Key` (400 `{ message: "Idempotency-Key header is required" }` without it), insert `{ id: "cust_fake_N" | "quote_fake_N", ...body }` (`201`) and replay that stored record with `200` for a key already seen for that path, so a repeated run + node key inserts nothing. `GET /__fake/state/mizano` returns `{ customers, quotes }`. This makes #147's AC2 ("re-running the same run creates no second customer/quote") observable over real HTTP: `createProviderHttp` redirects provider calls to the fake in `FLOWLINE_ENV=test` (`src/integrations/http.ts:9`), so a test can drive the real adapter (`tests/contract/mizano-http.test.ts`) — exact body, `Idempotency-Key` header, and one record for a repeated key — instead of a `vi.fn`.

Verification: `nice -n 10 npx vitest run --project contract tests/contract/mizano-http.test.ts tests/contract/mizano-fake.test.ts tests/contract/mizano.test.ts` passes (3 files, 54 tests). The stale path/method 404 assertion in `tests/contract/mizano-fake.test.ts` was updated: `/api/me` is no longer 404 and `/api/invoices` still is.

E2E: not needed — still internal fake-server/test infrastructure; the shipped `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` remains the UI catalog check. No push, PR mutation, or deployment is claimed by this section.
