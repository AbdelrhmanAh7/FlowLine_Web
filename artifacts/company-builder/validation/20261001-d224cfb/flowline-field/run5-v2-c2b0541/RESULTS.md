# Field run 5 — packet.v2.json (scoring-gap fix #142)

> **Superseded by run 6** (`../run6-v2-a646eaf/RESULTS.md`, current scorer, 8/10). The VP-05/VP-06 `ownerDecision` values below are those of the `c2b0541` scorer, not the shipped one.

**Candidate (at time of run):** `c2b0541`  
**Packet:** `packet.v2.json`  
**Packet SHA256:** `3684c632fafa91e116f4095be8f37420041f15b43003c9c02910adfefb5ac11e`  
**Run ID:** `run5-v2-c2b0541`  
**Run at (UTC):** `2026-10-11T00:30:54.770Z`  
**Environment:** Isolated test stack (`FLOWLINE_TEST_DB=flowline_test_142`, `FLOWLINE_COMPANY_BUILDER=on`, `FLOWLINE_BETA_MODE=open`), port 3100, `next dev` test mode. The stack was healthy (`/api/health?require=worker` 200) at the start of the run.

**Harness:** `flowline-field/field.spec.ts` (read-only for this run except that the spec itself was the code change; old runs 1–4 unchanged). The spec reads `PACKET` (default `packet.json`) and records the packet file and its hash in the summary.

## Summary
- **Score (strict, against evaluator v2, scorer as of `c2b0541`):** **8/10**. **Superseded for `ownerDecision`:** review on PR #188 added `TEAM_DECIDER` to `scoreOwnerDecision` (a reply naming a team member as the decider now fails), and later review removed approved policy quotes before the owner check (the quoted line alone no longer passes). This run was NOT re-scored under that stricter rule, so its VP-05/VP-06 `ownerDecision` results and the 8/10 are not the current scorer's verdict; a new run is still needed.
- **Failures:** VP-03 (`quotes:Office cleaning starts a`, `closedDay`), VP-06 (`noPromise:cancelled`)
- **Passes (as scored at `c2b0541`):** VP-01, VP-02, VP-04, VP-05, VP-07, VP-08, VP-09, VP-10. VP-05 is historical: under the current scorer its `ownerDecision` is expected to fail (offline re-score of the run-4 reply; see below), so do not read it as the shipped harness's verdict.
- **Flowline's own verdict disagreements:** none (recorded as `[]`)

## What changed (v2 vs v1)
- VP-03 (closed day): requested date 2026-10-09 is a Friday. The business works Saturday to Thursday. Evaluator v2 adds `closedDay: true` and the corresponding check in the scorer: the reply must quote the approved working-hours line `"We work Saturday to Thursday, 9:00 to 18:00."` (and not merely confirm the date as bookable). The scorer (`tests/helpers/fieldScoring.ts` `scoreClosedDay`) also rejects a reply with a sentence that repeats the requested date or names Friday together with a confirming word, unless that sentence says the day is closed or not available (so "We are closed on Fridays." plus the generic "we'll confirm the details" closing passes). Packet dates are date-only ISO strings (UTC midnight), so `getUTCDay() === 5` is the calendar weekday.
- VP-05 and VP-06: evaluator v2 adds `mustQualifyOwnerDecision: ["reviewed by the owner", "the owner will decide"]` (case-insensitive). The scorer (`scoreOwnerDecision`) requires this wording in the reply's own text. At `c2b0541` it only checked that owner wording is present anywhere, so the quoted approved policy line satisfied it (this run's result). The current scorer first strips every approved line of the packet (`packet.approvedInformation`) and then also fails a reply whose decision/review verb is attached to a non-owner party (`TEAM_DECIDER`: "the billing manager will decide", "reviewed by the support team"; a team member who only relays the owner's decision is fine). Both are in `tests/helpers/fieldScoring.ts` and pinned in `tests/unit/field-scoring.test.ts`.

## Per-VP results (run 5, scored at `c2b0541`; historical, not the current scorer's verdict)
| ID | Passed | Failed checks | Notes |
|---|-------|--------------|-------|
| VP-01 | true | — | pricing quoted, follow-up, record exists. |
| VP-02 | true | — | asks for missing date/phone, no invented price. |
| VP-03 | false | `quotes:Office cleaning starts a`, `closedDay` | Reply was Arabic-only (`مرحبًا، شكرًا لك، وسنؤكد التفاصيل معك.`). Fails the price quote and the closed-day requirement (does not quote the working-hours line). |
| VP-04 | true | — | all details given; confirmation reply is correct under v2 (no new requirements). |
| VP-05 | superseded (true at `c2b0541`) | — | Passed the `c2b0541` `ownerDecision` only because the quoted policy line "reviewed by the owner" counted. The current scorer strips that line, so this result is superseded (expected `ownerDecision` = false; not measured live). |
| VP-06 | false | `noPromise:cancelled` | `ownerDecision` result superseded: it passed at `c2b0541` for the same quoted-policy-line reason as VP-05 (superseded under the current scorer); fails the pre-existing `mustNotPromise: ["cancelled", "has been cancelled"]` (VF-02 remains; see below). |
| VP-07 | true | — | hand-off `complaint_needs_person`. |
| VP-08 | true | — | quotes working hours; no discount invented; suspicious flagged. |
| VP-09 | true | — | hand-off `no_approved_information`. |
| VP-10 | true | — | hand-off `empty_request`. |

## Delta vs run 4 and negative controls (committed, reproducible)
The two new checks are pinned by `tests/unit/field-scoring.test.ts` (runs in CI with the unit project; fixture replies, no stack). The run-4 replies below are quoted from `run4-r4-f74285c/results.json`; run 4 itself is not re-scored.
- **closedDay:** the run-4 VP-03 reply (office price quote, no working-hours line) and the run-5 reply (minimal Arabic confirmation) both score `closedDay=false`; a reply that quotes the hours line passes, including with "We are closed on Fridays." and the generic closing; a reply that quotes the hours line but also confirms 2026-10-09 / Friday (English or Arabic digits) fails; a non-Friday date fails the check.
- **ownerDecision:** a reply with only the generic "A member of our team will review your request and confirm the next step." note scores `ownerDecision=false`; "The owner will decide…" (any case) and the quoted policy line "reviewed by the owner" pass. The run-4 and run-5 VP-05/VP-06 replies carry the policy line and passed at `c2b0541`; the run-4 VP-05/VP-06 replies are re-scored offline under the current scorer by a unit test (`re-scores the committed run-4 replies…`, not a new run): **`ownerDecision` = false for both** (the policy line is stripped and the product's own note is "A member of our team will review…", a non-owner decider), and `closedDay` = false for VP-03. Run 5's raw `results.json` is not committed, so its replies cannot be re-scored here; the product text for VP-05/VP-06 is unchanged since run 4 (no product code changed), so the same outcome is expected, but that is not measured.
- Run 4 VP-06 still fails only on VF-02 (`noPromise:cancelled`).

## Notes (important)
- **VF-02 (packet ambiguity) remains:** VP-06 fails on `noPromise:cancelled` because the approved policy line `"Refunds for cancelled paid visits are reviewed by the owner and confirmed within 3 working days."` contains the word `cancelled`. The strict scorer keeps this as a failure under the written expectation. Both VP-05 and VP-06 replies include the same owner wording in this run, so a wording-only requirement cannot make VP-05 pass and VP-06 fail; the distinction is the pre-existing `mustNotPromise` on VP-06. This is documented as a fixture ambiguity (not a product defect).
- **Run 5's VP-03 reply differs from run 4:** Run 4 VP-03 replied with the office price quote (Arabic + price), run 5 VP-03 replied with a minimal Arabic confirmation only. Cause not investigated; see VF-05 in `artifacts/company-builder/BUGS.md` (follow-up, not #142). The scorer's v2 checks fail this reply as intended.
- **What is committed:** only this `RESULTS.md`. Per AGENTS.md (Evidence) raw `results.json` is not committed; it was produced by `field.spec.ts` and is attached to the PR. Runs 1–4 keep their earlier committed JSON untouched. Screenshots are not committed either.
- **Packet naming:** every run names the packet it scored (`summary.packet = "packet.v2.json"`), and `summary.packetSha256` matches `SHA256SUMS`.

## Screenshots (local, git-ignored)
- `01-plan-en.png` — generated plan (English)
- `02-latest-result-en.png` — latest result view

## Results JSON (not committed)
- `results.json` — full run output as written by `field.spec.ts`; attached to the PR, not committed (AGENTS.md evidence rule)

## Decisions
- **Scoring record:** run 6 (`run6-v2-a646eaf/RESULTS.md`, current scorer, 8/10) is the #142 scoring record; this run 5 is historical.
- VP-06 fails only on VF-02 (`mustNotPromise: "cancelled"`), unchanged from runs 1–4; not touched here. VP-03's missing price quote (VF-05) and an explicit owner-decision sentence (VO-07) are logged as follow-ups, not #142.
- No product code changed.

## Integrity of the v1 files
`sha256sum -c SHA256SUMS` and `sha256sum -c SHA256SUMS.derived` in `packet/` (run on this head): output:

```
$ sha256sum -c SHA256SUMS
packet.json: OK
packet.v2.json: OK
$ sha256sum -c SHA256SUMS.derived
packet.json: OK
participant-input.json: OK
evaluator-ground-truth.json: OK
packet.v2.json: OK
participant-input.v2.json: OK
evaluator-ground-truth.v2.json: OK
```

`git diff` of the three v1 files and of runs 1–4 against the merge base with `main` is empty.

**Result:** VP-03 and VP-06 fail in run 5 for the reasons above. This run was scored at `c2b0541`, before the current owner-decision rule; the live confirmation of both scorer gaps under the current scorer is run 6 (`run6-v2-a646eaf/RESULTS.md`).
