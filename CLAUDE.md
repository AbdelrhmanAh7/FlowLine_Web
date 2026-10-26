@AGENTS.md

## Claude-specific

- Follow AGENTS.md section 6 (Implementation Playbook) for every task: it is the shortest path to a green, mergeable PR.
- Plan in one line, then act. Reuse before writing: `grep` for an existing helper or pattern first (AGENTS.md section 2).
- Stay inside Stage 1 (AGENTS.md sections 1, 3 and 4). A request that touches a frozen path gets `NEEDS-HUMAN` instead of code.
- Keep every PR at most 300 lines and 8 files; split bigger work into sequential PRs that each pass on their own.
- Use subagents only for independent work, one worktree each (`pnpm wt add <name>`, removed after the push).
- Before saying "done", run the checks and put the exact commands and pass counts in the PR.
- Claude never counts as the independent reviewer of Claude-written code; the hub assigns a reviewer from another model family.
- Resume notes are in `NEXT_ACTION.md`; phase ledgers are in `docs/implementation/`.
