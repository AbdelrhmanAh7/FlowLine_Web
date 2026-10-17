# Phase 2 exit report — Flowline automation platform

**Tested SHA:** `bee4390` (branch `phase-2`) · **Date:** 2026-09-27 · **Gate outputs:** `artifacts/phase-2/test-output/`

## Revised verdict (2026-09-28): **PASS — revised Phase 2 scope; 11 external live checks deferred**

**Owner decision, 2026-09-28 (quoted):** *"I explicitly accept the 11 SaaS live integration checks as out of scope for the PHASE 2 ACCEPTANCE GATE ONLY."* The owner also required that the original verdict and evidence are preserved, that the deferred checks stay **BLOCKED — missing credentials**, that the 11 integrations stay in the full product scope, and that the product isn't declared Production Ready until their live checks pass (unless a separate release-scope change is approved). The decision authorises Phase 3. It does not authorise production deployment or live payments.

**Basis for the revised verdict:**
- **The rest of the gate is satisfied:** lint, typecheck, unit 80/80, contract 82/82, integration 110/110, E2E 32/32 (nothing skipped or flaky); live Ollama ×6 and PostgreSQL ×3 PASS; all 12 Fable findings and all 3 Codex findings fixed with evidence.
- **Baseline re-verified 2026-09-28:** the working tree was clean at `5db5e86`, and `git diff bee4390 5db5e86` touches only `artifacts/`, `docs/`, `NEXT_ACTION.md` and `SCOPE_MATRIX.md`, with no application, test or configuration code. The results for `bee4390` therefore still hold, and no check needed re-running.
- **The 11 live checks are deferred, not passed.** Each stays **BLOCKED — missing credentials** in `live-results.json` and in the catalog, which shows "live: blocked" for those providers. They move to the release acceptance matrix (`SCOPE_MATRIX.md` → *Release acceptance*, R-01…R-11). These integrations are **implemented and contract-tested against provider doubles; they are not verified against the real providers.**
- **Carried into Phase 3, not closed here:**
  - The viewer-approval **UI** journey (needs the Phase 3 roles UI; the server rule is covered by `int: p2-actions`).
  - The Docker port-proxy connectivity investigation (CX2-01).
  - The hydration console warning (CX2-R01).

## Original verdict (2026-09-27, preserved): **NOT PASS — BLOCKED** (live sandbox checks for 11 SaaS integrations)

Everything that can be verified without external accounts passes. Under the phase rules (*no PASS while a mandatory test is skipped or blocked*), the gate can't be PASS: the sandbox-live checks for Google Sheets, Gmail, Slack, HubSpot, Zendesk, Airtable, Snowflake, GitHub, Stripe, Notion and Linear are **BLOCKED** because no sandbox credentials were provided. They were not faked, and no real accounts, payments or deployments were used. Phase 3 has not been started.

**To unblock:** supply dedicated sandbox/test credentials as `FLOWLINE_LIVE_<PROVIDER>` (format in `.env.example`) and run `pnpm test:live`. Alternatively, the owner can explicitly accept these checks as out of scope for Phase 2.

## Gate results on `bee4390`

| Check | Result |
|---|---|
| Lint (`pnpm lint`) | ✓ 0 problems |
| Typecheck (`pnpm typecheck`) | ✓ |
| Unit (`pnpm test`) | ✓ 80 / 80 (7 files) |
| Contract — 12 adapters vs provider doubles (`pnpm test:contract`) | ✓ 82 / 82 (14 files) |
| Integration — real Postgres, real worker code, Docker code sandbox (`pnpm test:integration`) | ✓ 110 / 110 (12 files) |
| E2E — Playwright through the UI, doubles only at the provider boundary (`pnpm test:e2e`) | ✓ 32 / 32 (27 Phase 1 regression + 5 Phase 2 journeys); 0 skipped, 0 flaky |
| Live / sandbox (`pnpm test:live`) | 9 PASS (real Ollama `qwen2.5:3b` ×6, real PostgreSQL ×3) · **11 BLOCKED** (SaaS identity, no credentials) — `artifacts/phase-2/live-results.json` |

Deterministic total: **304 tests, all passing, none skipped.**

## Integration verification levels (computed catalog: 12)

| Level | Providers |
|---|---|
| Adapter implemented + contract tested | all 12 |
| Sandbox-live verified | PostgreSQL |
| Sandbox-live **BLOCKED** (no credentials) | Google Sheets, Gmail, Slack, HubSpot, Zendesk, Airtable, Snowflake, GitHub, Stripe, Notion, Linear |

## Independent reviews

- **Fable 5.1 security review** (`reviews/fable-security-review.md`): 2 High (Postgres SSRF via connection-string params; read-only query bypass by stacked statements), 4 Medium (blind HTTP re-send after worker loss; subflow/loop child replay; webhook replay; resume with redacted values), 6 Low. All 12 are fixed, with regression tests confirmed to fail on the old code. An extra issue found while fixing them is also fixed: a reviewer's "retry" is now one-shot.
- **Codex agent-driven exploratory test** (`codex-review/REPORT.md` on `d86d1d4`): 14 journeys, 10 PASS / 3 FAIL / 1 BLOCKED; findings CX2-01 (stack outage), CX2-02 (session token in a logged DB error), CX2-03 (wrong "failed" toast). A redaction bug that emptied the API's run/step timestamps was also found during the fix work. All were fixed in `c7b7b54`.
- **Codex retest** (`codex-review/RETEST.md` on `c7b7b54`): changed items 6 PASS / 1 FAIL; journeys 6 PASS / 1 BLOCKED.
  - The FAIL is **CX2-01 recurring**. Postgres logged no connection attempts during the outage, so the Docker Desktop port proxy (shared with another project's container runs) stalled. After the fix the app fails fast (health 503 in ≤5 s), recovers without intervention, and auth forms now say the service is temporarily unavailable (`bee4390`). The stall's trigger is environmental, not in Flowline.
  - The BLOCKED journey is **viewer-role approval**: the members/roles UI is Phase 3. The server-side rule (the approver must still be an editor when the action executes) is covered by `int: p2-actions`.
  - **CX2-R01** (minor dev-mode hydration console warning) could not be reproduced (3 widths, 2 locales/time zones); left open as minor.
- **Live AI suite** found that the local model obeyed instructions embedded in an invoice in 6 of 9 trials with prompt framing alone. Lines that address the AI are now quarantined before the model sees them: 0 of 9 poisoned, recorded on the step.

## Requirement coverage

Every Phase 2 prompt requirement has a row in `SCOPE_MATRIX.md` (P2-01…P2-33) with its evidence; `docs/implementation/PHASE-2.md` explains the design and `DESIGN_DECISIONS.md` D17–D24 records the decisions. The only row that is not PASS is **P2-07** (integrations: PARTIAL, live BLOCKED for 11 SaaS).

## Helpers used (≤3 agents, separate worktrees)

Kimi Code (adapters, fakes, contract tests; worktree), Codex CLI (exploratory test + retest; worktree `FL-wt-codex`, sandbox `workspace-write`, no sandbox bypass), Claude Fable 5.1 (read-only security review), Ollama `qwen2.5:3b` (live AI suite, one model at a time).

## Evidence handling

Screenshots and redacted evidence are from agent-driven browser tests against the isolated test stack. Playwright traces (they can contain test-session cookies) are kept out of git; the committed E2E output excludes server request lines, which carried single-use test OAuth codes. No real credentials or customer data are included.
