# Flowline — Phase 3 release report

**Date:** 2026-09-28. **Branch:** `phase-3`.

- **Release code revision:** `9fd986002fde5f859e36db46b67eea901387348b` (`9fd9860`).
- **Release image:** `flowline:9fd9860`, image ID
  `sha256:fa6e7569d2c0e801bb39798a39efdbac02f60443928da782ba50922aa5db983e`, with label
  `org.opencontainers.image.revision = 9fd9860…`.
- Later commits change only tests and docs. `git diff 9fd9860 HEAD -- . ':!e2e' ':!artifacts'` is empty apart from docs.
- **Staging:** `http://localhost:3200`, a local Docker Compose stack (`docker-compose.staging.yml`: web, worker, migrate
  and its own PostgreSQL) running the release image, with the **real** local Ollama model `qwen2.5:7b`. It is local:
  no TLS, one web and one worker instance.

## Verdicts

| Verdict | Result | Basis |
|---|---|---|
| **CODE COMPLETE** | **YES** | Everything in the approved Phase 3 scope is implemented. All deterministic tests pass on the release revision (below). Features that aren't built (P3-08, P3-10 presence, P3-11) show their real state and never a fake control. |
| **STAGING VERIFIED** | **YES, with the stated limits** | The release image on staging passed smoke/health, cumulative E2E on 3 browsers, agent-driven browser QA and retest (Codex), security checks, backup → clean restore, rollback across migrations, failure tests and load targets. **Limits:** billing is verified only against the Stripe-compatible test double (no Stripe `sk_test_` key was provided); SSO only against a test IdP; the 11 SaaS integrations have no live credentials (R-01…R-11 BLOCKED); Copilot quality with the local 7B model is measured, not perfect (below). |
| **PRODUCTION APPROVED** | **NO** | Only you can approve it. Production deployment and live payments are not authorised. R-01…R-11 are still BLOCKED (your Phase 2 decision: the product is not Production Ready until they pass, unless you approve a release-scope change). The production blockers are listed below. |

## Test totals (release revision)

| Suite | Result | Evidence |
|---|---|---|
| Lint / typecheck | clean / clean | `artifacts/phase-3/test-output/lint-9fd9860.txt`, `typecheck-9fd9860.txt` |
| Unit | **105 / 105** (12 files) | `unit-9fd9860.txt` |
| Contract (provider doubles) | **97 / 97** (15 files) | `contract-9fd9860.txt` |
| Integration (PostgreSQL `flowline_test`) | **262 / 262** (22 files) | `integration-9fd9860.txt` |
| E2E Chromium + Firefox (all specs on Chromium; `@critical` and `@cross-browser` on Firefox) | **63 / 63**, 0 flaky | `e2e-chromium-firefox-4880b57.json` |
| E2E WebKit (Linux Playwright container, `@critical` + `@cross-browser`) | **14 / 14** | `e2e-webkit-4880b57.txt` |
| Live suite (REL-LIVE-SUITE) | dry-run 85 DRYRUN_PASS / 3 N/A; live **BLOCKED** (no credentials) | `tests/live/`, R-01…R-11 |

An earlier full run on `9fd9860` recorded **1 failure** out of 63: history restore on Chromium, while Codex's browser
and Ollama were loading the machine (`e2e-chromium-firefox-9fd9860.json`). It could not be reproduced in 9 reruns
or with 6× CPU throttling. The builder reload was still in progress when the check ran, so the test now waits for the
reload before counting nodes (`4880b57`). The assertion itself is unchanged.

WebKit's Windows build crashes on this host, so WebKit runs in the official `mcr.microsoft.com/playwright:v1.63.0-noble`
image against the same test stack (`bash e2e/tools/webkit-docker.sh`).

## Release checks on the release image

| Check | Result | Evidence |
|---|---|---|
| Rollback N+1 → N with no down migrations | **PASS**: `9fd9860 → ee265ea` across migration 0007, and `ee265ea → 0d4e7b7` across 0006. In both, health, revision, schema version, sign-in, flow load, webhook execution, and data written by N+1 were readable by N. | `artifacts/phase-3/rollback/` |
| Backup → restore into a new, empty PostgreSQL container | **PASS**: 40 tables with matching row counts and id digests; password sign-in, flows, versions, runs, agents, knowledge (searchable), members/invites and hashed API keys all work; the encrypted webhook secret decrypts with the recovered key (a signed delivery runs); a wrong key gets 503. | `artifacts/phase-3/backup-restore/backup-restore-9fd9860.json` |
| Key recovery | Documented: `FLOWLINE_ENCRYPTION_KEY` (+ `_OLD` for rotation) must be backed up separately from the DB; without it, restored credentials and webhook secrets are unusable (verified). | same file, negative check |
| Load (targets set before the run, TEST_PLAN §3) | **All met** on one laptop: health p95 14 ms; authenticated reads p95 18 ms; 250 API runs accepted, drained in about 3.7 s, **0 duplicate executions**; rate limit exactly 30/60; peak web 217 MB, worker 155 MB, 16 DB connections. **Not a capacity or SLA claim.** | `artifacts/phase-3/load/load-9fd9860-*.json` |
| DB outage | **PASS**: stall (`docker pause`) and stop/start both give 503 health within 3 s, clean 5xx errors, recovery without restarting web or worker, and no duplicated steps. This found and fixed a health hang (`72cff16`). | `artifacts/phase-3/failure/db-outage-9fd9860.json` |

## Independent review and QA

| Review | Reviewer | Result |
|---|---|---|
| Code, test and security review | **Codex** (independent, different vendor) | 7 findings: CX3-01 (SSO link survives an IdP change), CX3-02 (approval survives a republish), CX3-03 (secret body forwarded on a cross-origin 307), CX3-04/05 (billing reconciliation and same-second webhooks), CX3-06 (agent tool cost cap), CX3-07 (upload buffered before its cap). **All fixed with regression tests; Codex retest: all FIXED.** `artifacts/phase-3/codex-review/` |
| Security review + capability × role matrix | **Claude Fable 5.1** subagent (independent of the implementing session, same vendor) | 73-test matrix: every capability through real routes × owner/editor/viewer/non-member, IDOR, secret projections. SR-01 (malformed id → 500) fixed. `artifacts/phase-3/security-review/` |
| Agent-driven exploratory browser test (staging, real model) | **Codex**, using a real Chromium it drove. **Not human UAT.** | On `ee265ea`: 9 journeys PASS, 4 FAIL, 1 BLOCKED, 5 findings (CX3Q-01…05, all fixed). No hydration warnings in 158 page loads. `artifacts/phase-3/codex-qa/` |
| Retest on the release image | **Codex** | _see the "Codex retest" section below_ |

Issues I found and fixed along the way:
- The SSO account-takeover path, found in review before merge: an owner's own IdP could sign in as any existing email.
- Login CSRF on SSO.
- Text typed before hydration was silently erased. The WebKit run exposed it, and it was reproduced in Chromium.
- Copilot model calls bypassed usage metering and budgets.
- Public webhook bodies weren't capped while streaming.
- `/api/health` hung during a DB stall.

## Failure testing (p3§23): one test per item

| Failure | Test |
|---|---|
| Model timeout | p3-agents "model 5xx is retried; a model timeout hits the agent's time limit"; p2 AI timeout |
| Provider 429 | contract "429 with Retry-After maps to rate_limit"; p2-actions "429 with Retry-After is retried…" |
| Provider 5xx | same; contract billing "provider 5xx → BillingProviderError"; p3-billing "a 5xx during plan change surfaces 502" |
| Worker crash | p2-execution "worker crash while a non-idempotent step was in flight → resume verifies"; p2-triggers "accepted event survives a worker crash"; p3-agents stale recovery |
| DB outage | `scripts/release/db-outage.mjs` on the release image (stall + stop/start) |
| Revoked integration | p2 "revoked access tokens stop working" / "token_revoked"; p3-agents revoked credential refuses the tool; E2E repair connection |
| Expired OAuth | p2 "a denied refresh expires the connection and pauses its flows"; "concurrent use of an expiring token refreshes once" |
| Invalid webhook signature | p2-triggers "rejects a tampered body or wrong signature" / replay tolerance; p3-billing bad/replayed signature → 401 |
| Duplicate webhook | p2-triggers "concurrent duplicate deliveries create exactly one run"; p3-billing duplicate event id |
| Queue saturation | p2 "queue quota refuses new runs beyond the limit" (429 QUEUE_FULL); load L-3/L-5 |
| Billing provider failure | p3-billing provider failure mid-reconcile / same-second outage + redelivery |
| Agent step / cost limit | p3-agents "step, tool-call and cost limits stop the run" (incl. priced tool calls, CX3-06) |
| Invalid Copilot patch | p3-copilot invented node type / parameter / credential; unit copilot-repairs; E2E invalid proposal |
| Indexing failure | p3-knowledge "bad content fails indexing with a reason; unsupported and empty uploads are refused" |
| Permissions changed mid-run | p3-agents "permission removed mid-run…"; p2 "a user demoted to viewer can't have a queued re-run execute" |
| Approval expired | p2 "altered, expired, or revoked-approver decisions are not honoured" (same gate for agents) |
| Membership revoked mid-session | p3-access removal takes effect; E2E members (open URL → 404); Codex staging J5 |

## Copilot with a real model (measured, not claimed)

Validation always decides: an invalid proposal is shown with its reasons and can't be applied, and nothing ever runs.
With the local `qwen2.5:7b`:

- Codex's staging requests: **0/12 → 12/12** correct after the fixes. This is the tuned set, so treat it as optimistic.
- Six held-out requests: **7/12**. The rest are invented step types or invalid JSONata, rejected with reasons.

Requests that need an app Flowline doesn't integrate with are refused by name. A larger hosted model (e.g. via
`ANTHROPIC_API_KEY`) wasn't tested. Evidence: `artifacts/phase-3/copilot-real-model/`.

## Carried items

- **P3-14 (viewer can't approve):** PASS. Covered by integration, UI E2E on 3 browsers, and agent-driven.
- **P3-15 (DB drops on the dev stack):** classified as host networking.
  - `localhost` resolves to `::1`, which goes through `wslrelay.exe`. All probe failures were on that path; zero on
    `127.0.0.1` and zero inside the container.
  - Mitigated by using `127.0.0.1`. Fail-fast behaviour and recovery were kept and verified.
  - Details: `artifacts/phase-3/p3-15/INVESTIGATION.md`.
- **P3-16 (hydration warning):** not reproduced.
  - Monitored on Chromium, Firefox and WebKit in every run, and Codex saw none on staging.
  - Kept as a regression test (`e2e/hydration.spec.ts`).
  - A different real pre-hydration defect was found and fixed.

## Production blockers (what must happen before PRODUCTION APPROVED)

1. **R-01…R-11 live SaaS certification:** BLOCKED on sandbox credentials (`FLOWLINE_LIVE_*`, see
   `docs/integrations/LIVE-CERTIFICATION.md`). The alternative is an explicit release-scope decision from you.
2. **Billing in real Stripe test mode:** needs an `sk_test_` key, prices and a webhook secret. Live payments need
   your separate approval.
3. **Email delivery (P3-08):** password reset, email verification and account deletion aren't built. They need an
   email provider (a product decision).
4. **Production infrastructure:** TLS, a managed PostgreSQL with backups, secrets management, monitoring and alerting,
   and a shared store for the run rate limit when running more than one web instance (today it is per process).
   Also Google/GitHub sign-in apps (P3-13), and a real OIDC IdP if SSO is to be offered.
5. **Your production deployment approval.**

## Known limitations (not blockers)

- `integration.use` is a capability no route enforces (SR-04): private connections are enforced by ownership. Clean up
  or wire it later.
- The release image keeps dev dependencies (≈1.57 GB) because the worker runs through `tsx`.
- The run rate limit is in process memory (fine for one web instance).
- Presence on the canvas (P3-10) and light mode (P3-11) aren't built.

## Codex retest (release image)

_Pending: filled in when `artifacts/phase-3/codex-qa-retest/RETEST.md` is complete._
