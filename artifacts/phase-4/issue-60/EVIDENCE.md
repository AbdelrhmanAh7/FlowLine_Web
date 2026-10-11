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
- The cleanup lives in the hub (`AbdelrhmanAh7/nql-agents`), commit `41c658f` "git_as_owner: reset credential.helper idempotently": `git_as_owner` in `bin/common.sh` now runs `git config --local --unset-all` for `credential.helper` and `http.https://github.com/.extraheader` before re-adding them. Later `start` runs on `main` passed (for example 37588370109, 37594935252, 37605265556, 37619221039).
- This PR does **not** change `.github/workflows/` (owner-only). An earlier revision added "Clean git credentials" steps there; they were reverted, together with the unit test that required them.
- `tests/unit/ci-workflows.test.ts` adds policy checks that match the workflow on `main`: the 24/7 `0 */2 * * *` start schedule and the `[self-hosted, macmini]` runners with `ai-*` concurrency groups.
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

Commits after `686c38bf33941297ba08ae875123470b9807612a` change only this evidence file. The required CI `gate` and `docs` checks on the PR head remain the authoritative full run; the full suite was not run locally (repo rule).
