# Evidence: Issue #60 (Post-merge: CI red after #54)

## Summary
After PR #54 merged, the `start` job of `.github/workflows/ai-implementers.yml` (self-hosted Mac mini runner) failed on `main` at `f655e51` (run 37405560870, step "Implement with local Claude (fallback Codex)"):

```
error: cannot overwrite multiple values with a single value
##[error]Process completed with exit code 5.
```

## Root cause
The self-hosted runner reuses its checkout workspace, so `.git/config` kept several `credential.helper` values from earlier runs. The hub script `git_as_owner` (hub `bin/common.sh`, outside this repo) then set a single value on that multi-valued key, and `git config` exited with status 5. Nothing in FlowLine code, tests or the repository CI (`gate`, `docs`) was at fault: `Gate` passed on `f655e51` and on the current `main` (`bc59cab`).

## Resolution
- The cleanup lives in the hub: `git_as_owner` now runs `git config --local --unset-all` for `credential.helper` and `http.https://github.com/.extraheader` before re-adding them. Later `start` runs on `main` passed (for example 37588370109, 37594935252, 37605265556, 37619221039).
- This PR does **not** change `.github/workflows/` (owner-only). An earlier revision added "Clean git credentials" steps there; they were reverted, together with the unit test that required them.
- `tests/unit/ci-workflows.test.ts` adds policy checks that match the workflow on `main`: the 24/7 `0 */2 * * *` start schedule and the `[self-hosted, macmini]` runners with `ai-*` concurrency groups.
- `docs/GITHUB_WORKFLOW.md` documents the AI implementers workflow and where the persistent-runner git cleanup lives.

## Still red, outside this repo
Recent scheduled `automerge` runs fail with `automerge.sh: line 103: syntax error near unexpected token 'done'` in the hub's `bin/automerge.sh`. That is a hub script bug. The AI implementers workflow is now disabled on GitHub and runs locally.

## Local verification
Tested tree: branch `ai/60` at `334948f` (its only code change since `main` is the removal of the orphaned "Clean git credentials" test in `tests/unit/ci-workflows.test.ts`). The results below were recorded locally on `a4ddf61` plus that one test removal, which is exactly the content committed as `334948f`; the implementer worktree has no `node_modules`, so they were not re-run for this revision. CI `gate` on the PR is the authoritative run for `334948f`.
- `vitest run --project unit tests/unit/ci-workflows.test.ts`: 27 passed. Before the removal, 1 failed because the reverted workflow has no "Clean git credentials" step.
- `eslint tests/unit/ci-workflows.test.ts` and `tsc --noEmit`: clean.
- Full unit project: 1244 passed, 4 skipped. The only failures were `egress.test.ts` and `codex-poc-egress-redirect.test.ts`, which hit `listen EPERM` on 127.0.0.1 because the local sandbox blocks port binding. That is unrelated to this change.
