# Issue #222 — Mizano fake health handler

Part of #145; status: implemented locally, awaiting harness submission and review on PR #225.

The handler at `e2e/fakes/provider-server.ts:1141` is registered beside Snowflake at `:1945`. It uses dispatch's existing authentication, returns 200 `{ status: "ok", version: "fake" }` for authenticated `GET /api/health`, and 404 `{ message: "Not found" }` for other authenticated paths/methods. Invalid credentials retain the default 401 `{ message: "Unauthorized" }`.

Root cause of the reported 429: previous review responses added a per-account rate limit absent from the acceptance contract, duplicate authentication, and unsupported comments. Commit `63f8a37331974789c3162aee86b07737ca77bf81` already removed these; this continuation verifies and strengthens its regression coverage without changing the parent's logic. Reuses the existing `startFake` helper, generic auth, and Vitest; no dependency needed.

On 2026-10-13, the extended `tests/contract/mizano-fake.test.ts:17` failed against the historical `e1180ae` handler with `expected 429 to be 200` for both seeded accounts (2 failed, 2 passed). The historical file was restored immediately afterward. The auth regression at `:25` also checks that dispatch rejects missing/unknown tokens on an unsupported path before a 404 can be returned.

Local verification with the installed Node 24 runtime: `pnpm typecheck`, `pnpm lint`, and `nice -n 10 pnpm exec vitest run tests/contract/mizano-fake.test.ts tests/contract/zendesk.test.ts --maxWorkers=2` pass (2 files, 9 tests, 0 failures). The repository script is `typecheck`, not the brief's `type-check`. Loopback access is required; the sandbox-only attempt failed at `listen EPERM`, so verification ran with loopback permission.

E2E: not needed — this changes internal fake-server test infrastructure and no user-facing flow. Contract tests exercise the actual fake server; the FlowLine app has no `/mizano` route. Full suite/build are left to hosted CI per the brief. No push, PR mutation, production verification, or deployment is claimed.
