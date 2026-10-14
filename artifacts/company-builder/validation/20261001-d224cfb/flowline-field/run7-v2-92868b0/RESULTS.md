# Field run 7 — packet.v2.json, current scorer (independent reproduction of the #142 record)

**Candidate:** `92868b0` (branch `ai/142`, head at run time; the field harness and everything it imports — `field.spec.ts`, `field.config.ts`, `e2e/helpers.ts`, `e2e/stack.ts`, `tests/helpers/`, `src/company-builder/packs/customer-follow-up.ts` — is byte-identical to the run-6 candidate `a646eaf`; `git diff a646eaf..HEAD` on that surface is empty)
**Packet:** `packet.v2.json`, sha256 `3684c632fafa91e116f4095be8f37420041f15b43003c9c02910adfefb5ac11e` (matches `packet/SHA256SUMS`)
**Run ID:** `run7-v2-92868b0` · **Run at (UTC):** `2026-10-14T00:32:41.285Z`
**Command:** `FIELD_RUN=run7-v2-92868b0 PACKET=packet.v2.json FIELD_SERVICES=slash npx playwright test -c artifacts/company-builder/validation/20261001-d224cfb/flowline-field/field.config.ts --workers=1` (1 passed, 13.9 s)
**Environment:** isolated test stack `FLOWLINE_TEST_DB=flowline_test_142 FLOWLINE_BETA_MODE=open pnpm dev:test` (`next dev` on :3100, worker, fake providers :4010 and fake AI :4011; no real model), `/api/health?require=worker` = 200 (`db: ok`, `worker: ok`) before the run. `.env.test` was a fresh disposable copy of `.github/ci/env.test.template` (fresh fake secrets; git-ignored). Database: the machine's Homebrew **PostgreSQL 16.15** on :5432, database `flowline_test_142` dropped and recreated empty before the run (a version deviation from CI's Postgres 17, as in run 6).

## Score: 8/10

| ID | Passed | Failed checks | Reply / hand-off (short) |
|---|---|---|---|
| VP-01 | true | — | quotes the deep-cleaning price |
| VP-02 | true | — | asks for date and phone, no invented price |
| VP-03 | **false** | `closedDay` | Arabic greeting + "Office cleaning starts at 900 EGP per visit." + generic closing; no working-hours line for the Friday (2026-10-09) request |
| VP-04 | true | — | confirmation |
| VP-05 | true | — | `ownerDecision` = true: "The business owner decides this refund or cancellation request. Nothing has been refunded or cancelled." |
| VP-06 | **false** | `noPromise:cancelled` | `ownerDecision` = true (same owner sentence); fails only the pre-existing VF-02 fixture ambiguity ("cancelled" is in the approved policy line) |
| VP-07 | true | — | hand-off `complaint_needs_person` |
| VP-08 | true | — | quotes the working-hours line |
| VP-09 | true | — | hand-off `no_approved_information` |
| VP-10 | true | — | hand-off `empty_request` |

Flowline's own verdict disagreements: none. Review gate: no outbox entry before approval (`outboxBefore` = `outboxAfterRequestNoApproval` = 0), refund item `pending` / `refund_or_cancellation`. FC-3 (changed office price → new plan version 2, `review_required`): VP-03 quotes 950 EGP, not 900 EGP.

## What this shows for #142 (both gaps, live on the current head)
- **`packet.json:41` (VP-03, Friday):** the harness scores a Friday service confirmation without the approved working-hours line as a **failure** (`closedDay` = false). Under v1 the same reply passed. The reply does quote the price line, so VF-05 did not reproduce (second consecutive run agreeing with run 6).
- **`packet.json:44` (VP-05/VP-06, owner decision):** replies whose own text names the owner as decider ("The business owner decides this refund or cancellation request.") pass `ownerDecision`. The other direction — replies without owner-decision wording score as failures — is pinned offline by the committed unit tests `tests/unit/field-scoring.test.ts` (generic "A member of our team will review…" note fails; the committed run-4 replies re-score `ownerDecision` = false for VP-05/VP-06 and `closedDay` = false for VP-03; 25/25 tests pass on this head).

## Why this run exists
Run 6 (`run6-v2-a646eaf`) recorded the same outcome, but QA review could not accept a run it could not re-verify. This run 7 is an independent, first-hand reproduction on the current head with a fresh empty database: identical score (8/10) and identical per-VP pattern (VP-03 fails `closedDay`; VP-05/VP-06 pass `ownerDecision`; VP-06 fails only `noPromise:cancelled`). Runs 1–6 are untouched; the v1 packet files are unchanged (checksums verified below).

## Integrity
`shasum -a 256 -c SHA256SUMS` and `-c SHA256SUMS.derived` in `packet/`: all OK (v1 and v2). `git diff` of the three v1 files and of runs 1–4 against `main` is empty.

## Not committed
`results.json` and the two screenshots (`01-plan-en.png`, `02-latest-result-en.png`) stay local / attached to the PR (AGENTS.md evidence rule; `.gitignore` admits only `artifacts/**/*.md`).
