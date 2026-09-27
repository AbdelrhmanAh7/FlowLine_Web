# Phase 3 plan — agents, knowledge, copilot, collaboration, billing, release

Entry gate (2026-09-28): HEAD `7104c25` (Phase 2 decision commit), clean tree, no product-code changes since the tested baseline `bee4390`. Smoke/regression on `7104c25`: lint ✓, typecheck ✓, unit 80/80, contract 82/82, integration 110/110, E2E smoke 15/15 (journey, tenancy, canvas, phase2). Evidence: `artifacts/phase-3/entry-gate/`. Branch: `phase-3`.

The Phase 2 execution engine (queue, leases, versions, approvals, usage ledger, egress) is kept. Phase 3 builds on it and does not add a parallel execution path.

## Architecture decisions

| Area | Decision |
|---|---|
| Permissions | One capability matrix (`src/server/permissions.ts`): role → capabilities (view/edit/run/publish/share flow, approve, manage integrations/members/API keys/billing, view audit). Every route checks a capability, not a raw role. Principals are either users (session) or API keys (workspace-bound, scoped); keys never inherit more than their scopes and never approve. |
| Members | `workspace_invite`: random token, only a SHA-256 hash stored, bound to an email, role, 7-day expiry, single use, revocable. There is no email delivery in this environment, so the owner copies the invite link (the UI says so). Accepting needs a signed-in user with the invited email. Removal/role changes take effect on the next request (membership is checked per request), and queued runs re-check the acting user at claim (Phase 2). The last owner can't be removed or demoted. |
| Audit | `audit_event` (workspace, actor user/key, action, target, redacted data, time). Written in the same transaction as the change where possible. Owner-only view. |
| API keys | `fl_test_…` / `fl_live_…` with a 32-byte random secret; only a SHA-256 hash and a display prefix are stored; one-time reveal; scopes (`flows:read`, `runs:read`, `runs:write`, `agents:run`); optional expiry; `last_used_at`; revoke. Live keys run **published** versions only; test keys may run the current draft (still pinned to an immutable version snapshot). |
| Invocation API | `/api/v1/…` authenticated with API keys only (no cookies → no CSRF surface). Per-key rate limit, zod payload validation, `Idempotency-Key` support, returns the execution id, status endpoint. No anonymous execution. |
| Usage | The Phase 2 ledger is extended with kinds `execution`, `agent_step` and flags `billable`/`retry`. Monthly execution limit and usage cap are enforced at enqueue/reservation; estimates and actuals are shown separately. |
| Knowledge | `knowledge_source` + `knowledge_chunk`. Indexing runs in the worker (pending → indexing → ready / failed with reason). Formats: txt, md, csv (row-aware), json, pdf (sandboxed extraction). Retrieval = PostgreSQL full-text search (`websearch_to_tsquery`, `ts_rank_cd`), scoped by workspace + the agent's allowed sources, and it re-reads the ACL on every query (no cache). Results carry source id/name, chunk ordinal, citation label and score. No embeddings model is claimed. |
| Agents | `agent` + immutable `agent_version` (instructions, provider/model, tools with ALLOW/ASK/DENY, workflows, knowledge sources, limits: steps, tool calls, cost, timeout) + conversations/messages + `agent_run` / `agent_step`. Runs are claimed by the worker with the same lease/heartbeat model. Tools: `knowledge_search`, `workflow_inspect`, and `run_workflow` (published workflows only, enqueued through the **existing engine** as normal pinned runs, so all Phase 2 gates apply: connections, approvals, usage, events, rate limits). Consequential effects exist only inside workflows — no second path to app actions. |
| Tool permissions | Enforced in the worker before a tool executes: DENY → refused step; ASK → an approval bound to agent run + agent version + tool + canonical args + connection set + approver + expiry (same hash scheme as Phase 2). Changed args invalidate it. Viewers and API keys can't approve. The model's text can't change a decision. |
| Copilot | NL request → AI returns a typed **patch** (JSON schema) → server validates against the node registry, action registry, config rules and the workspace's real connections → applied to a copy → full graph validation → proposal stored with a diff (added/changed/removed) → the user approves (removals need explicit confirmation) → saved as a draft revision with conflict detection. Never runs anything. Invented node types, tools, parameters, credentials or integrations make the proposal invalid, with reasons. |
| Versions / sharing | Version history panel (inspect, restore as draft, publish = rollback); runs keep their version graph. Connections gain `visibility` (`workspace` / `private` to their creator); a private connection can only run for its owner. Sharing a flow copies it to another workspace the user belongs to, with connection references cleared. |
| Billing | `PaymentAdapter` interface; a Stripe **test-mode** adapter (refuses non-test keys) plus a Stripe-compatible test double. Plans come from configuration (`FLOWLINE_BILLING_PLANS`), with nothing from the deck's example prices. Subscriptions and billing events are stored; webhooks are verified (Stripe-Signature, tolerance, replay), deduplicated by event id, applied in order (`created`), and unknown customers are recorded and ignored. Usage reconciliation reports the ledger with idempotent meter events. |
| SSO | OIDC abstraction with per-workspace configuration, tested against an OIDC test double (discovery, JWKS, id_token checks). Shown as "not configured" unless configured and tested; not claimed for production. |
| Release | Multi-stage Docker image (web + worker) tagged by SHA with a recorded digest; local **staging** stack runs the image; backup = `pg_dump` custom format + restore into a clean Postgres container + verification script; rollback = run the previous image against the current DB (migrations are additive/expand-only, no destructive down migrations). Load test with targets in `TEST_PLAN.md`. Production deployment and live payments are **not** performed. |

## Order of work

1. Permissions matrix, members/invites, audit log, viewer approval (P3-18, P3-04, P3-14, P3-09 audit).
2. API keys, invocation API, usage/limits extension (P3-05, P3-21, P3-22).
3. Knowledge (P3-02).
4. Agents + tool permissions (P3-01, P3-17).
5. Copilot (P3-03).
6. Versioning, sharing, private connections (P3-20, P3-19).
7. Billing adapter + webhooks (P3-06, P3-23) — delegated to Kimi in a worktree.
8. SSO, default LLM provider (P3-09, P3-07).
9. REL-LIVE-SUITE (P3-25) — delegated to Kimi in a worktree.
10. Release engineering: image, staging, backup/restore, rollback, load, multi-browser (P3-27…P3-30); P3-15, P3-16.
11. QA: Fable security review; Codex code/test review and agent-driven exploratory browser testing; fixes; retest; final gates and RELEASE_REPORT (P3-26, P3-31…P3-33).

Helpers: ≤3 agents at once, separate worktrees, one browser session per agent, Ollama one model at a time.
