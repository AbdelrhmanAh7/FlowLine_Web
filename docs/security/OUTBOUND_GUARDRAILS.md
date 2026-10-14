# Outbound Guardrails — Technical Debt

**Issue:** #165
**Status:** MVP complete (2026-10-13)
**Next:** Future enhancement

## Current Implementation

The outbound send cap is implemented per-connection and per-action (not per-destination). This is simpler and sufficient for MVP:

- **Per-connection cap:** `maxSendsPerMinute` configuration on the integration action node
- **Per-action cap:** Rate limit key includes `actionId`, so different actions on the same connection have separate limits
- **Counting:** Sends are counted after the approval gate, so steps waiting for human approval don't consume the budget

### Files Changed

- `worker/handlers.ts`: Rate limiting check with workspace validation and clamping before applying limits
- `src/server/rate-limit.ts`: `checkRate` function (unchanged, uses Redis with sliding window)
- `src/engine/types.ts`: `maxSendsPerMinute` field in node config schema
- `src/engine/validate.ts`: Graph validation for `maxSendsPerMinute` (integer 1..1000)
- `src/components/builder/node-config.tsx`: UI for configuring maxSendsPerMinute (integer clamp 1..1000, undefined on clear)
- `src/i18n/messages/en.json` / `ar.json`: i18n keys for the new field and event type

### Events Logged

- `outbound_capped`: Logged when a send is refused due to rate limit, with `action` and `limit` fields

## Technical Debt

### 1. Per-Destination Caps (Future Enhancement)

**Why it's not in MVP:** The current implementation (connection + action) is simpler and sufficient for MVP. Destination-based caps would require:

- Tracking per-destination send counts (e.g., per-email address, per-slack channel, per-slack channel)
- Maintaining a per-connection destination map in the rate limit key (e.g., `outbound:{connectionId}:{actionId}:{destination}`)
- Updating the rate limit check to validate against the destination-specific counter

**When to implement:** If the business requires stricter limits per-destination (e.g., "no more than 10 emails per contact per minute" or "no more than 5 messages per Slack channel per minute"), this enhancement should be added.

**Impact:** Medium complexity (additional destination tracking, UI for destination selection, rate limit key structure change)

### 2. Approval Gate for High-Volume Broadcasts (Issue #166)

**Why it's not in MVP:** The approval gate is tied to `requireApproval` and `sensitive` flags, which are per-action. A threshold-based approval gate (e.g., "more than 50 sends per minute requires approval") is a separate concern.

**When to implement:** If the business wants to automate approval for high-volume broadcasts (e.g., "any send that would exceed 50 sends per minute requires human approval"), this should be implemented in a separate issue (#166).

**Impact:** Low complexity (add threshold config, update approval check to include volume check)

### 3. Destination Selection UI (Future Enhancement)

**Why it's not in MVP:** The current UI allows configuring maxSendsPerMinute globally for the connection. If per-destination caps are implemented later, the UI will need to support selecting destinations and setting per-destination limits.

**When to implement:** When per-destination caps are implemented (see #1).

**Impact:** Medium complexity (UI changes, destination validation, config schema update)

## Security Considerations

### Current Validations

1. **Workspace validation:** The connection is validated to belong to the current workspace by `getRuntimeCredentials` before rate limiting is applied (see `src/server/connections.ts:241`)
2. **Policy check:** The integration action validates that the connectionId matches the run's permission policy (see `worker/handlers.ts:291-293`)
3. **Connection existence check:** Validated by `getRuntimeCredentials` which throws `CONNECTION_MISSING` if the connection doesn't exist (see `src/server/connections.ts:240`)
4. **Server-side validation & clamping:** `maxSendsPerMinute` is validated by `validateGraph` (integer 1..1000) and clamped in `worker/handlers.ts` to `1..1000` (defaults to 60 if omitted, negative, or invalid)

### Future Considerations

1. **Destination validation:** If per-destination caps are implemented, destinations should be validated against the connection's allowed destinations
2. **Rate limit key isolation:** Destination-based caps should use a unique rate limit key per destination to prevent cross-destination bypasses
3. **Audit trail:** Ensure that destination-specific caps are logged in the audit view with destination information

## Testing

### Current Tests

- `e2e-army/165-outbound-send-cap.e2e.ts`: Request-level guard test (anonymous callers can't start a run that would send outbound messages)
- `tests/integration/p2-actions.test.ts`:
  - Test for workspace validation before rate limiting (lines 382-398)
  - Test for per-connection send cap (lines 400-412)
  - Test for clamping non-integer and zero maxSendsPerMinute to at least 1 (lines 414-426)
- `tests/unit/engine.test.ts`:
  - Test for `validateGraph` checking `INVALID_SEND_LIMIT` for `maxSendsPerMinute` (integer 1..1000)

### Future Tests

- Per-destination cap tests (when implemented)
- Threshold-based approval gate tests (when implemented in #166)

## References

- **Issue:** #165 (Trend: Outbound guardrails: scoped node credentials, volume caps, approval gate)
- **CTO decisions:** See issue comments for CTO's answers on audit view, per-destination caps, node-config UI, and approval gate
- **Related docs:** `docs/implementation/PHASE4_BETA_REPORT.md` (if updated)
