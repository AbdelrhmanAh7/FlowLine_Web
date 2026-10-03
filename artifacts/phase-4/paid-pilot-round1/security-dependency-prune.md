# L1 — remove unused Drizzle tooling dependency

Base/tested HEAD: `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; branch `codex/pilot-security-deps-round1`. All results tested an uncommitted dirty diff with its own isolated dependency installation, never the shared primary node_modules. Model/tool: Codex security worker, gpt-6.1-sol high. No commit or push by worker.

## Source and rationale

`drizzle-kit@0.31.11` remains the latest stable version returned by the public npm registry and still declares `@esbuild-kit/esm-loader`. Its seven published JS/CJS/ESM files have no loader/core-utils references, and its CLI already bundles tsx. This is locally inspected evidence, not an upstream maintainer endorsement. The [upstream issue](https://github.com/drizzle-team/drizzle-orm/issues/5481) tracks the deprecated chain.

Use PNPM's [documented version-scoped unused-dependency removal](https://pnpm.io/10.x/settings#overrides): `drizzle-kit@0.31.11>@esbuild-kit/esm-loader: '-'`. No transitive major replacement, advisory suppression, dependency version upgrade, auth API or repository migration change. Regenerated lockfile removes the loader/core-utils, esbuild 0.18.20 platform binaries and now-unreachable source-map helpers. Retained esbuild versions are 0.25.12 and 0.28.2.

The existing [GHSA-67mh-4wv8-2f99 advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) affects esbuild <=0.24.2 and was the sole production audit finding. Scoped removal actually eliminates that binary graph.

## Focused proof

- Offline lockfile generation succeeded. Own offline/frozen install: **531 reused, zero downloads**, ignore-scripts; primary modules unchanged.
- Unit files `drizzle-tooling-prune` and `zitadel-env-config`: **7 passed**, no skips. Regression requires the inspected Kit version, scans all shipped runtime files, checks removed modules cannot resolve from Kit and confirms no vulnerable graph remains in the lockfile.
- Fresh `pnpm audit --prod --registry=https://registry.npmjs.org --json`: **zero info/low/moderate/high/critical advisories**, **338 dependencies**, `muted: []`; before this candidate: one moderate / 368 dependencies. Audit is registry advisory evidence, not a complete native-binary/container vulnerability scan.
- `check-drizzle-prune.mjs`: generated SQL for the actual **73-table schema** into owned ignored scratch output and passed Drizzle's snapshot check. The CLI's automatic dotenv path is explicitly redirected to an owned empty ordinary `.txt` file; no environment files are read. Real repository migrations remain untouched. Compiled `worker/index.ts` and `src/lib/auth.ts` with retained esbuild 0.25.12 targeting Node 22.
- Validation helper initial run failed at Kit's Windows absolute-output-path check; corrected helper output to a relative owned scratch path. Next run exposed the helper's nonexistent `src/server/auth.ts` entry; corrected to the real `src/lib/auth.ts`. Final helper run passed; no assertions or product baselines weakened.
- Integration `p3-sso`, `sec-oauth`, `zitadel-platform-auth`: **31 passed / 3 files**, no skips, with the candidate's isolated node_modules and existing worker-owned `flowline_test_pilotsecauth`. Synthetic credentials existed only in child-process memory; real migration runner and platform seed executed. No real provider calls.
- Full `tsc --noEmit --incremental false` passed. Targeted test ESLint passed; artifact helper initially matched the repository's global ignore, then explicit `--no-ignore` ESLint passed. No local full gate or browser suite.

## Remaining validation

At the original dirty-candidate checkpoint, L1 was **PARTIAL**: the recorded production advisory graph was eliminated and focused toolkit/auth/migration/worker checks passed, but a full Next production build, Node 22 execution and combined final-candidate CI were unverified. Host was Node 25.6.1.

Subsequent evidence (2026-10-03): CI run `37093517476` at `f10278806a20a80b0bedd683ce446c46e7d0e416` built successfully and started all three test stacks on Node 22.23.3. Chromium/Firefox jobs succeeded, but WebKit had 77 passed / 1 failed and the final gate **failed**. Offline inspection at PR head `dd840db` found no causal loader import path; WebKit/test timing is suspected but not established. The CI Git object and action trace are absent locally, so exact tree equivalence and root cause remain unverified. See [WEBKIT_14_DIAGNOSIS.md](../../../docs/implementation/WEBKIT_14_DIAGNOSIS.md). L1 remains **PARTIAL**; do not claim a passing combined gate or pilot readiness.

On every Kit upgrade, remove/re-evaluate the exact-version pruning rule, inspect new shipped runtime imports and repeat frozen install, unsuppressed audit, schema generation/check, auth/worker compilation and final-candidate build/tests. Prefer an upstream fixed release when available.
