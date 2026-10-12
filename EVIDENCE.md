# Evidence — Issue #141: Field validation harness scoring gaps

Verified on head `9621678` (code; this file and the Phase 4 report are the docs commit after it).

## Requirements and Verification

| Req ID | Description | Verification Method | Result | Commit |
|--------|-------------|---------------------|--------|--------|
| #141:117 | Do not score approved policy text as a cancellation promise | Unit test `scoreNoPromise` in `tests/unit/flowline-field-scoring.test.ts` strips approved information and EN/AR disclaimers before matching | 8/8 pass; disabling the fix (legacy matching) yields 1 failed / 7 passed | 5048e83, 2440c13 |
| #141:138 | Exercise the approval side of the review gate | Unit tests `scoreReviewGate`, `scoreApprovedOutboxEntry` and `scoreApprovedAgainstPacket` verify empty outbox before review, exactly one entry after approval, recipient match, text-only payload, no payment action, and the packet's VP-05 quoted policy, no-promise and consequential expectations | 8/8 pass; disabling `scoreReviewGate` yields 1 failed / 7 passed; the packet-expectation test (`9621678`) failed before the helper existed | 5048e83, 2440c13, 9621678 |
| #141:143 | Compare persisted records after the duplicate trial | Unit test `comparePersistedRows` checks `sameRowCount`, `sameRows`, `exactlyOneFollowUp`; harness in `field.spec.ts` reads `kv_entry` before and after the second VP-01 run | 8/8 pass; disabling `comparePersistedRows` yields 3 failed / 5 passed (duplicate-scoring and real-pack tests depend on it too) | 5048e83, 2440c13 |
| #141:160 | Verify the packet digest before recording it | Unit test `verifyPacketDigest` validates SHA256SUMS against files and records the `packet.json` digest; harness in `field.spec.ts` runs it before any scoring | 8/8 pass; disabling the check yields 1 failed / 7 passed | 5048e83, 2440c13 |

## Additional Regression Tests

| Test | Purpose | Verifies |
|------|---------|----------|
| `:138 the approved entry meets the packet's VP-05 expectation` | Approved body must quote the packet policy, make no promise, match the consequential flag, and carry no payment action when the packet says so | `scoreApprovedAgainstPacket` |
| `approval preserves the exact reviewed draft` | Approval payload must equal the reviewed proposal exactly | `outboxMatchesReviewedDraft` |
| `duplicate scoring requires one persisted copy` | Prevents empty snapshots or duplicate rows from passing | `exactlyOneFollowUp` |
| `the real pack persists the follow-up under its store_key` | Confirms `follow_up_record.store_key` matches the `data.store` key and the persisted value equals the record | Runs the compiled customer-follow-up pack against a memory store |

## Test Execution Evidence

```
$ pnpm test flowline-field --maxWorkers=2
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

- Typecheck: `node node_modules/typescript/bin/tsc --noEmit` — clean
- Lint: `eslint` on `tests/helpers/field-scoring.ts` and `tests/unit/flowline-field-scoring.test.ts` — clean
- Frozen run `20261001-d224cfb` evidence unchanged (no diff vs main)

## Mutation Verification

Each original fix in `tests/helpers/field-scoring.ts` was disabled in turn and restored from git after each run (results above, head `9621678`). Every mutation makes at least one assertion fail, so the tests depend on the fixes.

## Notes

- No e2e-army test added: this is an internal scoring harness change with no user-facing flow modification.
- Live Playwright field spec (`field.spec.ts`) was not run: it needs a test stack (Docker, `.env.test`, `DATABASE_URL`). CI gate will execute the built branch.
