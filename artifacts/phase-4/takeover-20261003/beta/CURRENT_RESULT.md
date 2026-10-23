# G4 current result — 2026-10-03

**Overall: PARTIAL.** This is a documentation update based on sanitized artifacts and the primary coordinator state. It does not certify deployment or beta readiness.

## Exact candidate and local evidence

- Tested final code: `7a315f7146784a4ac23b48e1ba06f46a762a21a7`.
- Source tree: `6418ad710a312ae45732a288b7efaebf1a4d07f8`.
- Root independently reviewed this exact candidate.
- `ARM64_BUILD_7A315F7.json` and `ARM64_APPROVED_IMAGE.json` record a successful local `linux/arm64` build labelled for the exact candidate. Local image ID: `sha256:f2e50c0236355765a35d95706d6d4b1d23cdb92ea325dba6aa3e442a3f9a7e9d`; platform manifest digest: `sha256:6d2406c1216cfd5d450a3755269bca36272115f3e4710460978f97b58fc2f834`. Registry push is `false`.
- `RECOVERY-1536fd4f52bb8b817a42ab4b475fa746.json` records `PASS_DB_ONLY`, 18 checks passed, and cleanup of two owned containers plus private proof files. It verifies encrypted restore, wrong-key refusal, container/database/destination guards, destination preservation, ciphertext/key-ID preservation, credential decryption with separate recovered keys, AAD/key refusal and source integrity.
- Recovery proof is DB-only. Build metadata and recovery proof do not certify app/worker runtime, migrations, off-device backup, Pi, providers or deployment.

## Publication state

- Main is `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; docs PR #8 is merged. PR #2's earlier merge at `9fdcb7d4278d945cf6f40dd86c961b981f1f7f0d` and CI run `37077650513` remain historical context; all six jobs were green.
- Draft PR #9 contains the G4 candidate and remains unmerged. Full CI run `37081791704` failed (WebKit 77 passed / 1 failed; other jobs passed).
- Latest CodeRabbit report has zero included reviews remaining in its latest report. A verified reset/no-cost review route is not established, so PR #9 remains blocked from review/merge progression pending verified no-cost availability. No review or merge is claimed.

## Owner boundaries and readiness

No owner login/MFA, domain/Pi inspection, DNS or tunnel creation/exposure, provider validation, deployment, payment action or invitations occurred. Existing approval steps in `OWNER_ACTIONS.md` remain required. Aggregate spend cap remains **$0**; no spending proposal is pending.

`BETA INFRA VERIFIED: NO` · `PRIVATE BETA READY: NO` · `PUBLIC PRODUCTION APPROVED: NO` · invitations not approved.

## Unresolved CI failure

Full-tier run 37081791704 failed in WebKit: 77 passed, 1 failed. The membership/promotion/removal scenario at e2e/phase3.spec.ts:88 received read ECONNRESET while GET-polling a run after approval. No root cause is established; a transient description is not a fix. No test retry, skip, assertion or baseline change was made. Raw CI reports contain disposable authentication cookies and remain temporary; committed evidence includes only this sanitized description and summary. This unresolved failure is an additional merge blocker even if a later documentation-head run passes.
