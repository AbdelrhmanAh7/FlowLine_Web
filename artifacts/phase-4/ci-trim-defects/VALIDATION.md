# CI/worktree defect validation — 2026-10-03

Branch: `claude/ci-trim-20261003`. Base HEAD: `dc2461a43722c1c200f80747fc67ec063641344a`; validation applies to the uncommitted source fingerprints below, not to the base commit alone.

- `pnpm.cmd exec vitest run --project unit --configLoader runner tests/unit/worktree-script.test.ts tests/unit/docs-check-script.test.ts`: PASS, 2 files / 60 tests.
- `pnpm.cmd exec eslint --no-cache scripts/worktree.mjs scripts/ci/docs-check.mjs tests/unit/worktree-script.test.ts tests/unit/docs-check-script.test.ts`: PASS, exit 0, no diagnostics. Direct ESLint limits the check to touched files; the package's `lint` command includes `.`.
- Python `yaml.safe_load` on `.github/workflows/docs.yml`: PASS; assertions also verify `edited` and `PR_BODY` environment wiring without body interpolation in the shell.
- `git diff --check`: PASS.

PowerShell initially blocked `pnpm.ps1` before either check ran; the installed `pnpm.cmd` launcher succeeded without changing execution policy.

Coverage includes colliding registered external/managed names, absent managed lanes, explicit external paths, mixed-case Windows matching and main protection, list/prune main skips, non-Windows case sensitivity, docs/waiver fixtures, root config families (including `vitest.config.mts`), paginated JSON, filenames with spaces, and inert PR-body text. Worktree operations are mocked; docs fixtures execute the Node CLI.

Unverified: live GitHub Actions/API integration and actual worktree removal. No commit/push, Docker, browser, gate, build or install was performed. No beta/release readiness claim.

## Tested source SHA-256

Hashes normalize CRLF to LF.

- `scripts/worktree.mjs`: `9af966a988fca187d5b5ed68948bcf26b1c81a5ae6763867b4bcb8fb1f8a5905`
- `scripts/ci/docs-check.mjs`: `13963654509cc974969fa142f4c7ed04ff716e3f73f5b35e5b5caf847ec54911`
- `tests/unit/worktree-script.test.ts`: `3080077c6665d439be2280dc261096d48849c0a3d520041b86252d08bc2bd977`
- `tests/unit/docs-check-script.test.ts`: `6de8de424261f2c739edc37706013ad3fa9716b46fed08bd2947b5b96296a2cd`
- `.github/workflows/docs.yml`: `d57827d74f69cd1e4712e066a06d92dec3cb8e3d078bec565ec3a06a0a262767`
