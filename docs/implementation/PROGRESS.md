# Phase 1 progress log

All times are 2026-09-27, local.

| Step | Result | Commit |
|---|---|---|
| Inspected the directory: only the design deck, no git | Initialized the repo, rendered the deck (LibreOffice in Docker), extracted text and tokens | — |
| Evaluated Sim (Apache-2.0, `e105e07…`) | Not adopted (see DESIGN_DECISIONS §1) | — |
| Scaffold: schema, engine, worker, API | 12 unit tests passing | `b8fd2d8` |
| Integration suite (Kimi Code, isolated worktree) | 29 → 34 tests; Kimi's slug-accent finding fixed | `b4d89fe` |
| Frontend: all screens plus the E2E journey | Journey passes through the UI | `6c6e7a1` |
| E2E acceptance specs; fixes for jsonb-order dirty state, step-selection race, drawer covering zoom | 25 specs passing | `edeb6a8` |
| Codex exploratory test #1 on `edeb6a8` | 2 findings: CR-01 (major, double arrow nudge), CR-02 (minor, per-flow success SQL) | — |
| Fixed CR-01/CR-02 with regression tests; OpenCode a11y review fixes; per-user fault injection; robust test stack; docs | All suites green | `39b2e7e` |
| Fable 5.1 critical security review | 9 findings (2 high); all fixed with tests | `c35485e` |
| Local VLM (`qwen3-vl:8b`) visual comparison | Advisory; verified points recorded in VISUAL-REVIEW.md | — |
| Codex retest on `c35485e` | see `artifacts/phase-1/codex-review/RETEST.md` | — |
| Final full gate run on the final SHA | see `artifacts/phase-1/REPORT.md` | — |

## Helper usage (resource-limited laptop)

| Helper | Model | Task | Concurrency |
|---|---|---|---|
| Kimi Code CLI | `kimi-code/k3` | Wrote the integration test suite in a git worktree; reviewed and committed by Claude | Alone |
| Codex CLI | its configured model (`gpt-6-sol`), sandbox `workspace-write` | Independent exploratory browser test and retest (Playwright/Chromium, headless) | ≤2 helpers at once |
| OpenCode | `opencode/nemotron-3-ultra-free` (free), `plan` agent (read-only) | Accessibility and UX-copy review | Alongside Codex |
| Ollama | `qwen3-vl:8b` (local, GPU, unloaded after use) | Screenshot vs slide comparison | One model at a time |
| Claude Fable 5.1 | subagent (read-only) | Critical security and correctness review | Alone |
| Command Code | `poolside/laguna-s-2.1-free`, `stealth/ox-alpha` (both labelled FREE) | Setup/reproducibility review — **BLOCKED**: both requests were refused with "insufficient credits" (account billing). No credits were purchased. | — |
