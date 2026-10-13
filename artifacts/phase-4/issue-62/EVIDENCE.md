# Evidence for #62: Dependabot alert #3, `source-map-js` ≥ 1.2.2

Not user-facing, so no e2e-army test: `source-map-js` is used only by CSS build and test tooling (`postcss` via `next` and
`vite`/`vitest`, `@tailwindcss/node`); no Flowline source imports it and no UI flow changes.

Tested code: `d9c9b1276f040f98014de9cb35fa80e355f832cd` on `ai/62`. It adds the guard test (the #62 entry in the Phase 4
ledger, `docs/implementation/PHASE4_BETA_REPORT.md`) and a Status line in `docs/security/DEPENDENCIES.md` on top of the
rebased main (`0b847de`). The lockfile and `pnpm-workspace.yaml` are the same as on `d9ea108`, which bounded the override to
the 1.x line (`>=1.2.2 <2`) after `1817362` switched the guard test's prerelease comparison to ASCII order. The merges of main
since then (`0b847de` enabling GitHub security features) change none of the #62 code files. Their only conflict, in the Phase 4
ledger, kept both main's section and the #62 one, and the new test now checks that. This commit fixes the unrelated #49 sentence in the ledger, restores the root `EVIDENCE.md` (issue #141), and words the DEPENDENCIES.md status as "fix in PR #77, pending merge". Local focused checks were re-run on `d9c9b12` on 2026-10-13 (UTC). Results from earlier heads name their head.
Run 2026-10-13 (UTC) on macOS, Node v26.10.0 (CI uses Node 24), pnpm 10.32.1, Vitest 5.0.2. Requirement IDs are those of the
hub PRD draft `3f227121-0472-8132-9cd1-d43bb8d7ba54`, carried over from the earlier version of this file.

| Requirement | Verified by | Result on the tested commit |
|---|---|---|
| REQ-FL-62-1 `pnpm-lock.yaml` resolves `source-map-js` ≥ 1.2.2 | `"source-map-js": ">=1.2.2 <2"` in `pnpm-workspace.yaml` `overrides` (bounded to the 1.x line PostCSS and Tailwind declare); lockfile rebuilt from main's with `pnpm install --lockfile-only` (not hand-edited); `pnpm why source-map-js` | Lockfile diff vs `origin/main` (unchanged by `pnpm install --lockfile-only --offline` on `2b1efd1`; no lockfile change since): the override line and `source-map-js` 1.2.1 → 1.2.2 (package, snapshot, three dependents); 0 references to 1.2.1. `pnpm why`: "Found 1 version of source-map-js", 1.2.2 (the npm `latest` tag) |
| REQ-FL-62-2 Tracked PR | PR #77 (`Closes #62`); `git diff origin/main --stat` | The lockfile and `pnpm-workspace.yaml`, the guard test, `docs/security/DEPENDENCIES.md`, `docs/DEVELOPER_GUIDE.md`, `docs/README.md`, `docs/implementation/PHASE4_BETA_REPORT.md`, `NEXT_ACTION.md` and this file (sizes are not copied here because every commit changes them; `git diff origin/main --stat` gives the current ones) |
| REQ-FL-62-3 Fast tier after the lockfile change | The CI `gate` run (`.github/workflows/gate.yml`, fast tier), not the local commands below | **Pending on `166ae0c`**: CI runs it when the branch is pushed. Last green run, on the previous head `01040ef4f9f1da11ef5d802a429ebd78e72792b7` (`2b1efd1` plus Markdown; [run 38320932868](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/38320932868), `pull_request`): `changes`, `checks` (static·unit·contract, integration 1/3, 2/3, 3/3), `chromium` (`@critical`/`@cross-browser`) and `gate` succeeded; `firefox`/`webkit` skipped, as the fast tier does by design. Earlier heads were also green (`3a1dbb8`: run 38212264276; `ac0d41b`: run 38210127375; `a923589`: run 38185082262). `166ae0c` changes only the guard test and Markdown, so the `gate` run on the pushed head is the one that counts. The local commands below are focused checks only and are not counted as the fast tier. The full tier (adds Firefox, WebKit, every Chromium spec) has not run: it is dispatched once on the final candidate before merge |
| REQ-FL-62-4 Alert #3 closed as fixed | Dependabot, after merge to main | **Pending (after merge)**: [NEXT_ACTION.md](../../../NEXT_ACTION.md) step 5 |
| REQ-FL-62-5 Open-alert query returns 0 or only alerts newer than #62 | `gh api 'repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts?state=open'` after merge | **Pending (after merge)**. Before merge (GraphQL `vulnerabilityAlerts(states: OPEN)`, 2026-10-11T21:38Z): 15 open, #3 plus #4–#17 (`next` 16.3.6, `shell-quote` 1.9.0, `sharp` 0.35.4), created 2026-10-08 12:17–12:18Z, after #62 (2026-10-07T15:00Z). Expected after merge: #3 fixed, #4–#17 left |
| REQ-FL-62-6 Lockfile guard test | `tests/unit/dependency-advisories.test.ts` | 7/7 passed on `166ae0c`: (1) semver order with prereleases, prerelease identifiers in ASCII order (`1.2.2-B` < `1.2.2-a`; failed with `localeCompare`: expected 1 to be -1); (2) fixtures, 1.2.10 and 1.2.2 accepted, 1.2.1 and 1.2.2-beta.1 flagged, read as whole versions with no substring check on `1.2.1`; (3) `@issue-62 AC1` on the real lockfile: no version below 1.2.2 or at 2.0.0-0 and above, and the bounded override in `pnpm-workspace.yaml` and the lockfile (failed with the unbounded `>=1.2.2`); the fixtures also flag 2.0.0-beta.1 and 2.0.0 as outside the 1.x line; (4) no `<placeholder>` in the shell commands of `docs/security/DEPENDENCIES.md` and this file (failed on the old wording); (5) every GitHub link and `repos/` path in those files names `AbdelrhmanAh7/FlowLine_Web` (failed on `e583f83`, which had the `AbdelrahmanAh7` run link); (6) the REQ-FL-62-3 row cites a CI `gate` run link and keeps the local commands out of the fast tier; (7) the Phase 4 ledger keeps its "## … (issue #62)" section with the override, the "Pending after PR #77 merges" status and links to this file and `NEXT_ACTION.md` that resolve, and `NEXT_ACTION.md` keeps the matching step (failed with main's ledger: "has a "## … (issue #62)" section: expected undefined to be defined") |

Commands on the tested commit:

- One Vitest file per run: `pnpm exec vitest run --project unit --maxWorkers=1 tests/unit/dependency-advisories.test.ts`,
  7/7 on `d9c9b12` (2026-10-13). With the ledger replaced by main's version, or with its evidence link pointing at
  `artifacts/issue-62/`, test (7) fails; the ledger was restored from git after both runs. Earlier, on `a923589`, the same command with `tests/unit/drizzle-tooling-prune.test.ts`,
  `tests/unit/docs-index.test.ts`, `tests/unit/docs-check-script.test.ts` and `tests/unit/changed-scope.test.ts` gave 2/2,
  4/4, 95/95 and 88/88. In the agent sandbox, runs of several files stalled at Vitest start-up before any test ran.
- Regression proof for the review finding at `dependency-advisories.test.ts:100`: with the old
  `not.toContain("source-map-js@1.2.1")` check re-added on the 1.2.10 fixture, the file fails with
  `AssertionError: expected 'packages:\n  source-map-js@1.2.10:\n …' not to contain 'source-map-js@1.2.1'`;
  with the fix (commit `4cd8221`), 3/3 pass.
- `pnpm typecheck` (`tsc --noEmit`) and eslint on the test file: exit 0, re-run on `d9c9b12`. `pnpm why source-map-js` on `d9c9b12`: "Found 1 version of source-map-js", 1.2.2. `pnpm lint` (`eslint .`): exit 0 on `d9c9b12`.
- `node scripts/check-evidence-secrets.mjs`: exit 0, 0 hits across 160 files, but no local env file was found, so it
  compared nothing (not a pass on real secrets; CI runs it).

Not run locally (CI runs them): the full unit, contract and integration suites, the build and the Chromium specs.

The earlier version of this file (repository root, `a30b4e7`) recorded the open-alert query as `1` at 2026-10-08T16:15Z;
GitHub dates alerts #4–#17 to 12:17Z that day, so that figure is superseded by the reading above.
