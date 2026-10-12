# Evidence: Issue #60 (Post-merge: CI red after #54)

## Summary
After PR #54 merged, the `start` job of `.github/workflows/ai-implementers.yml` (self-hosted Mac mini runner) failed on `main` at `f655e51caf115e0313fba01c452d5e158176f5b9` (run 37405560870, step "Implement with local Claude (fallback Codex)"):

```
error: cannot overwrite multiple values with a single value
##[error]Process completed with exit code 5.
```

## Root cause
The self-hosted runner reuses its checkout workspace, so `.git/config` kept several `credential.helper` values from earlier runs. The hub script `git_as_owner` (hub `bin/common.sh`, outside this repo) then set a single value on that multi-valued key, and `git config` exited with status 5. Nothing in FlowLine code, tests or the repository CI (`gate`, `docs`) was at fault: `Gate` passed on `f655e51` and on the current `main` (`bc59cab`).

## Resolution
- The cleanup lives in the hub (`AbdelrhmanAh7/nql-agents`), commit `41c658f` "git_as_owner: reset credential.helper idempotently": `git_as_owner` in `bin/common.sh` now runs `git config --local --unset-all` for `credential.helper` and `http.https://github.com/.extraheader` before re-adding them. **Author-reported, not verifiable from this repo** (the hub repo is outside this PR; no hub commit date or run timestamps were captured here, so ordering of the fix against the runs is not shown): later `start` runs on `main` reportedly passed (for example 37588370109, 37594935252, 37605265556, 37619221039).
- This PR does **not** change `.github/workflows/` (owner-only). An earlier revision added "Clean git credentials" steps there; they were reverted, together with the unit test that required them.
- `tests/unit/ci-workflows.test.ts` adds policy checks that match the workflow on `main`: the three crons (`0 */2 * * *` start, `30 */3 * * *` rescue, `15 * * * *` automerge), each cron's job routing, and the `[self-hosted, macmini]` runners with `ai-*` concurrency groups. They run on comment-stripped text with line-anchored patterns, so a commented-out line cannot satisfy them (a dedicated test covers that). The engine order is not tested here; `docs/GITHUB_WORKFLOW.md` points at the hub as its source.
- `docs/GITHUB_WORKFLOW.md` documents the AI implementers workflow and where the persistent-runner git cleanup lives. It makes no claim about whether the owner has the workflow enabled in GitHub's Actions settings (not verifiable from this repo).

## Still red, outside this repo
Recent scheduled `automerge` runs failed with `automerge.sh: line 103: syntax error near unexpected token 'done'` in the hub's `bin/automerge.sh`. That is a hub script bug, not a FlowLine one.

## Local verification
Each result names the exact tree it was recorded on. Results are never carried over to a later commit.

| Tested tree (full SHA) | Command | Result |
|---|---|---|
| `a4ddf610016cacfcb382c309e455f030a1030956` plus the one-test removal committed as `334948fd4758e97b89962d9b5943b8c999d3da36` | `vitest run --project unit tests/unit/ci-workflows.test.ts` | 27 passed (before the removal 1 failed: the reverted workflow has no "Clean git credentials" step) |
| same | `eslint tests/unit/ci-workflows.test.ts`, `tsc --noEmit` | clean |
| same | full unit project | 1244 passed, 4 skipped; `egress.test.ts` and `codex-poc-egress-redirect.test.ts` failed on `listen EPERM` at 127.0.0.1 (local sandbox blocks port binding; unrelated) |
| `686c38bf33941297ba08ae875123470b9807612a` (merge of `origin/main` `aee8385b07396871709052b6f2922ac8de7f1438` into this branch; clean tree) | `vitest run --project unit tests/unit/ci-workflows.test.ts` | 52 passed (main's gate-report, gate and docs checks plus this PR's `ai-implementers.yml` block) |
| same | `eslint tests/unit/ci-workflows.test.ts`, `tsc --noEmit` | clean |
| `66d739da5d565e48358ad36c1756414f758e2fdb` (HEAD before this note; clean tree) | `vitest run --project unit tests/unit/ci-workflows.test.ts` | 52 passed |
| `89da178ced4c5797b655e7d8bfe68c958e124be7` (clean tree) | `vitest run tests/unit/ci-workflows.test.ts` | 55 passed |
| same | `eslint tests/unit/ci-workflows.test.ts`, `tsc --noEmit` | clean |
| `25e60c010a812c63785e0d9facf5c0bc8823ed04` (merge of `origin/main` into this branch after `290eb2b`; clean tree) | `vitest run --project unit tests/unit/ci-workflows.test.ts` | 55 passed |
| same | `eslint tests/unit/ci-workflows.test.ts`, `pnpm typecheck` | clean |

Gate runs on a pull request execute on GitHub's synthetic merge commit of the PR head into `main` (for example the run that Actions showed as merge commit `1c28383`; GitHub recreates that synthetic commit on each push and its full SHA was not recorded, so it cannot be cited here), not on the PR head itself, so a green `gate` is evidence for that merge tree only. Final-candidate validation (a green `gate` and `docs` on the final PR head, plus the full tier dispatched once) is pending and is recorded on the PR, not here.

Commits after `686c38bf33941297ba08ae875123470b9807612a` change only this evidence file, the ci-workflows test block and `docs/GITHUB_WORKFLOW.md`, apart from merges of `origin/main`. The required CI `gate` and `docs` checks on the PR head remain the authoritative full run; the full suite was not run locally (repo rule).
