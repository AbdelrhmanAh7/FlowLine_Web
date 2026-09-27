# Codex — independent code, test & security review (Flowline Phase 3)

You are an **independent reviewer**. Another agent (Claude) wrote this code. Your job is to find real defects,
not to praise. Do **NOT** modify product code (`src/`, `worker/`, `drizzle/`, `e2e/`, existing tests). Do not commit.
You MAY add proof-of-concept tests as new files `tests/integration/codex-poc-*.test.ts` (or `tests/unit/codex-poc-*.test.ts`)
to demonstrate a defect — a failing PoC test is the best evidence. Claude will fix the findings, then ask you to retest.

## Repo
- Worktree: this directory, branch `codex-p3`, revision `a8cef39`. Next.js 16 App Router (read `node_modules/next/dist/docs/` if an API looks unfamiliar), React 19, Drizzle/PostgreSQL 17, better-auth 1.7.6, zod 4, Vitest.
- Rules: `AGENTS.md`. Scope/status: `SCOPE_MATRIX.md` (Phase 3 section P3-*), plan `docs/implementation/PHASE-3-PLAN.md`, `docs/implementation/TEST_PLAN.md`.
- Tenancy rule: every server access goes through `src/server/access.ts` (non-members get 404). Permission matrix: `src/lib/permissions.ts`.

## Phase 3 surface to review (new since Phase 2)
- Members & invites `src/server/members.ts`, `src/app/api/workspaces/[wid]/invites|members`, `src/app/api/invites/[token]`, `src/app/invite/`.
- API keys + public API `src/server/apikeys.ts`, `src/app/api/v1/**`, rate limit `src/server/rate-limit.ts`.
- Agents `src/server/agents.ts`, `worker/agent-runner.ts`, `src/ai/chat.ts`; tool decisions ALLOW/ASK/DENY; approvals `src/server/approvals.ts`.
- Knowledge `src/server/knowledge.ts` (uploads, indexing, search ACL), routes under `src/app/api/workspaces/[wid]/knowledge`.
- Copilot `src/server/copilot.ts`, `src/app/api/flows/[fid]/copilot/**`.
- Versioning/sharing `src/server/flows.ts` (restoreVersion, shareFlowCopy), private connections `src/server/connections.ts`.
- Usage & limits `src/server/usage.ts`, `src/server/runs.ts`, `src/server/entitlements.ts`.
- Billing (sandbox) `src/billing/**`, `src/app/api/billing/webhook`, `src/app/api/workspaces/[wid]/billing/**`.
- SSO `src/server/sso.ts`, `src/server/oidc.ts`, `src/app/api/sso/**`. Audit `src/server/audit.ts`.
- CSRF `assertSameOrigin` in `src/server/http.ts`; egress/SSRF `src/server/egress.ts`.

## What to look for (p3§18 security list — report each as checked / finding)
Tenant isolation & IDOR (every new route: can workspace B touch A's agent, agent run, knowledge source, proposal, key, invite, billing, audit, SSO config?),
credential isolation (private connections through agents, API keys, shared copies, restore), API key scopes/expiry/revocation/creator-role downgrade,
role enforcement (viewer/editor/owner vs the matrix, server-side), XSS (rendered model output, knowledge text, audit data, invite page, sso_error),
CSRF on cookie-auth unsafe methods, SSRF (knowledge URLs if any, SSO discovery/token/jwks endpoints, AI base URLs), webhook signature/replay/ordering (billing),
upload limits/types (knowledge), worker permissions, knowledge ACL incl. revoked access, prompt injection (tool calls cannot escape the agent's allowed tools / args / workspace),
unauthorised tool call, stale/expired/replayed approval (args or connection changed after approval), revoked credential mid-run, usage/limit bypass (concurrency, retries),
double billing, duplicate side effects (agent `run_workflow` retried/recovered), secret leakage in logs/audit/evidence/API responses, SSO account linking/takeover.

Also review test quality: are the Phase 3 tests (`tests/integration/p3-*.test.ts`, `e2e/phase3.spec.ts`) asserting the real thing, or could they pass with a broken implementation? Missing negative tests?

## How to run things
- Unit/contract: `pnpm test`, `pnpm test:contract`. Integration (uses the `flowline_test` DB on localhost:5433 — Docker is already running; do not stop it): `node scripts/with-env.mjs .env.test npx vitest run --project integration <file>`.
- Don't start the web servers on 3000/3100, don't run `pnpm test:e2e`, don't touch the `flowline` (dev) DB. Keep laptop load low: one test process at a time.

## Report — write `artifacts/phase-3/codex-review/REVIEW.md`
- Revision reviewed, what you read, what you ran (commands + pass/fail counts).
- Findings table: ID `CX3-NN`, severity (critical/high/medium/low), area, `file:line`, the concrete failure/exploit scenario, evidence (PoC test path + its output, or exact code path), suggested fix.
- Security checklist: each p3§18 item → "checked, no issue" / "finding CX3-NN" / "not checked (why)".
- Test-quality notes. Things you could not verify.
Be precise; don't report style nits as defects. Never paste secrets or tokens into the report.
