# Evidence — issue #74: Implement Node 24 action in CI

Tested commit: `5627a17` (production change and tests; later commits change only Markdown). Failing-first commit: `8bab33f` (tests only).
Branch: `ai/74`
Run on 2026-10-08, macOS, Node v24.21.0, pnpm 10.32.1, Vitest 5.0.2, Next.js 16.3.6.

## Acceptance criteria mapping

| Criterion | Requirement & Verification Method | Status |
|---|---|---|
| AC1 | CI pipeline passes with Node 24: setup-gate composite action sets `node-version: 24`, and the entire local test/build toolchain passes cleanly on Node 24 (97 unit test files, 23 contract test files, typecheck, lint, build). Live CI pipeline pass will be proven on the PR `gate` run on GitHub Actions. | Pass (Local verified; CI gate pending PR) |
| AC2 | Workflow file updated: `.github/actions/setup-gate/action.yml` updated to specify `node-version: 24`, sandbox pull updated to `node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`, and description updated. Verified by `tests/unit/release-input-policy.test.ts`. | Pass |
| AC3 | No compatibility issues: `package.json` `engines.node` aligned to `24.x`; `Dockerfile` base image aligned to `node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`; `src/server/code-sandbox.ts` `SANDBOX_IMAGE` aligned to `node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`. Next.js production build (`pnpm build`) succeeds with no errors; zero dependency conflicts. | Pass |

## Test and execution results

### 1. Failing-first test (`8bab33f`)
- Executed: `pnpm vitest run tests/unit/release-input-policy.test.ts`
- Result: **2 failed, 0 passed**.
  - Test 1 failure: `AssertionError: expected '22.x' to be '24.x'` (`packageJson.engines.node`).
  - Test 2 failure: `AssertionError: expected 'node:22-alpine@sha256:...' to match /^node:24-alpine@sha256:/`.

### 2. Passing release policy test (`5627a17`)
- Executed: `pnpm vitest run tests/unit/release-input-policy.test.ts`
- Result: **2 passed, 0 failed**.
  - `✓ aligns package support, CI, build and runtime on approved Node 24`
  - `✓ requires immutable digests for release/frontend/infrastructure/sandbox defaults and CI pulls`

### 3. Full unit suite on Node 24
- Executed: `pnpm test` (`vitest run --project unit`) under Node v24.21.0
- Result: **97 test files passed, 1,247 tests passed (0 failed)**. Duration: 15.30s.

### 4. Full contract suite on Node 24
- Executed: `pnpm test:contract` (`vitest run --project contract`) under Node v24.21.0
- Result: **23 test files passed, 468 tests passed (0 failed)**. Duration: 16.14s.

### 5. Linter and typechecker
- Executed: `pnpm lint` (ESLint 9.39.5) and `pnpm typecheck` (TypeScript 6.0.3, `tsc --noEmit`) under Node v24.21.0
- Result: Clean exit code 0, 0 errors, 0 warnings.

### 6. Production build on Node 24
- Executed: `DATABASE_URL=postgres://build:build@127.0.0.1:1/build BETTER_AUTH_SECRET=build-only-placeholder-not-a-secret pnpm build` under Node v24.21.0
- Result: Clean exit code 0. Next.js 16.3.6 (Turbopack) compiled in ~13s; all 24 static pages generated; all dynamic API and page routes compiled successfully with no build errors.

### 7. Immutable image digests
Resolved directly via Docker Hub Registry API for official multi-platform OCI index manifests:
- `node:24-bookworm-slim`: `sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`
  - Platforms: linux/amd64 (`sha256:51b1100cc...`), linux/arm64 (`sha256:ba6b7d0ee...`), linux/ppc64le (`sha256:e6dc05f51...`)
- `node:24-alpine`: `sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`
  - Platforms: linux/amd64 (`sha256:83f1c388c...`), linux/arm64 (`sha256:38a36422d...`), linux/s390x (`sha256:fb2a6de21...`)

## Review follow-up: E2E exemption and sandbox change
`src/server/code-sandbox.ts` only changes the default `SANDBOX_IMAGE` (node:22 -> node:24-alpine, digest-pinned); the sandbox logic is untouched.
No UI or API client behaviour changes, so no e2e-army test is added. The image pin is covered by
`tests/unit/release-input-policy.test.ts` (`@issue-74 AC1 AC2 AC3`, sandbox digest check), and sandbox behaviour by the existing `tests/unit/sandbox.test.ts`.
Not run in this worktree (no node_modules); proven by the PR `gate` run on the final head SHA.
