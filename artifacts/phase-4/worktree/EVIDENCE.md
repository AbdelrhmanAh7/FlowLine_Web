# Evidence: issue #67, `pnpm wt` docs and tests

Scope per the issue: docs and tests for the wt helper, plus the minimal script changes the acceptance criteria need (`remove` alias, dirty-removal refusal with exit 1, and not counting the helper's own `node_modules` link as a change). The commit SHA these results belong to is the head of the `ai/67` PR; each command below was run on that head.

## Checks

- `pnpm exec vitest run --project unit tests/unit/worktree-script.test.ts`: 76 passed (git and fs stubbed). `origin/main`'s existing tests are kept unchanged except the two that pinned the old "kept, exit 0" behaviour for an explicit `rm` of dirty or unpushed work; they now assert the refusal. New tests cover `remove`, dirty and unpushed refusal for `rm`/`remove`, prune keeping such lanes, list dirty/pushed output, an existing branch, and the own-link rules.
- `pnpm exec vitest run --project unit tests/unit/worktree-cli.test.ts`: 5 passed, real git in a temp dir with a local bare `origin` (no network, no database). The spec lives in the `unit` project, so it runs under the repo's real vitest config with no temporary config.
- `pnpm typecheck` and `pnpm exec eslint` on the changed files: clean.
- `git diff --name-only origin/main..HEAD | grep '^.github/'`: no output.

## Root cause of the "fresh lane is dirty" finding

`add` links `node_modules` as a symlink; the repo's `node_modules/` ignore rule matches directories only, so git reports `?? node_modules` and `state()` counted it. A fresh lane therefore showed `dirty=1` and `rm`/`remove`/`prune` could never remove it (the unlink sat after the dirty check). Fix: `scripts/worktree.mjs` `isOwnModulesLink`/`state` ignore only a symlink that points to the main checkout's `node_modules`; a link elsewhere or a real directory still counts as work and is never unlinked. Tests: `tests/unit/worktree-script.test.ts` ("a fresh lane is clean…", "…points elsewhere…", "a real node_modules directory…") and `tests/unit/worktree-cli.test.ts` AC1 (real git: add, list `dirty=0`, remove, branch kept). The documented `add my-lane` then `remove my-lane` sequence works as written.

## Limits

- Windows path logic is stub-tested on macOS, not a native Windows run.
- Full suite and build are left to CI per owner instruction.
- The earlier review thread about `AGENTS.md`, `PHASE4_BETA_REPORT.md` and the evidence size refers to a stale base: against `origin/main` this branch changes only `scripts/worktree.mjs`, the two test files, `docs/DEVELOPER_GUIDE.md` and this file.
