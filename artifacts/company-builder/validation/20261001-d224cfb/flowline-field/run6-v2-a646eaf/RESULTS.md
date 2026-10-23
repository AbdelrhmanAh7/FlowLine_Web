# Field run 6 — packet.v2.json, current scorer (#142 scoring record)

**Candidate:** `a646eaf` (branch `ai/142`; later commits on the branch change only Markdown)
**Packet:** `packet.v2.json`, sha256 `3684c632fafa91e116f4095be8f37420041f15b43003c9c02910adfefb5ac11e` (matches `packet/SHA256SUMS`)
**Run ID:** `run6-v2-a646eaf` · **Run at (UTC):** `2026-10-13T06:01:06.967Z`
**Command:** `FIELD_RUN=run6-v2-a646eaf PACKET=packet.v2.json FIELD_SERVICES=slash npx playwright test -c artifacts/company-builder/validation/20261001-d224cfb/flowline-field/field.config.ts --workers=1` (1 passed)
**Environment:** isolated test stack `FLOWLINE_TEST_DB=flowline_test_142 FLOWLINE_BETA_MODE=open pnpm dev:test` (`next dev` on :3100, worker, fake providers :4010 and fake AI :4011; no real model), `/api/health?require=worker` = 200 before the run. `.env.test` was a disposable copy of `.github/ci/env.test.template` with fresh secrets, deleted after the run. Database: a throwaway Homebrew **PostgreSQL 16.15** in `$TMPDIR` on :5544, stopped afterwards. CI and `docker-compose.yml` use Postgres 17; migrations and the run passed on 16, but this is a version deviation.

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

Flowline's own verdict disagreements: none. Review gate: no outbox entry before approval, refund item `pending` / `refund_or_cancellation`.

## What this shows for #142
- **`packet.json:41` (VP-03, Friday):** the shipped product's reply does not quote the working-hours line, and the harness scores it as a failure (`closedDay` = false). Under v1 the same kind of reply passed. The scorer's other rejections (date confirmed next to the hours line, Arabic digits, dotted dates) are pinned in `tests/unit/field-scoring.test.ts`.
- **`packet.json:44` (VP-05/VP-06, owner decision):** replies whose own text names the owner as decider pass; the run-4 replies (only "A member of our team will review…", owner wording only inside the quoted policy line) fail, re-scored offline by the unit test `re-scores the committed run-4 replies…`.

## Scorer fix found by this run
The first run-6 attempt on `63aa045` (same stack, same product, same packet) scored **7/10**: VP-05 and VP-06 failed `ownerDecision` although the reply says "The business owner decides this refund or cancellation request." (product text since #50). Root cause: `scoreOwnerDecision` accepted only the packet's two literal phrases. `a646eaf` adds `OWNER_DECIDER` (`tests/helpers/fieldScoring.ts`) for owner-decides sentences in the reply's own text; approved quotes are still stripped first and a non-owner decider (`TEAM_DECIDER`) still fails. Unit test: `passes the product's explicit owner-decision sentence (run 6 …)` (red on `63aa045`, green on `a646eaf`). This run on `a646eaf` is the record; the `63aa045` attempt is not kept as a separate run.

## Integrity
`shasum -a 256 -c SHA256SUMS` and `-c SHA256SUMS.derived` in `packet/`: all OK (v1 and v2). Runs 1–4 and the v1 packet files are unchanged against `main`.

## Not committed
`results.json` and the two screenshots (`01-plan-en.png`, `02-latest-result-en.png`) stay local / attached to the PR (AGENTS.md evidence rule).
