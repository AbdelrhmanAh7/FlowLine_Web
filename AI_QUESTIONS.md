# Issue #198 — prerequisite and scope blocker (2026-10-14)

The CTO's instruction to resume **after #196 and #197 merge** still applies.
`gh pr view 259 --json state,mergedAt,headRefOid` returned OPEN,
`mergedAt: null`, head `876a7447ce8152a22c424a9788a495a7b57ac5ba`;
`gh pr view 261 --json state,mergedAt` returned OPEN, `mergedAt: null`.
Refreshed `origin/main` is `66cc279977a15b7c13646efdd6f08fe66f6d20ba`.

Previous merge `a5d8dad` imported #197 and #196 before their merge. This
explains QA's scope finding: the branch diff includes 15 files and 403
insertions. Those prerequisite files belong to the active #197 lane and
cannot be implemented or reviewed as part of #198. No prerequisite branch
was merged, pushed or rewritten in this attempt.

Please requeue after both prerequisite PRs merge, with the harness repairing
the branch onto reviewed main while preserving #198's test-first order.
Then retain the QR-only diff, extend the existing army test beyond its
wrong-password-only case, and validate QR rendering, shared URI, same-origin
requests, cancellation, confirmation and RTL bounds on an isolated stack.
The component is already present; the task is not complete.

The existing Playwright test also expects `dir="ltr"` on backup codes while
the previous implementation removed it. Reconcile against reviewed #197,
keeping credential text LTR as required by AGENTS.md.

`qrcode.react@4.2.0` is exact-pinned and its installed package declares React
19 compatibility. Its actual license is ISC (not MIT as the issue comment
states). No external QR service is used by the component.
