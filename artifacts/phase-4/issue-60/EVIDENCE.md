# Evidence: Issue #60 (Post-merge: CI red after #54)

## Summary
After PR #54 merged, the `start` job of `.github/workflows/ai-implementers.yml` (self-hosted Mac mini runner) failed on `main` at `f655e51caf115e0313fba01c452d5e158176f5b9` (run 37405560870, step "Implement with local Claude (fallback Codex)"):

```
error: cannot overwrite multiple values with a single value
##[error]Process completed with exit code 5.
```

## Root cause
The self-hosted runner reuses its checkout workspace, so `.git/config` kept several `credential.helper` values from earlier runs. The hub script `git_as_owner` (hub `bin/common.sh`, outside this repo) then set a single value on that multi-valued key, and `git config` exited with status 5. Nothing in FlowLine code, tests or the repository CI (`gate`, `docs`) was at fault: `Gate` passed on `f655e51` and on the then-current `main` (`bc59cab`).

Since #157 (`592a07a`) the workflow is gone from this repo: `.github/workflows/ai-implementers.yml` was deleted and the hub runs the implementers from launchd, so this `start` job can no longer fail here.

## Resolution
- The cleanup lives in the hub (`AbdelrhmanAh7/nql-agents`), commit [`41c658f0720effff140287e4101f6cbd2e951627`](https://github.com/AbdelrhmanAh7/nql-agents/commit/41c658f0720effff140287e4101f6cbd2e951627) "git_as_owner: reset credential.helper idempotently (second run in same workspace failed)", committed 2026-10-06T02:45:20Z (read with `git show -s --format=%cI 41c658f` in a local hub checkout): `git_as_owner` in `bin/common.sh` now runs `git config --local --unset-all` for `credential.helper` and `http.https://github.com/.extraheader` before re-adding them. That is 23 minutes after the failing merge `f655e51` (committed 2026-10-06T02:22:11Z, verifiable in this repo).
- **Author-reported, not verifiable from this repo:** later `start` runs on `main` reportedly passed (for example 37588370109, 37594935252, 37605265556, 37619221039). Their start times were not captured (the GitHub API budget on the hub was exhausted when this was written), so this file does **not** show that each of them started after the hub commit above; the only ordering shown here is failing merge → hub fix. The claim that later runs passed is author-reported and unverified from this repository.
- This PR does **not** change `.github/workflows/` (owner-only). An earlier revision added "Clean git credentials" steps there; they were reverted, together with the unit test that required them.
- An earlier revision of this PR pinned the workflow's crons and runners in `tests/unit/ci-workflows.test.ts`. That block read `ai-implementers.yml`, which #157 deleted, so it failed with `ENOENT` after merging main and contradicted main's own check that the file is absent; it was removed. The root cause (a reused self-hosted workspace) is now guarded by the "workflow files" tests: every `runs-on` must be `ubuntu-24.04`, `ai-implementers.yml` must be absent, and the new #60 test proves the runner guard rejects `runs-on: [self-hosted, macmini]` and that no workflow mentions `self-hosted`.
- `docs/GITHUB_WORKFLOW.md` records that the workflow was removed in #157, where the persistent-runner git cleanup lives, and the test guard above.

## Still red, outside this repo
Recent scheduled `automerge` runs failed with `automerge.sh: line 103: syntax error near unexpected token 'done'` in the hub's `bin/automerge.sh`. That is a hub script bug, not a FlowLine one.

## Local verification
This report lives only here, under `artifacts/phase-4/issue-60/`; the branch has no root `EVIDENCE.md`. It records only the current tested source. Older rows (trees that still carried the removed `ai-implementers.yml` test block) were dropped because they no longer describe this branch; they remain in the git history of this file.

Tested commit: `234c322afc9f8616b1160d5b168174e9d791598e` (clean working tree, `git status --short` empty). Source fingerprint, so the tested source can be matched after later commits: `git rev-parse <commit>:tests` = `c0fe1e7ad3a0b99ce5319ebefe345ebf9f4ef64f`, `git rev-parse <commit>:src` = `c7be09b06e30db7bd505b591880449295a3500ad`. The commit that adds this note changes only this file, so `git diff --stat 234c322 <that commit>` lists this file alone and both fingerprints are unchanged.

| Command (on `234c322afc9f8616b1160d5b168174e9d791598e`) | Result |
|---|---|
| `pnpm exec vitest run --project unit tests/unit/ci-workflows.test.ts --maxWorkers=2` | 82 passed (1 file) |
| `pnpm exec eslint tests/unit/ci-workflows.test.ts` | clean |
| `pnpm typecheck` (`tsc --noEmit`, run outside the Bash sandbox so the hub's type-check slot lock works) | exit 0 |
| `git show -s --format='%H %cI' 41c658f` (local hub checkout) and `f655e51` (this repo) | `41c658f0720effff140287e4101f6cbd2e951627 2026-10-06T05:45:20+03:00` (02:45:20Z); `f655e51caf115e0313fba01c452d5e158176f5b9 2026-10-06T05:22:11+03:00` (02:22:11Z) |

Gate runs on a pull request execute on GitHub's synthetic merge commit of the PR head into `main` (for example `1c28383b47a83c1b5117887b7596f9ea7747fca3`, which merges PR head `279840db7ae7fce73db4c784f2b255c3fff1f24c` into `main` `efa3ef08720e39b7bde0e086c80364f753248a95`, read with `gh api repos/AbdelrhmanAh7/FlowLine_Web/commits/1c28383`; GitHub recreates that synthetic commit on each push), not on the PR head itself. A green `gate` is evidence for that synthetic merge tree only, not for the PR head alone. Final-candidate validation (a green `gate` and `docs` on the final PR head, plus the full tier dispatched once) is pending and is recorded on the PR, not here.

The PR diff against `main` (`2ca60e5`) is this file, `docs/GITHUB_WORKFLOW.md`, `docs/implementation/PROGRESS.md` and one test in `tests/unit/ci-workflows.test.ts`. The required CI `gate` and `docs` checks on the PR head remain the authoritative full run; the full suite was not run locally (repo rule).
