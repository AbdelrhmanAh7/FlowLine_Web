# AI questions: issue #60 (PR #61)

## Blocker: this branch's ci-workflows test now fails after merging main

At HEAD `4648a29` (merge of `origin/main` `592a07a` into `ai/60`), running
`pnpm exec vitest run --project unit tests/unit/ci-workflows.test.ts` fails before collecting any tests:

```
Error: ENOENT: no such file or directory, open '.github/workflows/ai-implementers.yml'
 ❯ tests/unit/ci-workflows.test.ts:529:30
```

**Root cause:** main commit `592a07a` (#157, slim-down 2/2) deleted `.github/workflows/ai-implementers.yml`
("disabled; the hub runs from launchd"). The `describe("ai-implementers.yml (Mac mini hub)")` block that this PR adds
(lines 526-566, not on main) reads that file at collection time. The workflow whose `start` job went red in #60 no longer
exists on main, so the incident cannot recur from this repo.

**Proposed fix (needs owner approval):** delete the PR's `ai-implementers.yml` test block, since the file it checks is gone.
The auto-mode safety classifier refused that edit as "security test removal", so the agent left it alone.
Then update the docs to match:
- `docs/GITHUB_WORKFLOW.md` "AI implementers" section: say the workflow was removed in #157 and the hub runs from launchd,
  and remove the cron/engine bullets that describe a file that no longer exists.
- `artifacts/phase-4/issue-60/EVIDENCE.md`:
  - Say the workflow was removed in #157.
  - Drop the "current main is `b1023c9`" wording, which is now stale.
  - Fix the blank line at line 29 that splits the verification table from its header.
  - Add a row for the new tested SHA.
- `docs/implementation/PROGRESS.md` row: drop the claim that the test file "gained schedule/runner policy checks".

After that, the PR diff is docs-only. These review threads would then be moot:
- Codex P2, single-quoted crons.
- Codex P2, launchd vs Actions. The doc already calls the workflow inactive; it would then say it was removed.

The other open threads are already satisfied on this branch:
- The evidence lives under `artifacts/phase-4/issue-60/`.
- Rows without an exact tree are removed.
- The PROGRESS date is labelled as later than the 2026-10-03 baseline.

**Alternative:** if the owner wants a guard, replace the block with one assertion that no workflow under
`.github/workflows/` uses `runs-on: [self-hosted, ...]`. That is a different test and also needs approval, because it
replaces the current assertions.
