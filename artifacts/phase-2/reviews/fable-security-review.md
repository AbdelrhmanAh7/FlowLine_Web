# Fable 5.1 — Phase 2 security & correctness review

- Reviewer: Claude Fable 5.1, read-only subagent (no file edits, no servers), on branch `phase-2` at `c2b7bd5`.
- Scope: egress/SSRF, credentials/OAuth, approvals, usage ledger, webhooks, runs/rerun, redaction, code and expression sandboxes, worker (leases, resume, retries, scheduler), test-only overrides, workspace isolation of every API route.
- Every finding below was fixed in `09c5a09` with a regression test; the tests were confirmed to **fail on the old code** and pass on the fix.

## Findings and fixes

| ID | Sev. | Finding (verified by the reviewer against the code path) | Fix | Regression test |
|---|---|---|---|---|
| H1 | High | Postgres SSRF: the egress check validated the URL host, but the raw connection string went to `pg`, whose query params (`?host=169.254.169.254`, `port=`, `socket:`) override it; pg also re-resolved DNS. | Reject extra params; resolve + validate once (`resolveAllowedAddress`); connect pg to that exact IP with explicit fields. | `int: p2-postgres` "the connection target is the validated address" (8) — old code dialled 169.254.169.254 |
| H2 | High | `postgres.query` (no approval) could write: simple protocol allowed `SELECT 1; COMMIT; DELETE …; COMMIT`. | Extended protocol (one statement) + server-side `default_transaction_read_only=on`; `execute` single-statement too. | `int: p2-postgres` stacked statements (5) — old code deleted rows |
| M1 | Medium | Non-idempotent `http.request` was blindly re-sent after a worker died mid-request. | Interrupted or lost-response non-idempotent HTTP → review gate bound to the request. | `int: p2-review-fixes` M1 (2) |
| M2 | Medium | Subflow/loop children re-executed non-idempotent actions after a crash (children not checkpointed; parent ids leaked into child `interrupted`). | Interrupted subflow/loop with side-effecting children → review; children get their own interrupted set. | `int: p2-review-fixes` M2 |
| M3 | Medium | Webhook replay: signature didn't cover the event id; GitHub scheme has no timestamp. | Sign `t.eventId.body`; GitHub signatures unique per endpoint (replay → 409). | `int: p2-review-fixes` M3 (2) |
| M4 | Medium | Resume fed redacted values (`[REDACTED]`) into later steps and broke approval bindings. | Encrypted unredacted step I/O (`run_step.data_enc`) for resume/rerun only; never returned by APIs. | `int: p2-review-fixes` M4 |
| L1 | Low | OAuth reconnect didn't check the connection's provider. | Checked at start and completion (`DIFFERENT_PROVIDER`). | `int: p2-review-fixes` L1 |
| L2 | Low | Zendesk subdomain / Snowflake URL unvalidated; `safeFetch` forwarded Authorization across cross-origin redirects. | Strict subdomain / `*.snowflakecomputing.com`; credential headers dropped on origin change. | `int: p2-review-fixes` L2 (2) |
| L3 | Low | Approval args re-evaluated each check; `$now()`/`$random()` could never match → endless re-request. | Refused in validation and at runtime for gated steps. | `int: p2-review-fixes` L3 |
| L4 | Low | `run.attempts` incremented on every claim, so approval resumes used up the worker-loss budget. | Counts only stale recoveries. | `int: p2-review-fixes` M4 (asserts attempts = 0), `int: runs` |
| L5 | Low | Snowflake read-only check relied on naive comment stripping. | `MULTI_STATEMENT_COUNT=1` pinned on every request. | contract: snowflake |
| L6 | Low | Content containing `</untrusted_content>` could break out of the AI framing. | Tags stripped; task restated after the content; instruction lines quarantined. | `unit: injection`; `live: ai-ollama` |

Additional fix found while implementing M1: a reviewer's **"retry"** decision was reusable, so a second lost response would have re-sent silently. It is now one-shot (`consumeRetry`) — `int: p2-review-fixes` "a reviewer's retry allows exactly one more attempt".

## Checked and found sound (reviewer summary)

Egress (normalised IP forms, IPv4-mapped/6to4/Teredo/NAT64/ULA/CGNAT blocked, validation inside the socket lookup, per-hop redirect validation, exact allowlist, caps); AES-256-GCM with rotation; single-use OAuth state + PKCE; refresh under row lock with commit-before-throw; approval binding/expiry/approver re-check; budget reservation under lock with idempotency; webhook timing-safe compare, tolerance, size cap, event+run in one transaction; dedupe and quotas under locks; rerun re-checks the acting user; Docker sandbox flags; heap-capped expression/PDF child; lease-guarded writes; bounded jittered retries; scheduler SKIP LOCKED + unique fires; test-only overrides gated on `FLOWLINE_ENV=test`; all 30 route handlers enforce membership and role; no secrets in console logs or events.
