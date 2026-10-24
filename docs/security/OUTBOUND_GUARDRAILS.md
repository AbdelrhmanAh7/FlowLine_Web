# Outbound guardrails

**Issue:** #165 (Trend: Outbound guardrails: scoped node credentials, volume caps, approval gate)
**Status:** partial. Only the per-connection send cap is delivered; scoped node credentials and a volume-based approval gate are not.

| Part of the brief | State |
|---|---|
| Volume caps | Delivered as a per-connection, per-action cap (below) |
| Audit view | Delivered: `outbound_capped` appears in the run inspector's event log **and the audit log (Settings → Audit)** |
| Approval before high-volume broadcasts | Not delivered. Only the existing per-action `requireApproval` / `sensitive` approval exists. Threshold-based approval is a follow-up issue (CTO decision on #165) |
| Scoped node credentials | Not delivered. Connections stay workspace-scoped and cannot be limited to specific nodes |
| Per-destination caps | Not delivered (CTO decision: connection + action is enough for the first version) |

## How the send cap works

- `integration.action` nodes take an optional `maxSendsPerMinute` (`IntegrationActionConfig`, `src/engine/types.ts`).
- `validateGraph` (`src/engine/validate.ts`) rejects a value that is not an integer from 1 to 1000 with `INVALID_SEND_LIMIT`. The node editor (`src/components/builder/node-config.tsx`) clamps typed values to 1..1000 and removes the override when the field is emptied.
- The worker (`worker/handlers.ts`, `integrationAction`) caps actions whose `sideEffect` is not `none`. It calls `checkRate("outbound:<connection id>:<action id>", limit)`, a PostgreSQL sliding window (`src/server/rate-limit.ts`), so the limit is shared across worker instances.
- Limit used: an omitted or non-number `maxSendsPerMinute` falls back to 60; a number is floored and clamped into 1..1000 (so `0` or a negative number becomes 1, and `NaN`/`Infinity` fall back to 60).
- The key has no flow or node id on purpose: the cap protects the connection and action, so several nodes using the same connection and action share one budget and cannot multiply the allowed volume.
- The check runs after connection validation (`getRuntimeCredentials` returns `CONNECTION_WORKSPACE` for a connection of another workspace, `CONNECTION_MISSING` if absent) and after the approval gate. A step waiting for a human therefore uses no budget and a rejected connection never touches a counter.
- A refused send throws the retryable `SEND_RATE_LIMITED` and logs one `outbound_capped` run event with `action` and `limit` only (no payload, no destination).
- The run inspector (`src/app/w/[slug]/runs/inspector.tsx`) renders run events through `runEvent.<type>`; `outbound_capped` has labels in `src/i18n/messages/en.json` and `ar.json`.
- The audit log (`src/app/w/[slug]/settings/audit-log.tsx`) merges `outbound_capped` run events (fetched from `/api/workspaces/[wid]/audit/guardrails`) with audit events, showing them with the label "system (guardrail)" / "النظام (حاجز حماية)" in English/Arabic.
- The key is listed in the caller audit of [codeql-triage-hashing.md](codeql-triage-hashing.md).

## Open debt

1. **Per-destination caps.** Would need the destination (email address, Slack channel, …) in the key, e.g. `outbound:<connection id>:<action id>:<destination>`, plus a UI to choose destinations. Do it only if a customer needs limits such as "10 emails per contact per minute".
2. **Threshold-based approval.** "More than N sends per minute requires approval" is separate from the per-action approval flag; tracked as the follow-up to #165 the CTO asked for.
3. **Scoped node credentials.** Not started; needs a schema change (connection to node mapping) and a migration plan for existing connections.

## Tests

- `tests/unit/engine.test.ts`: `validateGraph` returns `INVALID_SEND_LIMIT` for 0, 1.5 and 1001, and not for 60 or undefined.
- `tests/integration/p2-actions.test.ts` (needs PostgreSQL; CI runs it):
  - a second send over a cap of 1 fails with `SEND_RATE_LIMITED` and logs exactly one `outbound_capped`;
  - a flow whose `maxSendsPerMinute` is out of range (0) is refused at enqueue with 422 `INVALID_FLOW` / `INVALID_SEND_LIMIT` (the worker clamp to 1..1000 is defence in depth for stored versions, and has no direct test);
  - a connection from another workspace fails with `CONNECTION_WORKSPACE` and logs no `outbound_capped`.
- `e2e-army/200-route-error-headers.e2e.ts`: request-level guard only (an anonymous run start is refused, tagged `@issue-165 AC1`). It does not exercise the cap, because the hub's throwaway stack has no seeded connection to send through; the cap is proven by the integration tests above.
- Audit log integration: `outbound_capped` events are fetched via `/api/workspaces/[wid]/audit/guardrails` and merged with audit events in the UI, with i18n labels.

## References

- Issue #165 and its CTO answers: [issue comments](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/165)
- Status ledger: [PHASE4_BETA_REPORT.md](../implementation/PHASE4_BETA_REPORT.md)
