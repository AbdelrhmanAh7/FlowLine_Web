# Flowline Phase 1 gate report

| | |
|---|---|
| **Gate result** | **PASS**: every Phase 1 requirement in `SCOPE_MATRIX.md` is PASS (43 rows; 1 design row, light mode, is planned for Phase 3 per D11), and the real execution path is demonstrated |
| **Tested SHA** | `d6894ded398249da778a3c7d10cc7e0eb2431454` (`test-output/00-sha.txt`) |
| **Application URLs** | Dev: `http://localhost:3000` (`pnpm dev`). Test stack: `http://localhost:3100` (`pnpm dev:test`, `FLOWLINE_ENV=test`, DB `flowline_test`) |
| **Environment** | Windows 11, Node 25.6.1, pnpm 10.32.1, Docker 29.8 with `postgres:17.6-alpine`, Chromium (Playwright 1.63.0), 2026-09-27 |
| **Report date** | 2026-09-27 |

## Final automated run (same SHA, sequential)

| Check | Command | Passed | Failed | Skipped | Flaky | Blocked | Output |
|---|---|---|---|---|---|---|---|
| Lint | `pnpm lint` | ✓ (exit 0, 0 problems) | 0 | — | — | — | `test-output/01-lint.txt` |
| Typecheck | `pnpm typecheck` | ✓ (exit 0) | 0 | — | — | — | `test-output/02-typecheck.txt` |
| Unit | `pnpm test` | 20 | 0 | 0 | 0 | 0 | `test-output/03-unit.txt` |
| Integration (real Postgres) | `pnpm test:integration` | 34 | 0 | 0 | 0 | 0 | `test-output/04-integration.txt` |
| E2E (UI via Chromium) | `pnpm test:e2e` | 27 | 0 | 0 | 0 | 0 | `test-output/05-e2e.txt` (list + JSON) |
| **Total** | | **81** | **0** | **0** | **0** | **0** | |

**Harness transients (not product failures), fixed and recorded honestly:** three times during development, a
run failed right after test processes were force-killed. Once, integration tests failed; twice, E2E couldn't start
(`EADDRINUSE :3100`). The root cause was orphaned test-stack processes: on Windows, killing the launcher left the
Next server and the worker running, and a Playwright `stdout: "ignore"` setting made the worker die on its first log line.
Fixes: the tree-killing launcher (`scripts/dev-test.mjs`), `pnpm stop:test` (kills by port), stdout piping, an
E2E readiness check that requires a live worker (`/api/health?require=worker`), and an integration guard that
refuses to run while a worker is attached to `flowline_test`. The final gate above ran with none of these symptoms.

## Real execution path, demonstrated

`e2e/journey.spec.ts` covers the whole path through the UI only, as a brand-new user:
1. Landing → Start free → sign up (OAuth buttons are correctly shown as unavailable) → 3-step onboarding → blank flow.
2. Drag 4 nodes from the palette. Wire Manual trigger → JSON transform → Condition(true) → Output with **real mouse drags on the handles**. Configure expressions in the drawer.
3. Autosave → **reload**; the graph and settings persist. Ctrl+Enter runs the flow; the **separate worker process** executes it; the run dock shows SUCCESS.
4. The inspector shows the transform's Input (`employees: 120`) and Output (`size: 120`).
5. The **backend state is verified**: flow revision > 1, no issues, 4 nodes and 3 edges; run `succeeded`, output `{qualified:{…}}`, 4 succeeded `run_step` rows, and a `run` version pinned. No console errors.

## Acceptance coverage

| Acceptance item | Evidence |
|---|---|
| New-user E2E journey + backend state | e2e `journey.spec.ts` |
| Invalid flow (UI reasons, blocked shortcut, API 422) | e2e `failures.spec.ts` "invalid flow" |
| Save failure (silent retries → recovery; exhausted → Retry) | e2e "save failure"; int flows (fault) |
| Network interruption and recovery; conflict without silent overwrite | e2e "offline…", "offline conflict…" |
| Two users, separate workspaces, no flow/run leakage (UI + API) | e2e `tenancy.spec.ts`; int `tenancy.test.ts` |
| Reference screenshots at 1440/1024/375 + boundary assertions (767/768/1279/1280) | `screenshots/` (31 files); e2e `responsive.spec.ts` |
| Visual comparison vs the design app area; differences recorded and fixed | `visual-review/VISUAL-REVIEW.md` (V1–V9 fixed) |
| Agent-driven exploratory browser test → fixes → retest | `codex-review/REPORT.md` (2 findings on `edeb6a8`) → `codex-review/RETEST.md` (18/18 PASS on `c35485e`, 0 new findings) |

## Independent reviews

| Reviewer | Scope | Outcome |
|---|---|---|
| Codex CLI (agent-driven exploratory test, Playwright/Chromium, 89 + retest screenshots) | Full journey, canvas, keyboard, states, tenancy, responsive, visual tokens | CR-01 (major: double arrow nudge) and CR-02 (minor: per-flow success SQL) fixed with regression tests; retest all PASS |
| Claude Fable 5.1 (read-only, "critical situations") | Security and correctness | 9 findings (2 high: worker lease double execution; expression DoS). All fixed with tests; see `reviews/fable-security-review.md` |
| OpenCode (`nemotron-3-ultra-free`, read-only plan agent) | Accessibility and UX copy | Valid items fixed (field descriptions, tab keyboard pattern, filter semantics, menu focus); the rest were dismissed with reasons. `reviews/opencode-a11y-review.md` |
| Kimi Code (`k3`, worktree) | Wrote the integration suite | Accepted after review; its slug finding was fixed |
| Ollama `qwen3-vl:8b` (local GPU) | Screenshot vs slide comparison | Advisory and often wrong; verified points only (`visual-review/`) |
| Command Code | Setup review | **Blocked**: both free models were refused with "insufficient credits". Nothing was purchased. |

## Scope boundaries and remaining work

- **Phase 2** (automation and integrations: connectors, webhook/schedule triggers, LLM nodes, metering) and **Phase 3**
  (agents, knowledge, copilot, collaboration, billing, release, light mode, live OAuth, email verification) are
  listed as PLANNED in `SCOPE_MATRIX.md`. The UI shows their real "not available yet" state.
- Known limitations carried forward:
  - The run rate limiter is in-process (it needs a shared store before multi-instance deployment, P3-12).
  - Email verification isn't enforced (P3-08).
  - Expression evaluation is serialized through one sandbox process per worker. That is adequate for Phase 1 volumes; throughput tuning belongs to Phase 2 (P2-12).
- Evidence contains no secrets or customer data. The `@flowline-e2e.test` accounts are throwaway users in the local test DB.

**Stopped at the Phase 1 gate. Phase 2 begins with its own prompt.**
