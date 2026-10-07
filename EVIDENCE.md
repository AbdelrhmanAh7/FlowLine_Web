# Evidence: issue #67, `pnpm wt` tests and docs

Tested SHA: `33107394917758c8f8cf30e450f619502e97693a` (branch `ai/67`, base `bc59cab`), node v26.10.0, git 2.56.0, macOS. REQ ids come from the PRD draft (Notion, Approval = Draft).

| REQ | Verified by |
|---|---|
| REQ-FL-67-1 parsing for create/list/remove | `tests/unit/worktree-script.test.ts`: add with `--base`/`--branch`, `rm`/`remove` alias, usage on unknown command or missing name (git stubbed) |
| REQ-FL-67-2 path/branch derivation | unit: `accepts the bare name %s and branches from it`, `keeps slashed branch names available through --branch` |
| REQ-FL-67-3 create | unit (stubbed `git worktree add -b <branch> <path> <base>`); `tests/integration/worktree-cli.test.ts` AC1 create |
| REQ-FL-67-4 list | unit `list command output format`; acceptance AC1 list (`dirty=0 \| pushed=true`) |
| REQ-FL-67-5 remove (clean) | unit `checks clean and pushed before unlinking, then removes without force`; acceptance AC1 remove |
| REQ-FL-67-6 dirty remove refused, non-zero | unit `%s refuses %s work with a clear message…`; acceptance AC2 for `remove` and `rm`: exit 1, `refusing to remove <path>: 1 uncommitted change(s); commit or discard them first`, file kept |
| REQ-FL-67-7 existing branch | unit `propagates git error when branch already exists`; acceptance AC1: exit 1, `fatal: a branch named 'taken' already exists`, no lane |
| REQ-FL-67-8 invalid names before git | unit: add and `rm`/`remove` reject before any git call; acceptance: `add feat/x`, `remove .hidden` exit 1 |
| REQ-FL-67-9 docs | `docs/DEVELOPER_GUIDE.md#worktrees`; acceptance AC3 checks the examples and message |
| REQ-FL-67-10 no workflow changes | `git diff --name-only bc59cab..HEAD \| grep -c '^.github/'` → `0` |

## Commands and results at the tested SHA

- `vitest run --project unit tests/unit/worktree-script.test.ts`: 84 passed.
- `tests/integration/worktree-cli.test.ts`: 9 passed. Run locally with a config that omits the integration `globalSetup` (no Postgres here; the test uses no database). CI runs it in the integration project.
- `eslint` on the three changed code files: clean. `tsc --noEmit`: clean.
- Full unit project: 1258 passed, 4 skipped, 1 failed (2 files). `egress.test.ts` and `codex-poc-egress-redirect.test.ts` time out in `listen()` because the sandbox forbids local port binding. Neither file is touched here.
- Diff vs `bc59cab` before this file: 6 files, +295/−20.

## Manual scratch clone (issue test plan)

Done by hand with `node scripts/worktree.mjs` (what `pnpm wt` runs) in a temp clone with a local bare `origin`: `add my-lane` printed the path, exit 0. `list` printed `… | my-lane | dirty=0 | pushed=true`. `remove my-lane` printed `removed …`, exit 0. For a lane holding `draft.txt`, `remove` printed `refusing to remove …: 1 uncommitted change(s); commit or discard them first`, exit 1. `add feat/x` and `remove .hidden` failed with `invalid lane name`, exit 1. `add taken` failed with git's `fatal: a branch named 'taken' already exists`, exit 1. This matches the guide.

## Deviations from the PRD draft

- **Behaviour changes.** `remove` is now an alias of `rm`. An explicit `rm` of dirty or unpushed work now exits 1 with `refusing to remove …`; before, it printed `kept …` and exited 0. REQ-FL-67-6 and the issue's `pnpm wt remove` criterion require both. `prune` is unchanged.
- **Two bugs fixed.** The scratch clone exposed them. First, every fresh lane counted as dirty: git lists the `node_modules` symlink as `?? node_modules`, because `node_modules/` ignores only directories. Second, a dangling link was never unlinked, because `existsSync` follows links.
- **Real-git acceptance test.** The PRD lists "integration tests that run real git" as out of scope. The E2E-first rule and QA round 1 require an acceptance test, so `worktree-cli.test.ts` runs real git, but only in a temp dir with no network. The unit tests stay fully stubbed.
