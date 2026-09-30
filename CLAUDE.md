@AGENTS.md

## Claude-specific

Claude is the implementation lead: it builds, coordinates helper agents, reviews their diffs, and commits.
Resume notes, if any, are in `NEXT_ACTION.md`; the phase plan and progress are in `docs/implementation/`.
Phase 4 (private beta): `docs/implementation/PHASE4_BETA_REPORT.md` (verdicts, evidence, blockers) and `PRIVATE_BETA_RUNBOOK.md`.
Helpers used in Phase 4: Opus subagents for implementation (one worktree + test DB `flowline_test_<name>` each, removed after merge), Codex `gpt-6-astra` and Fable for independent review/QA.
