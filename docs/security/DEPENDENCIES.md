# Dependency security and advisory tracking

## Overview

Flowline manages dependencies with `pnpm`; CI (`.github/actions/setup-gate`) and the `Dockerfile` install with `--frozen-lockfile`, so `pnpm-lock.yaml` is what ships. Dependabot security-update pull requests are off on purpose (CodeRabbit review budget): each Dependabot alert is fixed in a normal tracked PR.

## Dependency overrides

Transitive dependencies affected by security advisories are constrained using `overrides` in `pnpm-workspace.yaml`. When overriding a package:
1. Specify the minimum secure version in `pnpm-workspace.yaml` under `overrides:`.
2. Run `pnpm install --lockfile-only` (never hand-edit `pnpm-lock.yaml`) and check that the lockfile diff touches only the targeted package and that `pnpm why <package>` lists only patched versions.
3. Add or update unit tests in `tests/unit/` (e.g. `tests/unit/dependency-advisories.test.ts`) asserting that the lockfile does not resolve vulnerable versions.

## Advisory log

### Dependabot alert #3: source-map-js (GHSA-68fv-2mgg-jv7q)
- **Severity**: High
- **Vulnerable version**: `< 1.2.2` (lockfile resolved `1.2.1`)
- **First patched version**: `1.2.2`
- **Used by**: `postcss` 8.5.23 (via `next`), `postcss` 8.5.28 (via `vite`/`vitest`) and `@tailwindcss/node` 4.3.3: CSS build (`postcss.config.mjs`) and test tooling; no Flowline source imports it.
- **Resolution**: Added `"source-map-js": ">=1.2.2"` to `overrides` in `pnpm-workspace.yaml`, resolving `source-map-js` to `1.2.2` in `pnpm-lock.yaml`.
- **Verification**: Unit test `tests/unit/dependency-advisories.test.ts` (`@issue-62 AC1: lockfile resolves source-map-js >= 1.2.2`).
