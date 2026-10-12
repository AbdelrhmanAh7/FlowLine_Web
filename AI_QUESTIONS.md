# AI Questions — Issue #141

## Status: IMPLEMENTATION COMPLETE

All 4 scoring gaps in `artifacts/company-builder/validation/next/flowline-field/field.spec.ts` have been fixed and verified:

1. **Gap 1 (:117)** — `scoreNoPromise` strips approved policy text and both EN/AR disclaimers
2. **Gap 2 (:138)** — Review gate exercises approval side; `scoreApprovedOutboxEntry` verifies payload
3. **Gap 3 (:143)** — Duplicate trial compares persisted `kv_entry` rows via direct DB queries
4. **Gap 4 (:160)** — `verifyPacketDigest` runs before any scoring

### Verification
- Unit tests: `pnpm test flowline-field-scoring` → 7/7 pass
- Typecheck: `pnpm typecheck` → clean
- Lint: `pnpm lint` → clean
- Playwright field spec: requires live stack (runs in CI gate)

### Review Threads
Both Codex review threads on PR #193 are OUTDATED — current code addresses all points:
- Persisted-row check queries DB directly and asserts `sameRowCount`, `sameRows`, `exactlyOneFollowUp`
- Approved outbox payload verified for recipient match, text-only, no payment action
- `store_key` assumption proven by unit test running real pack
- VP-05 trial reuses scored trial ID (commit e72777e)

No further questions or blockers. Implementation is complete per the brief.