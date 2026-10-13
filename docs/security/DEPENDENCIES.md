# Dependency security and advisory tracking

## Overview

Flowline manages dependencies with `pnpm`; CI (`.github/actions/setup-gate`) and the `Dockerfile` install with `--frozen-lockfile`, so `pnpm-lock.yaml` is what ships. Dependabot security-update pull requests are off on purpose (CodeRabbit review budget): each Dependabot alert is fixed in a normal tracked PR.

## Dependency overrides

Transitive dependencies affected by security advisories are constrained using `overrides` in `pnpm-workspace.yaml`. When overriding a package:

1. Specify the minimum secure version in `pnpm-workspace.yaml` under `overrides:`, bounded below the next major (for example `>=1.2.2 <2`) so a later major is never forced on dependents that declare the current one.
2. Run `pnpm install --lockfile-only` (never hand-edit `pnpm-lock.yaml`) and check that the lockfile diff touches only the targeted package and that `pnpm why` lists only patched versions (for alert #3: `pnpm why source-map-js`). Commands in these docs are written to be pasted as they are, without `<...>` placeholders, which POSIX shells read as redirection; `tests/unit/dependency-advisories.test.ts` checks this.
3. Add or update unit tests in `tests/unit/` (e.g. `tests/unit/dependency-advisories.test.ts`) asserting that the lockfile does not resolve vulnerable versions.

## Advisory log

### Dependabot alert #3: source-map-js (GHSA-68fv-2mgg-jv7q)

- **Severity**: High
- **Vulnerable version**: `< 1.2.2` (lockfile resolved `1.2.1`)
- **First patched version**: `1.2.2`
- **Used by**: `postcss` 8.5.23 (via `next`), `postcss` 8.5.28 (via `vite`/`vitest`) and `@tailwindcss/node` 4.3.3: CSS build (`postcss.config.mjs`) and test tooling; no Flowline source imports it.
- **Resolution**: Added `"source-map-js": ">=1.2.2 <2"` (the 1.x line that PostCSS and Tailwind declare) to `overrides` in `pnpm-workspace.yaml`, resolving `source-map-js` to `1.2.2` in `pnpm-lock.yaml`.
- **Verification**: Unit test `tests/unit/dependency-advisories.test.ts` (`@issue-62 AC1: lockfile resolves source-map-js >= 1.2.2 and < 2`), which also checks the override text and that the Phase 4 ledger keeps this entry.
- **Status**: fix in PR #77, pending merge; recorded in the Phase 4 ledger ([PHASE4_BETA_REPORT.md](../implementation/PHASE4_BETA_REPORT.md), section "issue #62") with its [evidence](../../artifacts/phase-4/issue-62/EVIDENCE.md). Pending after merge: alert #3 closed as `fixed` and the open-alert query checked ([NEXT_ACTION.md](../../NEXT_ACTION.md) step 5).
