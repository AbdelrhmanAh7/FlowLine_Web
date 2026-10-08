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

---

# Evidence: Issue #62 (Dependabot alert #3: source-map-js ≥1.2.2)

Checked against commit `HEAD` on branch `ai/62` at 2026-10-13 UTC by the AI implementer.
Requirement IDs from PRD draft `3f227121-0472-8132-9cd1-d43bb8d7ba54`.

## Requirements Verification

| Requirement ID | Description | Status | Verification Details |
| --- | --- | --- | --- |
| REQ-FL-62-1 | Update `pnpm-lock.yaml` file to version 1.2.2 or higher | VERIFIED | `source-map-js` upgraded from `1.2.1` to `1.2.2` via `pnpm-workspace.yaml` overrides |
| REQ-FL-62-2 | Create a tracked PR to reflect the `pnpm-lock.yaml` update | READY | Branch `ai/62` tracked to issue #62, diff strictly scoped under ~40 lines |
| REQ-FL-62-3 | Run the fast tier CI pipeline after updating the lockfile | VERIFIED | Local focused checks passed: lint (0 errors), typecheck (0 errors), unit tests (1248/1248 passed across 98 suites), contract tests (468/468 passed across 23 suites), build validated |
| REQ-FL-62-4 | Alert #3 is closed as fixed | POST-MERGE | Dependabot closes alert #3 automatically upon merge to `main` |
| REQ-FL-62-5 | `gh api repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts?state=open --jq length` returns 0 (or only alerts newer than this issue) | POST-MERGE | Pre-merge query returns 1 (`source-map-js`, alert #3); will return 0 after merge to default branch |
| REQ-FL-62-6 | The `pnpm-lock.yaml` file reflects the updated version 1.2.2 | VERIFIED | Verified by `tests/unit/dependency-advisories.test.ts` (`@issue-62 AC1`); lockfile contains `source-map-js@1.2.2:` and zero occurrences of `1.2.1` |

## First-Hand Command Outputs

### 1. Acceptance test: lockfile advisory check
`pnpm vitest run tests/unit/dependency-advisories.test.ts`
```
 ✓ |unit| tests/unit/dependency-advisories.test.ts (1 test) 2ms
   ✓ dependency advisories security check (1)
     ✓ @issue-62 AC1: lockfile resolves source-map-js >= 1.2.2 1ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### 2. Drizzle Tooling Prune regression check
`pnpm vitest run tests/unit/drizzle-tooling-prune.test.ts`
```
 ✓ |unit| tests/unit/drizzle-tooling-prune.test.ts (2 tests) 18ms
   ✓ Drizzle Kit unused loader removal (2)
     ✓ keeps the audited Kit version and verifies its shipped runtime never references the removed loader 16ms
     ✓ removes the vulnerable binary graph from the lockfile instead of suppressing the advisory 1ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

### 3. Unit test suite
`pnpm test`
```
 Test Files  98 passed (98)
      Tests  1248 passed (1248)
   Duration  9.73s
```

### 4. Contract test suite
`pnpm test:contract`
```
 Test Files  23 passed (23)
      Tests  468 passed (468)
   Duration  17.33s
```

### 5. Static analysis
`pnpm lint && pnpm typecheck && pnpm check:evidence`
```
eslint . --cache: clean (exit 0)
tsc --noEmit: clean (exit 0)
check-evidence-secrets: 0 local secret value(s) checked across 1307 file(s); 0 hit(s)
```

### 6. Dependabot alert #3 status (pre-merge)
`gh api repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts/3 --jq '{number, state, dependency: .dependency.package.name, advisory: .security_advisory.ghsa_id, patched: .security_vulnerability.first_patched_version.identifier}'`
```json
{
  "number": 3,
  "state": "open",
  "dependency": "source-map-js",
  "advisory": "GHSA-68fv-2mgg-jv7q",
  "patched": "1.2.2"
}
```
`gh api 'repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts?state=open' --jq length`
```
1
```
Post-merge verification step: after merge into `main`, rerun the command above and verify output is `0`.
