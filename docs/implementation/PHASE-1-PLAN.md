# Phase 1 plan: interface and foundation

**Goal:** a locally running Flowline with screens matching the reference, accounts, workspaces,
real database persistence, and a canvas editor that builds and **actually executes** a local workflow
whose results can be inspected.

**Gate:** every Phase 1 row in `SCOPE_MATRIX.md` passes with evidence, the full automated suite
passes on the tested SHA, and an agent-driven exploratory browser test has been run, its findings fixed, and the fixes retested.
Phase 2 starts only with its own prompt.

## Workstreams

| # | Workstream | Owner | Status |
|---|---|---|---|
| 1 | Inspect repo, render/extract the deck, evaluate Sim, choose stack | Claude | done |
| 2 | Schema + migrations, dev/test DBs, `.env.example` | Claude | done |
| 3 | Engine: node defs, validation, JSONata sandbox, executor | Claude | done |
| 4 | Worker process (queue, heartbeat, stale recovery) | Claude | done |
| 5 | Auth (better-auth) + workspaces + roles + tenancy-safe API | Claude | done |
| 6 | Integration test suite (real Postgres) | Kimi Code (worktree), reviewed by Claude | done |
| 7 | UI: landing, auth, onboarding, shell, dashboard | Claude | done |
| 8 | Builder: canvas, palette, drawer, autosave, offline drafts, undo/redo, keyboard map, run dock | Claude | done |
| 9 | Run inspector, re-run from step; Integrations/Templates/Settings real state | Claude | done |
| 10 | E2E acceptance specs + screenshots at 1440/1024/375 and breakpoint edges | Claude | done |
| 11 | Visual comparison vs slides (Claude + local Ollama `qwen3-vl:8b`) | Claude + Ollama | see progress |
| 12 | Agent-driven exploratory browser test → fix → retest | Codex CLI | see progress |
| 13 | Docs, scope matrix, report, evidence under `artifacts/phase-1` | Claude | see progress |

## Working rules

- Max three helper agents at once, and in practice one or two, to keep laptop load low. Never two agents on the same browser session.
- Helpers never commit. Claude reviews diffs, re-runs the gates, and commits.
- Test-only features exist only when `FLOWLINE_ENV=test`. There is no demo data in dev.
- Don't delete assertions or change baselines to hide bugs. Skipped or flaky tests count as not passed.
