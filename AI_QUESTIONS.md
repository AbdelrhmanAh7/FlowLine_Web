# AI_QUESTIONS.md

## PR #69 / issue #67 — the last review thread cannot be cleared by code

The only thing blocking PR #69 (`ai/67`, "Document and unit-test the `pnpm wt` worktree helper") is one unresolved
review thread whose finding the branch already satisfies.

- Thread `PRRT_kwDOUvLGYc6rRgdh` (comment `discussion_r4243216521`, path `AGENTS.md`, marked **[OUTDATED]**) asks to
  split the `AGENTS.md` and report/evidence changes into a separate PR, or amend the issue scope, because the diff
  went beyond the issue's ~300-line limit.
- Those files are already gone from the branch, so there is nothing left to change:
  - `git diff --name-status origin/main...HEAD` (base `9944c96`) is exactly four files, +206/−26:
    `docs/DEVELOPER_GUIDE.md`, `scripts/worktree.mjs`, `tests/unit/worktree-cli.test.ts`,
    `tests/unit/worktree-script.test.ts`.
  - No `AGENTS.md` (reverted in `7e80449`), no `docs/implementation/PHASE4_BETA_REPORT.md`, no
    `artifacts/phase-4/worktree/EVIDENCE.md` (`a3fa756`), no `.github/workflows` changes.
- The deliverable is complete and green: `pnpm exec vitest run --project unit tests/unit/worktree-*.test.ts` = 81
  passed; `pnpm typecheck` clean; `pnpm exec eslint` on the touched files clean; CI (`docs`, `gate`, CodeQL) green at
  `a3fa756`.

### Why the automated loop cannot clear it

The hub's thread job (`nql-agents/src/jobs/threads.ts`) resolves a thread only when a verdict model returns `fixed`
or `disagree` for **the code at the thread's path**. This finding is anchored to `AGENTS.md`, and the excerpt the
model is handed (the agent constitution at the top of `AGENTS.md`) cannot describe a PR-scope complaint, so the model
has returned `not_fixed` on every head (`logs/launchd-quality.log`). With no hub reply in the thread, `effRounds=0`,
so neither loop-breaker (`rounds>=2` CTO decision, Watchdog `sightings>=3`) fires either. No commit on the branch can
change that verdict.

### Question for the owner / CTO

1. The finding is already satisfied by the current branch. Please confirm one of:
   - **(a)** resolve the stale thread `PRRT_kwDOUvLGYc6rRgdh` with the recorded reason that the files it names are no
     longer in the diff (Constitution art. 2: a thread may be resolved on the owner's recorded override), or
   - **(b)** have the hub re-request a CodeRabbit re-check of the thread against `a3fa756` and resolve it if CodeRabbit
     agrees it is done.
2. If neither, say which concrete change to the branch would clear it.

The `pnpm wt` helper, its unit tests and the `docs/DEVELOPER_GUIDE.md` section are done; nothing else is needed from
the engineers. PR comments and thread resolution are owned by the harness, so this file is the escalation channel.

<sub>Supersedes the earlier stale `AI_QUESTIONS.md` content from issue #173 (PR #182, already merged).</sub>
