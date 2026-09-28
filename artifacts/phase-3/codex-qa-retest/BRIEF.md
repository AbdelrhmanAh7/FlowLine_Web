# Codex — retest of the Phase 3 staging findings (agent-driven exploratory browser test)

You are the same independent tester who wrote `ORIGINAL-REPORT.md` (in this folder). Do **NOT** modify product code
(anything outside `artifacts/phase-3/codex-qa-retest/`). Do not commit. Call it an agent-driven exploratory browser
retest — not human UAT.

## Target
- Staging `http://localhost:3200`, now the release candidate image `flowline:9fd9860` (revision
  `9fd986002fde5f859e36db46b67eea901387348b`, schema 8). Same rules as before: real local Ollama `qwen2.5:7b` (slow),
  no SaaS credentials, billing and SSO not configured, production rate limits (space out sign-ups), no fault API.
  Don't start/stop servers, containers or Docker. Use the UI like a user (Playwright scripts under
  `artifacts/phase-3/codex-qa-retest/scripts/` are fine; one browser at a time). Create fresh `@flowline-qa.test`
  accounts through the sign-up UI (your earlier accounts still exist and may be reused).

## What changed (Claude's fixes, for you to verify — don't trust this list)
- **CX3Q-01** pending agent approvals: the Flows dashboard now lists each agent request waiting for a decision with
  "Review →" to that agent run (`/agents/<id>?tab=runs&run=<id>`); the agent's Runs tab shows the run with
  Approve/Reject (viewers see it disabled with the reason); Chat shows a banner for waiting requests. Root cause found:
  the attention list was hidden whenever a workspace had no workflow runs.
- **CX3Q-02** Copilot with the real model: clearer catalog/prompt, a validation-feedback repair loop, and deterministic
  repairs shown as warnings (re-spelled ids, "after" insertion, steps placed before outputs, action ids used as step
  types). Claude measured on qwen2.5:7b: your three request types 12/12 correct; six held-out requests 7/12 (the rest
  are rejected with reasons). Proposals still never run anything; invalid ones can't be applied.
- **CX3Q-03** a request naming an app Flowline doesn't integrate with is refused up front ("Salesforce isn't an
  available integration … Available: …") instead of being substituted.
- **CX3Q-04** on mobile, "+ New flow" and "Create with Copilot" are disabled with the reason.
- **CX3Q-05** "Create with Copilot" no longer creates a flow until a proposal is approved (reject/invalid/abandon leave
  nothing).
- Also: Copilot model calls are now metered (Usage & limits shows them; a budget can refuse them); text typed into a
  form before the page finishes loading is no longer lost; the sign-in SSO form works before hydration.

## Retest (report each PASS / FAIL / PARTIAL with evidence)
1. CX3Q-01 exactly as you reproduced it (ASK tool → navigate away → dashboard Review → decide), plus: a **viewer** can
   see the waiting request but can't decide (reason shown); an editor/owner approves → the workflow runs once.
2. CX3Q-02: your original Copilot requests (local JSON transform on an existing flow ×2; manual order-total flow from
   Flows), plus 2–3 new realistic requests of your own. Report how many produced an approvable proposal, whether each
   approved draft is sensible (right steps, connected, nothing removed silently), and that invalid ones explain why.
3. CX3Q-03: Salesforce (and one other app not in the catalog) → honest refusal naming the app.
4. CX3Q-04: 375px Flows page — both creation buttons disabled with the reason; templates still usable.
5. CX3Q-05: Create with Copilot → reject / invalid / close the panel → no new flow in the list; approve → exactly one
   draft flow, not published, never run.
6. Quick regression sweep: sign-up → template run; members invite/viewer; API key 202/401; knowledge + agent citation;
   Settings honesty pages; tenancy by URL; mobile no horizontal scroll. Note any **hydration warnings** (page + text) or
   "none in N page loads".

## Report — write `artifacts/phase-3/codex-qa-retest/RETEST.md`
Environment/tooling, accounts (emails only), a table CX3Q-01…05 → PASS/FAIL/PARTIAL with evidence paths, the
Copilot counts, any NEW findings (`CX3R-NN`, severity, steps, expected vs actual, evidence), the regression sweep
results, hydration observations, and what you couldn't test. Never include passwords, cookies, keys or tokens.
