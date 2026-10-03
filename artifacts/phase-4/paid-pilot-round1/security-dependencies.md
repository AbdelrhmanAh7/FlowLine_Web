# Fresh production dependency advisory check

Date: 2026-10-03. Base `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; lockfile blob `896d82a11f49c15c9333be7432c84603e132a798` unchanged in the runtime candidate.

`pnpm audit --prod --registry=https://registry.npmjs.org --json` returned exit **1**, with **1 Moderate, 0 High, 0 Critical advisories** over 368 production dependencies. This is a failing advisory check, not a passing security gate.

L1 is still present: esbuild `0.18.20`, [GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99), CVSS 5.3, patched in esbuild 0.25.0+. Production path: `better-auth > drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils > esbuild`. `pnpm why esbuild --prod` confirms Drizzle Kit 0.31.11 still includes that older loader even alongside newer esbuild versions. No reachable esbuild development server was established.

No dependency version/lockfile override was made. A compatible upgrade or removal/pruning of unused runtime tooling needs meaningful auth initialization, worker, migration and build verification; the review explicitly prohibits overriding a transitive major merely to silence the audit. The release image currently copies its entire installed dependency tree, so accepting this advisory based only on absence of an application dev-server call would leave the shipped graph unchanged.

No environment files, provider accounts, server calls beyond the public npm advisory service, containers or deployments were used. The registry was explicitly the public npm registry. This is retained bounded evidence for the next dependency remediation lane.
