# Progress log

## Current checkout — 2026-10-03

Repository audit baseline: `9641ad1e684cad7b84bd2385751ea19b0a9d4060` (docs worktree `claude/docs-freshness`). Local history contains the Company Builder merge `9fdcb7d` and the later docs merge `9641ad1`; remote branch/CI state is unverified here.

| Area | Repository state | Evidence |
|---|---|---|
| Phase 3/4 | Agents, knowledge, Copilot, access controls, email flows, invite-only beta and sandbox billing are implemented; historical gates do not certify this checkout | `src/server/`, `src/billing/`, `docs/implementation/RELEASE_REPORT.md`, `docs/implementation/PHASE4_BETA_REPORT.md` |
| AI hub | Cloud BYOK, five protocols, routing and metering implemented; live certification and hosted Copilot quality remain unverified | `src/ai/hub/`, `docs/ai/AI_HUB_REPORT.md` |
| Design system | Generated tokens, Arabic-first UI, light default, dark/system selection and protected copy editor | `src/design/`, `src/theme/config.ts`, `src/i18n/`, `src/app/admin/copy/` |
| Company Builder | Outcome-first interview, draft installation, sample trials and reviewed activation implemented behind an off-by-default flag; live Gmail is not implemented | `src/company-builder/`, `src/server/company-builder/`, `docs/company-builder/VALIDATION_REPORT.md` |
| CI incident #60 | Resolved 2026-10-08: the `start` job red at `f655e51` (PR #54) was `git config` exit 5 from multi-valued `credential.helper` on the persistent runner; fixed in the hub's `git_as_owner`, not in this repo. `tests/unit/ci-workflows.test.ts` gained schedule/runner policy checks; `.github/workflows/` untouched | `artifacts/phase-4/issue-60/EVIDENCE.md`, `docs/GITHUB_WORKFLOW.md` |
| Docs freshness | Scoped docs corrected against source; change ledger and unverifiable claims recorded | `docs/implementation/DOCS_FRESHNESS_20261003.md` |

Private beta remains **NOT READY**, public production **NOT APPROVED**, aggregate spend cap **$0**. See `NEXT_ACTION.md` and `docs/implementation/OWNER_ACTIONS.md`. The phase logs below are historical results at their named revisions, not current test counts or runtime instructions. Legacy Ollama live tests are archived under `docs/ai/history/`.

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
| Codex retest on `c35485e` | 18/18 PASS, 0 new findings (`artifacts/phase-1/codex-review/RETEST.md`) | `119aea2` |
| Added `pnpm stop:test` after an EADDRINUSE harness transient | — | `d6894de` |
| **Final full gate on `d6894de`** | lint ✓, typecheck ✓, unit 20/20, integration 34/34, E2E 27/27; 0 skipped/flaky → **PASS** | report commit follows |

## Helper usage (resource-limited laptop)

| Helper | Model | Task | Concurrency |
|---|---|---|---|
| Kimi Code CLI | `kimi-code/k3` | Wrote the integration test suite in a git worktree; reviewed and committed by Claude | Alone |
| Codex CLI | its configured model (`gpt-6-sol`), sandbox `workspace-write` | Independent exploratory browser test and retest (Playwright/Chromium, headless) | ≤2 helpers at once |
| OpenCode | `opencode/nemotron-3-ultra-free` (free), `plan` agent (read-only) | Accessibility and UX-copy review | Alongside Codex |
| Ollama | `qwen3-vl:8b` (local, GPU, unloaded after use) | Screenshot vs slide comparison | One model at a time |
| Claude Fable 5.1 | subagent (read-only) | Critical security and correctness review | Alone |
| Command Code | `poolside/laguna-s-2.1-free`, `stealth/ox-alpha` (both labelled FREE) | Setup/reproducibility review — **BLOCKED**: both requests were refused with "insufficient credits" (account billing). No credits were purchased. | — |

# Phase 2 progress log

All times are 2026-09-27, local. Branch `phase-2`.

| Step | Result | Commit |
|---|---|---|
| Foundation: egress/SSRF guard, provider adapter contract, registry | unit: egress | `aac9deb` |
| Engine v2 (DAG, parallel/join, pause/resume/cancel), sandboxed expressions + PDF, Docker code sandbox, credentials, approvals, usage ledger, triggers, scheduler, worker v2 | unit: engine-v2 | `bafb15d` |
| API + UI: connections/OAuth, catalog, publish/triggers, webhook receiver, approvals, cancel, re-run preview, usage & limits, node forms, inspector v2 | — | `600b2d0`, `9b07789` |
| 12 provider adapters + fake provider server + contract tests (Kimi Code, worktree) | 79 → 82 contract tests | `e9af074`, `8cdc5a1` |
| Action-level integration tests; fixes for refresh-denial rollback, basic-auth tokens, pasted-token scopes | int: p2-actions (12) | `6d940e7` |
| Six design templates, their integration tests, usable Templates page, fakes in the test stack | int: p2-templates (9) | `3090684`, `70c4b0c` |
| Phase 2 UI E2E journeys; Phase 1 E2E updated for the changed UI | e2e 31/31 | `1e4e0d5` |
| Live/sandbox suite (real Ollama + Postgres; SaaS BLOCKED without credentials). It found: real model obeyed embedded instructions 6/9 → quarantine 0/9; Postgres connect errors unmapped | live 9 PASS / 11 BLOCKED | `c2b7bd5` |
| Fable 5.1 security review: 2 High, 4 Medium, 6 Low — all fixed; tests fail on old code | int: p2-postgres (13), p2-review-fixes (10) | `09c5a09` |
| Codex exploratory test #1 on `d86d1d4` | 10 PASS / 3 FAIL / 1 BLOCKED; findings CX2-01…03 | — |
| Fixed CX2-01…03 + redact() Date bug; provider-slow & activation states; p2-engine tests; Phase 2 docs | unit 80, contract 82, integration 110, e2e 32 | `c7b7b54` |
| Codex retest on `c7b7b54`; clear auth message on server outages | changed items 6/7, journeys 6 PASS / 1 BLOCKED (Phase 3 roles) | `bee4390` |
| **Final gate on `bee4390`** | lint ✓, typecheck ✓, unit 80/80, contract 82/82, integration 110/110, E2E 32/32, live 9 PASS / 11 BLOCKED → **NOT PASS — BLOCKED** (SaaS sandbox credentials) | `5db5e86` |
| Owner decision 2026-09-28: 11 SaaS live checks out of scope for the Phase 2 gate only; baseline re-verified (no code change since `bee4390`) | **PASS — revised Phase 2 scope; 11 external live checks deferred** (still BLOCKED; release rows R-01…R-11) | decision commit follows |
