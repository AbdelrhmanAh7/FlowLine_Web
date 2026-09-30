# Checkpoint 23 — focused recovery regression

Candidate checkpoint: `77879d9db12c670914843f917c900d83ed332dda` (primary-provided frozen cp23). Date: 2026-09-30. Bounded helper validation, not independent coordinator review or a full gate.

Scope: only `tests/integration/ai-review-wavec.test.ts`, one Vitest worker. Primary confirmed full suite/build/browser/benchmark lanes stopped before this window. Owner MFA takeover remained private and was not inspected by helper.

Initial launch: `node scripts/with-env.mjs .env.test vitest run --project integration tests/integration/ai-review-wavec.test.ts --maxWorkers=1`. Exit 1 before tests: local Vitest executable was absent from direct PowerShell PATH. No test assertions ran in this attempt; retained here as launcher failure.

Corrected launch: `pnpm exec node scripts/with-env.mjs .env.test vitest run --project integration tests/integration/ai-review-wavec.test.ts --maxWorkers=1`. Package runner supplies the existing local-bin PATH; same existing test-env wrapper and test database. No credential values or database URL retained here.

Result: **exit 0, 1 file passed, 12 tests passed**. Vitest 5.0.2; start 20:18:29 local; duration 9.84 seconds. Supervised session 8343 finished. No repeat, wider suite or persistent test server started by helper.

The three-line fixture-isolation patch recovers stale synthetic leases before the existing setup drain, before per-test provider reset/request baseline. All exact-one-send, retained-777-charge, attempt-sequence and recovered-attempt assertions remain unchanged and passed.

Failure cause is established in `recovery-failure-diagnosis.json`: target preserved successful recovery and 194/777/194 ledger entries; two other synthetic runs were recovered after its request-count baseline. Initial cp22 full-suite failure remains preserved in `cp22-integration.log` (459/460). This focused pass does not replace the required cp23 full integration gate or independent review.

No browser, secret, external-service operation, commit or push performed. MERGED: NO. PUBLIC PRODUCTION APPROVED: NO. Spend: $0.
