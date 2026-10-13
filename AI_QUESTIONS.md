# Questions for #158 (blocking)

Issue #158 is GitHub housekeeping, not code: create a sub-issue, link it to the original, close the original as superseded. This implementer could do none of those three steps, so no code was written.

## Why it is blocked

1. `gh` is refused by the hub shim: `gh budget: bucket at its floor (graphql 296 left, floor 15%)` on `gh issue view 158` and `gh issue view 30` (2026-10-13).
2. The hub's issue freeze (`providers.json scope.freezeIssues`) makes `gh issue create` fail, so the sub-issue could not be filed even with budget.
3. Parent #30 is an owner-tracking issue (money, legal, people). AGENTS.md says only the owner closes such issues (`Refs #N`, never `Closes #N`). Constitution article 1 also needs a recorded reason, risk and verification at the moment of any close.
4. The brief says "close the original as superseded". It does not say whether "original" is #30 or #158. Closing #30 would drop the owner's open checklist while PP-02, PP-03, PP-04, PP-05, PP-07 and PP-08 are still unfinished.

## Overlap the CTO should know about

- #162 "Owner Actions - Sensitive Components (tracking)" already exists and its tracking doc merged in PR #185 (`docs/implementation/OWNER_ACTIONS.md`, "Issue #162"). PP-06 has a draft runbook, `docs/runbooks/restore-rollback-alerts.md`, merged in PR #79.
- The prep note's test plan (a `/api/owner-actions` mock endpoint and an `OwnerActionsUI` page) conflicts with the project rule "Honesty in UI: no fake success, metrics, pricing, connections". A mock page with live-looking PP-02..PP-09 buttons would break it. Any mockup should be a read-only checklist or a disabled control with `disabledReason`. I recommend types and contract stubs only, no route.

## Decisions needed

- Is "original" #30 or #158? Recommendation: leave #30 open (owner-only) and close #158 once the sub-issue exists.
- Who files the sub-issue once the freeze lifts? The draft text is below.

## Draft sub-issue (ready to file)

Title: Prepare non-sensitive scaffolding for Owner Actions

Body:

Part of #30 (refs only; the owner keeps #30 open). Supersedes #158.

Scope (only these):
- TypeScript types for the PP-02..PP-09 checklist rows (id, title, status `pending|done|blocked`, blockedBy `money|legal|people`). No payloads and no secrets.
- A read-only mockup of the checklist, or disabled controls with `Button disabledReason`, with identical keys in `messages/ar.json` and `messages/en.json`.
- Contract stub for a read-only status shape. No route that mutates anything.
- Unit and integration test placeholders for the above.

Out of scope: payments, pricing, legal terms, credentials, user contact, any real provider call, production deployment.

Acceptance: types compile (`pnpm typecheck`); unit tests cover the status rows; docs updated (`docs/implementation/OWNER_ACTIONS.md`); an e2e-army test is added only if a user-visible page is added.
