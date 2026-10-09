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
Tested SHAs (each result names the exact commit it was recorded on; none was re-run on a later commit):
- Recorded on `a4ddf61` plus the one-test removal that was then committed as `334948f` (the only code change of this branch against `main` at that point): `vitest run --project unit tests/unit/ci-workflows.test.ts` 27 passed (before the removal 1 failed, because the reverted workflow has no "Clean git credentials" step); `eslint tests/unit/ci-workflows.test.ts` and `tsc --noEmit` clean; full unit project 1244 passed, 4 skipped, with `egress.test.ts` and `codex-poc-egress-redirect.test.ts` failing on `listen EPERM` at 127.0.0.1 (the local sandbox blocks port binding; unrelated).
- Later commits (`9bb6fff` docs move, merges of `origin/main` up to `efa3ef0`, which re-adds `.github/workflows/claude.yml` and updates the workflow-list assertion) changed only Markdown and merged upstream content. The implementer worktree has no `node_modules` and cannot write vitest's temp config, so the test was not re-run on them: the CI `gate` on the PR head is the authoritative run.
