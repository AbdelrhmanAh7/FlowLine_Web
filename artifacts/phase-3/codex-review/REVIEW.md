# Flowline Phase 3 independent review

**Revision reviewed:** `a8cef39f38e0500e6854d08cd38f9662863443c9` (`codex-p3`). Product code was not changed or committed. The two new `codex-poc-*` tests below intentionally fail until fixed.

## Read and run

Read `AGENTS.md` (instructions supplied with the task), the Phase 3 rows of `SCOPE_MATRIX.md`, `docs/implementation/PHASE-3-PLAN.md`, and `docs/implementation/TEST_PLAN.md`; scanned all new API route entrypoints for access and capability checks. Traced `src/server/{access,permissions,http,members,apikeys,rate-limit,agents,approvals,knowledge,copilot,flows,publish,connections,runs,usage,entitlements,sso,oidc,egress,audit,redact}.ts`, `worker/{agent-runner,runner}.ts`, `src/ai/chat.ts`, `src/billing/{service,stripe}.ts`, the Phase 3 integration tests, and `e2e/phase3.spec.ts`. This was a code and targeted test review, not browser QA.

| Command | Result |
| --- | --- |
| `node scripts/with-env.mjs .env.test npx vitest run --project integration p3-` | 8 files, 68 tests passed |
| `pnpm test:contract` | 15 files, 95 tests passed |
| `pnpm typecheck` | passed |
| `pnpm exec eslint tests/unit/codex-poc-egress-redirect.test.ts tests/integration/codex-poc-agent-approval-republish.test.ts` | passed |
| `pnpm test -- tests/unit/codex-poc-egress-redirect.test.ts` | 1 test failed as intended: cross-origin target received the POST body |
| `node scripts/with-env.mjs .env.test npx vitest run --project integration tests/integration/codex-poc-agent-approval-republish.test.ts` | 1 test failed as intended: `checkGate` returned `approved` after republish; expected a new pending approval |

## Findings

| ID | Severity | Area and location | Concrete failure / evidence | Suggested fix |
| --- | --- | --- | --- | --- |
| CX3-01 | High | SSO account linking, `src/server/sso.ts:125`, `src/server/sso.ts:390-400` | Changing issuer/client ID clears verification, but the account link remains keyed only by `sso:<workspaceId>` and `sub`. The callback looks up that link **before** its existing-email protection. A workspace owner who replaces the IdP with one they control and can assert a linked subject can receive a session for the linked user's global account, including that user's other workspaces. The old issuer is absent from the link lookup. | Bind links to an immutable IdP identity (issuer and client ID, or a configuration generation). On configuration identity change, require explicit relinking by the signed-in account holder; reject old links. Add an issuer-rotation takeover test. |
| CX3-02 | High | Agent ASK approval, `worker/agent-runner.ts:153-179`, `worker/agent-runner.ts:263-290` | The gate includes workflow ID, input, and connection IDs, but omits the workflow's `publishedVersionId`. A workflow can be republished with different actions and the same connections while an agent waits; resumption reuses the earlier approval and `enqueueRunEx` pins the new publication (`src/server/runs.ts:87-92`). `tests/integration/codex-poc-agent-approval-republish.test.ts` fails: expected `pending`, received `approved` after republish. | Include the exact published flow version in the approval binding and enqueue that approved version atomically, or invalidate and re-request approval if publication changes. |
| CX3-03 | High | Outbound credential handling, `src/server/egress.ts:172-189` | `safeFetch` strips credential **headers** on a cross-origin redirect but retains a POST body for HTTP 307/308. OAuth token requests put client secrets and refresh tokens in that body (`src/server/connections.ts:310-317`; SSO does likewise at `src/server/sso.ts:320-338`). A redirect from an endpoint sends them to the new origin. `tests/unit/codex-poc-egress-redirect.test.ts` fails: the second origin received the form body. | Refuse cross-origin redirects for requests with a body or sensitive credentials. Prefer refusing redirects entirely for token exchanges; do not attempt to sanitize form bodies. |
| CX3-04 | Medium | Usage reconciliation, `src/billing/service.ts:339-354` | Reconciliation records one report for the whole month and then skips all later calls for that month. If an owner reconciles on day 5, usage accrued afterward is never sent to the provider even though `ledgerTotals` increases. Existing test only repeats reconciliation without adding new usage. | Report monotonic deltas with distinct provider identifiers, or reconcile only a closed billing period and prevent an early report from marking it final. Test additional usage after the first report. |
| CX3-05 | Medium | Billing event ordering, `src/billing/service.ts:233-237` | The stale-event check uses `<` against Stripe's second-resolution event creation time. Two different events in the same second pass in either delivery order. For example, an older subscription update delivered after a cancellation in that second can set status back to active and restore entitlements. The existing out-of-order test uses a strictly earlier second. | Define an ordering/reconciliation policy for equal timestamps (for example, fetch canonical subscription state before entitlement changes), and test same-second update/delete deliveries. |
| CX3-06 | Medium | Agent cost limit, `worker/agent-runner.ts:184-187`, `worker/agent-runner.ts:243-245`, `worker/agent-runner.ts:357-361` | A priced `agent_step` is reserved and settled but never added to the local `costMicros`; `maxCostMicros` checks only the model-call accumulator. An agent configured with a low hard cost limit can make priced tool calls beyond that limit; its displayed run cost also omits them. Workspace monthly budget still applies separately. | Include each settled tool-step cost in `costMicros`, check the agent cap before execution, and cover a priced tool with a near-zero cap. |
| CX3-07 | Medium | Knowledge upload memory limit, `src/app/api/workspaces/[wid]/knowledge/route.ts:21-29` | When `Content-Length` is missing or false, multipart `req.formData()` buffers the full request before the `File.size` limit runs. A very large chunked upload can exhaust web-process memory despite the advertised 5 MB limit. | Enforce a streaming request-body byte cap before multipart parsing, including chunked transfer, and test an over-limit request without `Content-Length`. |

## Security checklist (p3 §18)

| Item | Review status |
| --- | --- |
| Tenant isolation / IDOR for agent, agent run, knowledge, proposal, key, invite, billing, audit and SSO routes | checked, no issue in route guard and workspace-filter review; not every route/role pair was dynamically exercised |
| Private credential isolation through agents, keys, shared copies and restore | checked, no issue in `getRuntimeCredentials`, publish, copy and restore paths |
| API key scopes, expiry, revocation and creator-role downgrade | checked, no issue for new requests; mid-run key revocation not exercised |
| Role enforcement | checked, no issue in inspected route guards and matrix; full capability × role API matrix remains untested |
| XSS in model, knowledge, audit, invite and SSO error rendering | checked, no issue in static sink and React rendering review; browser payloads not run |
| CSRF on cookie-auth unsafe methods | checked, no issue in `route`/`assertSameOrigin` and existing integration test |
| SSRF in SSO, AI and outbound requests | finding CX3-03 (cross-origin redirect forwards credential body); no internal-address bypass found |
| Billing webhook signature, replay and ordering | finding CX3-05 (same-second event ordering); signature, tolerance and dedupe checked |
| Upload limits and types | finding CX3-07 (multipart body buffered before limit); stored-file type and size checks reviewed |
| Worker permissions | checked, no issue in inspected membership rechecks |
| Knowledge ACL, including revoked access | checked, no issue in same-query workspace, status and agent allow-list filters |
| Prompt injection and tool boundary | finding CX3-02 (approved workflow behavior can change); tool-name/workspace decision checks otherwise held |
| Unauthorized tool calls | checked, no issue in unknown/denied tool decision path |
| Stale, expired or replayed approval; changed args/connection | finding CX3-02 (published revision omitted); args, connections, expiry and approver role checked |
| Revoked connection mid-run | checked, no issue in status checks at credential use; concurrent revoke between check and outbound request not exercised |
| Usage/limit bypass, concurrency and retries | finding CX3-06 (agent tool cost cap); workspace budget and execution-limit locks reviewed |
| Double billing | checked, no confirmed double-charge path in ledger idempotency review; provider-call crash window not fault-injected |
| Duplicate `run_workflow` side effects after retry/recovery | checked, no issue in `triggerRef` dedupe; crash between enqueue and state persistence not injected |
| Secret leakage in logs, audit, evidence and API responses | finding CX3-03 (outbound secret leak); log/API redaction and projections reviewed |
| SSO account linking/takeover | finding CX3-01 (link survives issuer change) |

## Test-quality notes and limits

- `tests/integration/p3-agents.test.ts:170-205` checks changed tool arguments but never changes the workflow publication between ASK and approval. The new PoC covers that gap.
- `tests/integration/p3-agents.test.ts:250-252` returns early if its fake-credential workflow fails to publish. That makes the claimed revoked-credential assertion pass without running. Use a valid fake connection and assert publication succeeded before revoking it.
- `tests/integration/p3-sso.test.ts:183-220` covers email collision and normal linking but does not rotate an issuer or client ID after an account is linked.
- `tests/integration/p3-billing.test.ts:178-191` checks only strictly older webhook timestamps; its reconciliation test does not add usage after the first report.
- `tests/unit/egress.test.ts` checks internal redirect blocking but not a permitted cross-origin 307/308 carrying a sensitive body.
- `src/server/rate-limit.ts` keeps run-rate counters in process memory. I did not verify the release topology; multiple web instances would each permit 30 starts per minute for the same key/user.
- This review did not run E2E, start the web servers, test a live IdP or payment provider, or verify deployment and multi-instance behavior. The requested independent browser QA is a separate activity.
