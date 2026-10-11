# Evidence for #62: Dependabot alert #3, `source-map-js` ≥ 1.2.2

Not user-facing, so no e2e-army test: `source-map-js` is used only by CSS build and test tooling (`postcss` via `next` and
`vite`/`vitest`, `@tailwindcss/node`); no Flowline source imports it and no UI flow changes.

Tested code: `b4c41a3e8203413bb97b8f03a80cffdd92fb90fb` on `ai/62` (includes the merge of `origin/main` at `aee8385`) for
the lockfile and the first three tests; `20af1e0e126567260aa151caeff340067e67acc3` for the fourth test (pasteable commands
in the docs), re-run with 4/4 passing, `pnpm typecheck` exit 0 and eslint on the test file exit 0, on 2026-10-12 (UTC). The PR head is the commit that carries this
file: CI `gate` on that head is the authority for the final candidate. Run 2026-10-11 (UTC) on macOS, Node v26.10.0 (CI uses Node 24), pnpm
10.32.1, Vitest 5.0.2. Requirement IDs are those of the hub PRD draft `3f227121-0472-8132-9cd1-d43bb8d7ba54`, carried over
from the earlier version of this file.

| Requirement | Verified by | Result on the tested commit |
|---|---|---|
| REQ-FL-62-1 `pnpm-lock.yaml` resolves `source-map-js` ≥ 1.2.2 | `"source-map-js": ">=1.2.2"` in `pnpm-workspace.yaml` `overrides`; lockfile rebuilt from main's with `pnpm install --lockfile-only` (not hand-edited); `pnpm why source-map-js` | Lockfile diff vs `origin/main`: the override line and `source-map-js` 1.2.1 → 1.2.2 (package, snapshot, three dependents); 0 references to 1.2.1. `pnpm why`: "Found 1 version of source-map-js", 1.2.2 (the npm `latest` tag) |
| REQ-FL-62-2 Tracked PR | PR #77 (`Closes #62`); `git diff origin/main --stat` | 8 files: lockfile and workspace (14 lines), the test (133), docs (26) and this file |
| REQ-FL-62-3 Fast tier after the lockfile change | CI `gate` on the pushed head | **Pending**: the fast tier runs on GitHub Actions (owner rule 2026-10-08: no full suites locally). The local checks below are focused checks, not the fast tier (no integration shards, no Chromium). The fast tier passed on the previous head `a30b4e7` ([run 37807613926](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/37807613926)), before the merge with main |
| REQ-FL-62-4 Alert #3 closed as fixed | Dependabot, after merge to main | **Pending (after merge)**: [NEXT_ACTION.md](../../../NEXT_ACTION.md) step 5 |
| REQ-FL-62-5 Open-alert query returns 0 or only alerts newer than #62 | `gh api 'repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts?state=open'` after merge | **Pending (after merge)**. Before merge (GraphQL `vulnerabilityAlerts(states: OPEN)`, 2026-10-11T21:38Z): 15 open, #3 plus #4–#17 (`next` 16.3.6, `shell-quote` 1.9.0, `sharp` 0.35.4), created 2026-10-08 12:17–12:18Z, after #62 (2026-10-07T15:00Z). Expected after merge: #3 fixed, #4–#17 left |
| REQ-FL-62-6 Lockfile guard test | `tests/unit/dependency-advisories.test.ts` | 4 passed on `20af1e0`: semver order; fixtures (1.2.10 and 1.2.2 accepted, 1.2.1 and 1.2.2-beta.1 flagged); `@issue-62 AC1` on the real lockfile; no `<placeholder>` in the shell commands of `docs/security/DEPENDENCIES.md` and this file (fails on the old wording) |

Commands on the tested commit:

- One Vitest file per run, for example `pnpm exec vitest run --project unit --maxWorkers=1 tests/unit/dependency-advisories.test.ts`
  (the same command with `tests/unit/drizzle-tooling-prune.test.ts`, `tests/unit/docs-index.test.ts`,
  `tests/unit/docs-check-script.test.ts` and `tests/unit/changed-scope.test.ts`): `dependency-advisories`
  3/3, `drizzle-tooling-prune` 2/2, `docs-index` 4/4, `docs-check-script` 95/95, `changed-scope` 88/88. In the agent
  sandbox, runs of several files (and the first attempt of `changed-scope`) stalled at Vitest start-up before any test ran.
- Regression proof for the review finding at `dependency-advisories.test.ts:100`: with the old
  `not.toContain("source-map-js@1.2.1")` check re-added on the 1.2.10 fixture, the file fails with
  `AssertionError: expected 'packages:\n  source-map-js@1.2.10:\n …' not to contain 'source-map-js@1.2.1'`;
  with the fix (commit `4cd8221`), 3/3 pass.
- `pnpm typecheck` (`tsc --noEmit`): exit 0. `pnpm lint` (`eslint .`): exit 0.
- `node scripts/check-evidence-secrets.mjs`: exit 0, 0 hits across 154 files, but no local env file was found, so it
  compared nothing (not a pass on real secrets; CI runs it).

Not run locally (CI runs them): the full unit, contract and integration suites, the build and the Chromium specs.

The earlier version of this file (repository root, `a30b4e7`) recorded the open-alert query as `1` at 2026-10-08T16:15Z;
GitHub dates alerts #4–#17 to 12:17Z that day, so that figure is superseded by the reading above.
