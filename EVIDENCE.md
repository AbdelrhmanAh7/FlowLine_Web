# Evidence — Issue #141: Field validation harness scoring gaps

## Requirements and Verification

| Req ID | Description | Verification Method | Result | Commit |
|--------|-------------|---------------------|--------|--------|
| #141:117 | Do not score approved policy text as a cancellation promise | Unit test `scoreNoPromise` in `tests/unit/flowline-field-scoring.test.ts:17-27` strips approved information and EN/AR disclaimers before matching | 7/7 tests pass; mutation of fix yields 1 failed / 6 passed | 5048e83, 2440c13 |
| #141:138 | Exercise the approval side of the review gate | Unit test `scoreReviewGate` + `scoreApprovedOutboxEntry` in `tests/unit/flowline-field-scoring.test.ts:29-49` verifies empty outbox before review, exactly one entry after approval, recipient match, text-only payload, no payment action | 7/7 tests pass; mutation of fix yields 1 failed / 6 passed | 5048e83, 2440c13 |
| #141:143 | Compare persisted records after the duplicate trial | Unit test `comparePersistedRows` in `tests/unit/flowline-field-scoring.test.ts:51-62` queries `kv_entry` directly, asserts `sameRowCount`, `sameRows`, `exactlyOneFollowUp`; harness in `field.spec.ts:163-173` does same | 7/7 tests pass; mutation of fix yields 1 failed / 6 passed | 5048e83, 2440c13 |
| #141:160 | Verify the packet digest before recording it | Unit test `verifyPacketDigest` in `tests/unit/flowline-field-scoring.test.ts:64-80` validates SHA256SUMS against files, records `packet.json` digest; harness in `field.spec.ts:17-19` runs before any scoring | 7/7 tests pass; mutation of fix yields 1 failed / 6 passed | 5048e83, 2440c13 |

## Additional Regression Tests Added

| Test | Purpose | Verifies |
|------|---------|----------|
| `approval preserves the exact reviewed draft` (line 82-90) | Approval payload must equal reviewed proposal exactly | `outboxMatchesReviewedDraft` check |
| `duplicate scoring requires one persisted copy` (line 92-103) | Prevents empty snapshots or duplicate rows from passing | `exactlyOneFollowUp` requires exactly one matching row in both snapshots |
| `the real pack persists the follow-up under its store_key` (line 105-124) | Confirms `follow_up_record.store_key` matches `data.store` key and persisted value equals record | Runs real compiled customer-follow-up pack against memory store |

## Test Execution Evidence

```
$ pnpm test flowline-field --maxWorkers=2

Test Files  1 passed (1)
Tests  7 passed (7)
```

- Typecheck: `node node_modules/typescript/bin/tsc --noEmit` — clean
- Lint: `pnpm lint` — clean
- Frozen run `20261001-d224cfb` evidence unchanged (no diff vs main)

## Mutation Verification

Each of the four original fixes in `tests/helpers/field-scoring.ts` was temporarily disabled independently; each mutation caused exactly 1 test failure (6 passed), confirming the assertions depend on the fixes.

## Notes

- No e2e-army test added: this is an internal scoring harness change with no user-facing flow modification.
- Live Playwright field spec (`field.spec.ts`) requires a test stack (Docker, `.env.test`, `DATABASE_URL`); not runnable locally. CI gate will execute it on the built branch.
- Documentation updated: `docs/implementation/PHASE4_BETA_REPORT.md` and `docs/company-builder/VALIDATION_REPORT.md` reflect 7/7 tests and 1/6 mutation results (commit 6da8c2a).