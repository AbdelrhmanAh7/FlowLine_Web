# DV2-02 primary proof passed; overall PARTIAL

Coordinator reports **APPROVE_SECRET_PROCESSING** preceded its successful execution of the reviewed verifier at HEAD `1431bfbb4916652a618408335e062d2ecf39e3ab`. This documentation worker read only the two sanitized proof artifacts below, never actual env contents, key material, DBs or raw transcripts. No code changed, tests rerun, rotations repeated or frozen records edited.

## Actual primary proof

[primary-persisted-proof.json](primary-persisted-proof.json) reports **PASS**:

- Executed verifier identity: `worktreeBaseSha=1431bfbb4916652a618408335e062d2ecf39e3ab`. Its `candidateSha=9fdcb7d4278d945cf6f40dd86c961b981f1f7f0d` identifies the pinned crypto-source context, not the verifier execution HEAD. Crypto source SHA256: `93fb068bedc5112fd9400da7d5a7d6258a79f1c3a5ce8afc791fbdceab061925`.
- All **2,070/2,070** selected old v1 connection ciphertexts were supported and rejected by replacement-key raw AES-GCM authentication and app `decryptLegacyV1`; zero unsupported formats/markers.
- Old DB `flowline_test` has no `legacy_crypto` column: all 2,070 rows report **inferred-old-schema-v1** provenance, with no fabricated persisted marker. New DB `flowline_test_beta20260930main` has the explicit boolean column.
- Selected old connection rows were unchanged under read-only old-DB access. Committed synthetic connection-schema persistence/readback and exact generated fixture cleanup passed.
- Replacement identity matches the archived rotation record; active old-key fallback is absent. No DB creation, migration, drop or key/config rotation was performed.

## Named-file audit

[named-config-audit.json](named-config-audit.json) reports **AUDIT_ONLY**, tied to the same execution/source identities. Exactly the seven approved named files were considered. The three present primary files (`FlowLine/.env`, `.env.test`, `.env.staging`) each report zero affected keys, zero invalid keys, and no old fallback. Both named ai-hub files and both named design files are absent; no unavailable contents were audited.

**Ai-hub proof remains BLOCKED:** its named protected test config is missing. Absence establishes neither retirement nor current replacement-key/persistence verification. Historical primary/ai-hub rotations are preserved and were not repeated. Staging containers and historical rotations are not freshly reverified by this file audit.

## Exact limits and remaining status

DV2-02 is **PARTIAL overall**, with the primary reverse-direction ciphertext rejection and current connection-schema persistence proof now completed. Old-key validity cannot be positively reauthenticated because the old key is never loaded; schema/format inference proves no persisted legacy marker or migration history. Preservation comparison covers selected old connection rows only. Other secret tables, HTTP/provider/browser flows, running staging containers and unavailable named configurations are outside this proof. This is no beta/provider/production/release certification or publication/merge approval.

The earlier 55/55 generated-key/SQL-double tests, full worktree typecheck and scoped lint remain recorded in [focused-results.json](focused-results.json); this documentation-only update requires no rerun. Historical `Targeted Chromium: 25/25.` and every non-DV2-02 BUGS line remain exactly equal to main baseline. Root owns final evidence/status review and any draft PR blockers.
