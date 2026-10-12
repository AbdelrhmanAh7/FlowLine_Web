# Evidence: issue #67, `pnpm wt` docs and tests

Tested SHA: `8be4637` (branch `ai/67`, base `origin/main`). Scope per the issue: docs and tests only, plus the minimal `remove` alias and the dirty-removal refusal (exit 1). The earlier node_modules-link detection, link-restore and dirty-count changes were reverted as out of scope.

## Checks at the tested SHA

- `pnpm exec vitest run --project unit tests/unit/worktree-script.test.ts`: 42 passed (git stubbed; covers add, list, remove, dirty and unpushed refusal, existing branch, invalid name, argument parsing).
- `tests/integration/worktree-cli.test.ts`: 3 passed, run with a temporary vitest config without the DB `globalSetup` (the spec needs no database; real git in a temp dir with a local bare `origin`, no network).
- `pnpm typecheck` and `pnpm lint`: clean.
- `node scripts/ci/docs-check.mjs` on the PR file list: passes (3 code files, 1 docs file).
- `git diff --name-only origin/main..HEAD | grep '^.github/'`: no output.
- Diff vs `origin/main`: 5 files, +223/−162 — within the issue's ~300-line limit.

## Manual scratch clone (issue test plan)

`node scripts/worktree.mjs` (what `pnpm wt` runs) in a temp clone with a local bare `origin`: `add my-lane` printed the path, exit 0. `list` printed `…/my-lane | my-lane | dirty=1 | pushed=true` — a fresh lane counts as dirty because the helper's untracked `node_modules` symlink is not covered by the `node_modules/` ignore rule (long-standing upstream behaviour, kept). `remove my-lane` refused with `refusing to remove …: 1 uncommitted change(s); commit or discard them first`, exit 1, work kept. After dropping that link and adding `draft.txt`, `remove` still refused (exit 1) and `draft.txt` was preserved. After removing `draft.txt`, `remove` printed `removed …`, exit 0, and the `my-lane` branch was kept. `add feat/x` failed with `invalid lane name`, exit 1; `add taken` failed with git's `fatal: a branch named 'taken' already exists`, exit 1.

## Deviations from the issue's scope

- `remove` is an alias of `rm`; an explicit `rm`/`remove` of dirty or unpushed work now exits 1 with `refusing to remove …` (previously it printed `kept …` and exited 0). This is the behaviour the issue asks the docs and tests to pin. `prune` is unchanged.
- The real-git acceptance test lives in `tests/integration/` (temp dir, no network, no DB); unit tests keep git stubbed. No e2e-army test: internal repository helper with no user-facing flow.
- Windows path logic is stub-tested on macOS, not a native Windows run. Full suite and build deferred to CI per owner instruction.
