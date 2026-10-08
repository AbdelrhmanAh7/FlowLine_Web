# Dependency security and advisory tracking

## Overview

Flowline manages dependencies with `pnpm` and enforces lockfile integrity. Automated Dependabot pull requests are disabled on the repository to conserve CodeRabbit review budget; security advisories reported by GitHub Dependabot are tracked and resolved via manual pull requests.

## Dependency overrides

Transitive dependencies affected by security advisories are constrained using `overrides` in `pnpm-workspace.yaml`. When overriding a package:
1. Specify the minimum secure version in `pnpm-workspace.yaml` under `overrides:`.
2. Run `pnpm install` to update only the targeted package in `pnpm-lock.yaml`.
3. Add or update unit tests in `tests/unit/` (e.g. `tests/unit/dependency-advisories.test.ts`) asserting that the lockfile does not resolve vulnerable versions.

## Advisory log

### Dependabot alert #3: source-map-js (GHSA-68fv-2mgg-jv7q)
- **Severity**: High
- **Vulnerable version**: `< 1.2.2` (lockfile resolved `1.2.1`)
- **First patched version**: `1.2.2`
- **Resolution**: Added `"source-map-js": ">=1.2.2"` to `overrides` in `pnpm-workspace.yaml`, resolving `source-map-js` to `1.2.2` in `pnpm-lock.yaml`.
- **Verification**: Unit test `tests/unit/dependency-advisories.test.ts` (`@issue-62 AC1: lockfile resolves source-map-js >= 1.2.2`).
