# Handoff prompt — continue Flowline from a local AI coding CLI

Paste the block below into the other assistant (Codex CLI, Gemini CLI, Cursor, Aider, …) from the repository root on
your laptop. It is self-contained: the agent does not need this conversation.

---

```text
You are continuing work on Flowline, a Next.js 16 / React 19 / Drizzle + Postgres 16 workflow product with an
Arabic-first UI. You are on the owner's laptop, in the repository root.

## 0. Get the code and read the rules first
git fetch origin
git checkout -B claude/company-builder-milestones-abc-pmba6v origin/claude/company-builder-milestones-abc-pmba6v
# PR #1 (this branch → main) is open: https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/1
Read, in this order, before changing anything:
  AGENTS.md (binding project rules — note "This is NOT the Next.js you know": read node_modules/next/dist/docs/
  before writing Next.js code), CLAUDE.md, NEXT_ACTION.md, SCOPE_MATRIX.md (CB-* rows),
  docs/company-builder/VALIDATION_REPORT.md (§10 = latest round), artifacts/company-builder/BUGS.md.

## 1. Local setup
- Node 22, pnpm 10, Docker (browser tests run in mcr.microsoft.com/playwright:v1.63.0-noble).
- Postgres 16 on 127.0.0.1:5433 with databases `flowline` and `flowline_test`; the role needs CREATEDB (the gate
  creates flowline_test_s1..4 and flowline_test_e2.. for its shards and stacks).
- pnpm install --frozen-lockfile
- Create the git-ignored .env.test from docs/company-builder/env.test.template (fake credentials only; generate the
  three keys with openssl as the template says). Never put real credentials in it.
- Never use the dev database for tests.

## 2. Gates (owner decision 2026-10-01, written in AGENTS.md)
- Every commit: `pnpm gate` (~3–4 min on 4 CPUs: static checks in parallel, integration sharded over its own DBs,
  Chromium @critical/@cross-browser split over 3 isolated test stacks).
- Before merging to main: `pnpm gate:full` (adds all Chromium specs, Firefox, WebKit; on ≥8 CPUs the three projects run
  at once, otherwise one after another). Logs + summary.json land in artifacts/gates/ (git-ignored).
- Skipped or flaky tests are failures. Never delete an assertion, loosen a timeout, or change a baseline to get green.
  Re-running until green is not a fix. Root-cause it, or report it as open.
- If you have more CPUs, try `pnpm gate:full` and report the wall time; it should go under 8 minutes.

## 3. Current state (as of head b37c132 + one docs commit)
- Company Builder round R4 is done: FB2-01..10 fixed (FB2-05 disproved), the independent-review P2 fixed,
  PRE-02 e2e race fixed. Frozen benchmark packet: 9/10 strict (VP-06 is a disputed fixture expectation).
- Open, in priority order:
  1. GATE-01 (P3): one ECONNRESET on POST /api/auth/sign-in/email (e2e/ai-hub.spec.ts:28) in 1 of 7 fast-gate
     browser runs on the default stack. Suspected keep-alive socket reuse racing the server's idle close under load.
     Root-cause it (e.g. compare Node's server keepAliveTimeout with Playwright's request-context reuse), fix it,
     and show it no longer reproduces with repeated runs.
  2. Confirm `pnpm gate:full` passes on the final head (the last confirmation run was stopped by the owner).
  3. R4-RV-04 (P3, latent): the connection_missing suppression in src/company-builder/lifecycle.ts is
     provider-blind. Fix it per connection only when a second non-AI provider pack exists.
  4. Observations VO-01..06 in BUGS.md are product decisions for the owner, not defects to "fix" silently.
- Status labels that must stay true in every report: OVERALL COMPANY BUILDER: INCOMPLETE. LIVE GMAIL: NOT
  IMPLEMENTED / NOT VERIFIED. REAL CLI: UNVERIFIED (unless actually exercised). COMPETITIVE EDGE: NOT YET PROVEN.
  DEPLOYMENT: NO.

## 4. Hard limits (do not cross without the owner's explicit, separate approval)
- Do not merge to main yourself and do not push to main. The owner merges PR #1.
- No production deployment, no live payments or live billing keys, no beta invitations, no purchases.
- Do not implement or exercise live Gmail reading/sending, and never use the owner's personal Gmail.
- Do not expand Company Builder packs B–D.
- Do not edit the frozen validation packet (artifacts/company-builder/validation/20261001-d224cfb/packet/, sha256
  4fa9841b…) or rewrite historical results/evidence. Add new runs and sections instead.
- Never collect, copy or print credentials or authentication stores. No secrets in commits or evidence
  (`pnpm check:evidence` must report 0 hits). No local model inference unless the owner asks.
- Arabic-first: every user-facing string goes through src/i18n with identical keys in ar (source of truth) and en.
- Test-only code stays behind FLOWLINE_ENV=test. Schema changes need a drizzle migration (pnpm db:generate).

## 5. Way of working
- Work on branch claude/company-builder-milestones-abc-pmba6v (or a new branch off it). Small commits, each passing
  `pnpm gate`. Push only that branch.
- Write evidence (logs, reports) under artifacts/, tied to the tested commit SHA.
- When you finish, report: the tested SHA, local and remote SHA, the gate summary (tests and wall time), what you fixed
  with the regression evidence (failing before, passing after), what's still open, and the status labels above. Say
  plainly what you did not verify.
```
