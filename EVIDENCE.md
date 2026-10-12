# Evidence — Issue #141: Field validation harness scoring gaps

Code under test: `tests/helpers/field-scoring.ts`, `tests/unit/flowline-field-scoring.test.ts` and the next-round `field.spec.ts`, unchanged since `475c293`. Every result below was observed on `4a241db` (the merge of origin/main into `ai/141`; later commits on the branch are docs-only). Earlier recordings on `8e0090c`, `981b8b9` and `9621678` are superseded by this one.

## Requirements and Verification

| Req ID | Description | Verification Method | Result | Commit |
|--------|-------------|---------------------|--------|--------|
| #141:117 | Do not score approved policy text as a cancellation promise | Unit test `scoreNoPromise` in `tests/unit/flowline-field-scoring.test.ts` strips approved information and EN/AR disclaimers before matching | 8/8 pass; reverting to legacy matching yields **1 failed / 7 passed** (assertion `:117 approved policy text is not a cancellation promise` fails) | 4a241db |
| #141:138 | Exercise the approval side of the review gate | Unit tests `scoreReviewGate`, `scoreApprovedOutboxEntry` and `scoreApprovedAgainstPacket` verify empty outbox before review, exactly one entry after approval, recipient match, text-only payload, no payment action, and the packet's VP-05 quoted policy, no-promise and consequential expectations; **field.spec.ts now asserts all review-gate checks pass** | 8/8 pass; disabling `scoreReviewGate` alone yields **1 failed / 7 passed** (`:138 the review gate is exercised on the approval side too`); disabling the approval-payload helpers `scoreApprovedOutboxEntry` and `scoreApprovedAgainstPacket` yields **3 failed / 5 passed** (that test, `:138 the approved entry meets the packet's VP-05 expectation` and `approval preserves the exact reviewed draft`) | 4a241db |
| #141:143 | Compare persisted records after the duplicate trial | Unit test `comparePersistedRows` checks `sameRowCount`, `sameRows`, `exactlyOneFollowUp`; harness in `field.spec.ts` reads `kv_entry` before and after the second VP-01 run **and explicitly asserts all three persisted-row checks** | 8/8 pass; reverting `comparePersistedRows` yields **3 failed / 5 passed** (assertions `:143 persisted records are compared after the duplicate trial`, `duplicate scoring requires one persisted copy`, `the real pack persists the follow-up under its store_key` fail) | 4a241db |
| #141:160 | Verify the packet digest before recording it | Unit test `verifyPacketDigest` validates SHA256SUMS against files and records the `packet.json` digest; harness in `field.spec.ts` runs it before any scoring | 8/8 pass; reverting the check yields **1 failed / 7 passed** (assertion `:160 the packet digest is verified before it is recorded` fails) | 4a241db |

## Revert-Fails Proof (observed on `4a241db`)

| Gap | Command | Failing Assertion(s) | Result After Restore |
|-----|---------|---------------------|---------------------|
| :117 | `pnpm test flowline-field` (with `scoreNoPromise` reverted to legacy) | `:117 approved policy text is not a cancellation promise` | 8/8 pass |
| :138 | `pnpm test flowline-field` (with `scoreReviewGate` checks forced true) | `:138 the review gate is exercised on the approval side too` (1 failed / 7 passed) | 8/8 pass |
| :138 | `pnpm test flowline-field` (with the checks of `scoreApprovedOutboxEntry` and `scoreApprovedAgainstPacket` forced true) | `:138 the review gate is exercised on the approval side too`, `:138 the approved entry meets the packet's VP-05 expectation`, `approval preserves the exact reviewed draft` (3 failed / 5 passed) | 8/8 pass |
| :143 | `pnpm test flowline-field` (with `comparePersistedRows` reverted) | `:143 persisted records are compared after the duplicate trial`, `duplicate scoring requires one persisted copy`, `the real pack persists the follow-up under its store_key` | 8/8 pass |
| :160 | `pnpm test flowline-field` (with `verifyPacketDigest` reverted) | `:160 the packet digest is verified before it is recorded` | 8/8 pass |

## Additional Regression Tests

| Test | Purpose | Verifies |
|------|---------|----------|
| `:138 the approved entry meets the packet's VP-05 expectation` | Approved body must quote the packet policy, make no promise, match the consequential flag, and carry no payment action when the packet says so | `scoreApprovedAgainstPacket` |
| `approval preserves the exact reviewed draft` | Approval payload must equal the reviewed proposal exactly | `outboxMatchesReviewedDraft` |
| `duplicate scoring requires one persisted copy` | Prevents empty snapshots or duplicate rows from passing | `exactlyOneFollowUp` |
| `the real pack persists the follow-up under its store_key` | Confirms `follow_up_record.store_key` matches the `data.store` key and the persisted value equals the record | Runs the compiled customer-follow-up pack against a memory store |

## Test Execution Evidence

```
$ pnpm test flowline-field
  Test Files  1 passed (1)
        Tests  8 passed (8)
```

- Typecheck and lint: see the Phase 4 report entry for what was run on this head and what was not
- Frozen run `20261001-d224cfb` evidence unchanged (`git diff origin/main...HEAD` lists no file under `artifacts/company-builder/validation/20261001-d224cfb/` or other earlier runs)

## Mutation Verification

Each original fix in `tests/helpers/field-scoring.ts` was disabled in turn and restored from git after each run (results above, `4a241db`). Every mutation makes at least one assertion fail, so the tests depend on the fixes.

## Notes

- No e2e-army test added: this is an internal scoring harness change with no user-facing flow modification.
- Live Playwright field spec (`field.spec.ts`) was not run: it needs a test stack (Docker, `.env.test`, `DATABASE_URL`). CI gate will execute the built branch.
- **New explicit assertions in `field.spec.ts`**: review gate checks (line 207) and persisted-row checks (lines 212-214) now have `expect` assertions that fail the test if any check fails, directly addressing the review threads on PR #193.