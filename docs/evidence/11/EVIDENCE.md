# Verification Report — PR #11: Persisted-Ciphertext Key Rejection & Verifier Hardening

**PR**: #11 (`codex/takeover-security-20261003`)<br>
**Base**: `main` (`39364b5de989dd92f5c552833b89e57326ee638c` merged via `0b727440ed4382ec40aa60f452f6271b291876c1`)<br>
**Scope**: DV2-02 persisted-ciphertext verification hardening, raw artifact cleanup, and verifier portability<br>
**E2E**: `E2E: not needed — backend-only security verifier script and isolated unit test suite with SQL doubles; no user-facing UI or customer flow changed`

---

## Acceptance Criteria

- **AC1: Raw Evidence Cleanup**: All raw evidence artifacts (`.json`, `.stderr.txt`) under `artifacts/` are removed from git tracking per `AGENTS.md` and `.gitignore`. Only Markdown documents remain under `artifacts/`. Key proof figures and implementation hashes are inlined into Markdown status docs.
- **AC2: Verifier Parameterization**: `scripts/security/dv2-02-verifier.ts` eliminates hard-coded paths and unconfigurable commit pins. It exposes explicit configuration via environment variables:
  - `DV2_02_PARENT`: Directory containing sibling checkouts (default: parent of worktree).
  - `DV2_02_PRIMARY_ROOT`: Primary checkout path (default: `<PARENT>/FlowLine`).
  - `DV2_02_CANDIDATE_SHA`: Git commit SHA for crypto source verification; when unset or `'skip'`/`'none'`, source comparison is skipped cleanly.
  - `DV2_02_ROTATION_RECORD`: Path to the key rotation JSON record (default: `<PRIMARY>/artifacts/...`).
- **AC3: One-Shot Tool Documentation**: `docs/security/dv2-02-verifier.md` documents `dv2-02-verifier.ts` as a one-shot local verification tool kept outside the normal CI test path, describing prerequisites, environment variables, invocation patterns, and CI-safe unit test execution.
- **AC4: Security Unit Test Execution**: All 55 focused security unit tests in `tests/unit/dv2-02-verifier.test.ts` pass with 0 failures and 0 skipped tests using in-memory SQL doubles (no database connections, no env files, no network).
- **AC5: Scoped Typecheck and Linter Green**: Scoped TypeScript compilation (`scripts/security/tsconfig.security.json`) and ESLint over all modified scripts and tests exit with code 0 and no errors or warnings.
- **AC6: Documentation Compliance**: A Markdown doc outside `artifacts/` (`docs/security/dv2-02-verifier.md` and `docs/evidence/11/EVIDENCE.md`) is modified/committed, satisfying `.github/workflows/docs.yml` and `scripts/ci/docs-check.mjs`.

---

## Verification Mapping

| AC | Verification Command / Evidence | Exit Code | Result |
|---|---|---|---|
| **AC1** | `git ls-files artifacts/phase-4/takeover-20261003/security/` | `0` | Only `.md` files tracked (`DV2-02-STATUS.md`, `SECURITY_HANDOFF.md`). Raw JSON/text removed. |
| **AC2** | `grep -E "DV2_02_" scripts/security/dv2-02-verifier.ts` | `0` | All four path/SHA variables configurable via `process.env`. |
| **AC3** | `cat docs/security/dv2-02-verifier.md` | `0` | Comprehensive tool documentation present outside `artifacts/`. |
| **AC4** | `nice -n 10 pnpm exec vitest run --config scripts/security/vitest.security.config.mts --maxWorkers=2` | `0` | 1 test file passed, 55 tests passed, 0 failed, 0 skipped (183ms). |
| **AC5** | `pnpm exec tsc -p scripts/security/tsconfig.security.json && pnpm exec eslint scripts/security/dv2-02-verifier.ts scripts/security/vitest.security.config.mts tests/unit/dv2-02-verifier.test.ts` | `0` | Zero TypeScript errors, zero ESLint warnings/errors. |
| **AC6** | `node -e 'const { checkDocs } = await import("./scripts/ci/docs-check.mjs"); console.log(checkDocs(["scripts/security/dv2-02-verifier.ts", "docs/evidence/11/EVIDENCE.md"]).passed)'` | `0` | Output: `true` (non-artifacts `.md` present). |

---

## Changed Covering Tests

- `tests/unit/dv2-02-verifier.test.ts` (55 tests):
  - **Bounded input guards** (4 tests): suffix acceptance, test mode enforcement, canonical replacement key, URL sanitization, replacement key pinning.
  - **Generated-key rejection** (8 tests): v1 positive control, envelope control, waveA control, old key failure, active ring retention check, malformed envelope failure, crypto vs app format rejection distinction.
  - **SQL-double orchestration** (9 tests): real-schema synthetic row commit/readback/clean, read-only old transactions, key/environment mismatch guards, database identity mismatch guards, snapshot immutability verification, insert rollback, readback failure cleanup, COMMIT acknowledgement handling.
  - **Pure audit processor** (4 tests): exposed identity detection without leak, 7 named files audit, UTF-8/UTF-16LE/BOM parsing, bounded count returns.
  - **Strict dotenv prevalidation** (21 tests): positive quoted/unquoted/comment/empty cases, malformed synthetic cases 0–16 rejection without DB client construction, unfinished fallback detection, CRLF and truncated UTF-16LE detection.
  - **Schema metadata regressions** (9 tests): missing old marker inference, existing column non-inference, raw AES-GCM decryption guard, non-v1 inference refusal, unmigrated new DB refusal, schema alteration detection, invalid metadata rejection.

---

## UI / Arabic / Accessibility

N/A — This change contains backend-only security verification scripts, unit test doubles, and documentation. No UI screens, user-facing routes, CSS tokens, or translation dictionaries are touched.

---

## Regression & Sentry Mapping

- **Review finding**: `scripts/security/dv2-02-verifier.ts:23` (hard-coded local paths, out-of-repo rotation record, pinned `CANDIDATE_SHA`).
  - *Fix*: Environment variables `DV2_02_PARENT`, `DV2_02_PRIMARY_ROOT`, `DV2_02_CANDIDATE_SHA`, and `DV2_02_ROTATION_RECORD` allow execution across environments; source-matching check can be skipped by setting `DV2_02_CANDIDATE_SHA=skip` or left unset for local variants.
- **Review finding**: `artifacts/phase-4/takeover-20261003/security/*.json` and `*.stderr.txt` (raw UTF-16LE evidence committed in violation of `AGENTS.md` and `.gitignore`).
  - *Fix*: Removed `named-config-audit.json`, `named-config-audit.stderr.txt`, `primary-persisted-proof.json`, `primary-persisted-proof.stderr.txt`, and `focused-results.json` from git tracking. Inlined key figures and implementation file hashes into `DV2-02-STATUS.md` and `SECURITY_HANDOFF.md`.
- **CI failure**: `docs` check failed due to code change without a Markdown document outside `artifacts/`.
  - *Fix*: Created `docs/security/dv2-02-verifier.md` and `docs/evidence/11/EVIDENCE.md`.
