# Retained-file count circuit breakers — local candidate

- Base/source dependency: `360078e9d3357267711f006888b578f5a0c6c434` (reviewed M5 byte admission lane), atop unchanged main `9641ad1e684cad7b84bd2385751ea19b0a9d4060`.
- Branch: `codex/pilot-retained-count-round1`; worktree: `../FL-wt-pilot-security-count`.
- Tested state: uncommitted tracked source/test diff against that base on 2026-10-03, approximately 02:34–02:39 UTC. This evidence file was added after checks. Independent review and lead commit are required before publication; author made no commit/push.

The existing global transaction advisory lock now admits actual retained-row counts in the same post-lock aggregate query as actual `octet_length(data)` bytes. Defaults are 512 retained files per workspace and 4096 per installation, configured with `FLOWLINE_UPLOAD_WORKSPACE_MAX_FILES` and `FLOWLINE_UPLOAD_INSTALLATION_MAX_FILES`. Positive safe decimal integers are required; malformed/zero/negative/unsafe overrides fail closed with the existing 503 `UPLOAD_STORAGE_CONFIG` code. The original 100 MiB/512 MiB byte defaults and byte error priority remain unchanged. These are operational circuit breakers, not subscription or pricing promises.

File upload, knowledge-source ingestion and Company Builder fixture installation already use the shared insertion helper. Both new 413 codes (`UPLOAD_WORKSPACE_FILE_LIMIT`, `UPLOAD_INSTALLATION_FILE_LIMIT`) have matching Arabic/English translations and enter the existing file/knowledge error mapping plus Company Builder's explicit allowlist. Membership checks still precede admission.

## Focused verification

- Unit: `pnpm exec vitest run --project unit --fileParallelism=false tests/unit/retained-files.test.ts tests/unit/i18n.test.ts`: **36/36 passed**, 2 files; existing byte defaults/overrides and invalid byte limits, both count defaults/overrides, 12 invalid count configurations, translated errors and existing catalogue consistency.
- Integration: `pilot-upload-admission.test.ts` plus existing `p3-knowledge.test.ts`: **17/17 passed**, 2 files (13 admission, 4 knowledge), no skips. Actual concurrent empty multipart files reach the count cap with zero bytes retained; concurrent one-byte uploads across knowledge/file paths reach the workspace cap; different-workspace uploads reach the installation cap; legacy zero-byte rows count; deletion releases capacity; malformed count configuration refuses writes; Company Builder fixture admission reaches the same cap and rolls back its failed step. All existing byte quota/race/rollback/access tests and real JSON/CSV/PDF knowledge tests remain passing.
- Integration ran against worker-owned `flowline_test_pilotsecauth` on the existing local test Postgres, using an explicit minimal runtime environment and synthetic credentials/random keys. It did not inherit provider credentials or load `.env` files. Owned test workspaces were deleted by the suite. No container was created or removed by this slice.
- First integration launch failed in global setup before tests: the invocation used the wrong encryption variable names, so the platform seed correctly refused missing `FLOWLINE_PLATFORM_ENCRYPTION_KEY`. Corrected the invocation to the documented workspace/platform names; final run migrated/seeded the test DB and passed all 17 cases. No assertion was removed or weakened.
- Full `pnpm exec tsc --noEmit --incremental false`: exit 0.
- Targeted ESLint on the helper, error mapping, Company Builder session and both changed test files: exit 0.

## Limits

M5 remains PARTIAL overall. This bounds retained raw-file rows/bytes; dedicated lower-authority parser isolation, derived chunk budgets, queued-job limits and complete disk/backup policy need their own reviewed slices/evidence. Existing stored rows are counted even if metadata understates bytes. Deletion is not required to take the admission lock because it only reduces occupancy; concurrent deletion may conservatively refuse an insertion until the next request. No schema migration, live provider, browser/UI rendering, production build, CI gate, deployment or billing proof was performed here.
