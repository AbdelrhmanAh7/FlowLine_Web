# Field run 5 — packet.v2.json (scoring-gap fix #142)

**Candidate (at time of run):** `c2b0541`  
**Packet:** `packet.v2.json`  
**Packet SHA256:** `3684c632fafa91e116f4095be8f37420041f15b43003c9c02910adfefb5ac11e`  
**Run ID:** `run5-v2-c2b0541`  
**Run at (UTC):** `2026-10-11T00:30:54.770Z`  
**Environment:** Isolated test stack (`FLOWLINE_TEST_DB=flowline_test_142`, `FLOWLINE_COMPANY_BUILDER=on`, `FLOWLINE_BETA_MODE=open`), port 3100, `next dev` test mode. The stack was healthy (`/api/health?require=worker` 200) at the start of the run.

**Harness:** `flowline-field/field.spec.ts` (read-only for this run except that the spec itself was the code change; old runs 1–4 unchanged). The spec reads `PACKET` (default `packet.json`) and records the packet file and its hash in the summary.

## Summary
- **Score (strict, against evaluator v2, scorer as of `c2b0541`):** **8/10**. **Superseded for `ownerDecision`:** review on PR #188 added `TEAM_DECIDER` to `scoreOwnerDecision` (a reply naming a team member as the decider now fails). This run was NOT re-scored under that stricter rule, so its VP-05/VP-06 `ownerDecision` results and the 8/10 are not the current scorer's verdict; a new run is still needed.
- **Failures:** VP-03 (`quotes:Office cleaning starts a`, `closedDay`), VP-06 (`noPromise:cancelled`)
- **Passes:** VP-01, VP-02, VP-04, VP-05, VP-07, VP-08, VP-09, VP-10
- **Flowline's own verdict disagreements:** none (recorded as `[]`)

## What changed (v2 vs v1)
- VP-03 (closed day): requested date 2026-10-09 is a Friday. The business works Saturday to Thursday. Evaluator v2 adds `closedDay: true` and the corresponding check in the scorer: the reply must quote the approved working-hours line `"We work Saturday to Thursday, 9:00 to 18:00."` (and not merely confirm the date as bookable). The scorer (`tests/helpers/fieldScoring.ts` `scoreClosedDay`) also rejects a reply with a sentence that repeats the requested date or names Friday together with a confirming word, unless that sentence says the day is closed or not available (so "We are closed on Fridays." plus the generic "we'll confirm the details" closing passes). Packet dates are date-only ISO strings (UTC midnight), so `getUTCDay() === 5` is the calendar weekday.
- VP-05 and VP-06: evaluator v2 adds `mustQualifyOwnerDecision: ["reviewed by the owner", "the owner will decide"]` (case-insensitive). The scorer (`scoreOwnerDecision`) requires this wording somewhere in the reply; the quoted approved policy line satisfies it. At `c2b0541` it only checked that owner wording is present; the current scorer also fails a reply that names a team member as the decider (`TEAM_DECIDER`, `tests/helpers/fieldScoring.ts`, pinned in `tests/unit/field-scoring.test.ts`).

## Per-VP results (run 5)
| ID | Passed | Failed checks | Notes |
|---|-------|--------------|-------|
| VP-01 | true | — | pricing quoted, follow-up, record exists. |
| VP-02 | true | — | asks for missing date/phone, no invented price. |
| VP-03 | false | `quotes:Office cleaning starts a`, `closedDay` | Reply was Arabic-only (`مرحبًا، شكرًا لك، وسنؤكد التفاصيل معك.`). Fails the price quote and the closed-day requirement (does not quote the working-hours line). |
| VP-04 | true | — | all details given; confirmation reply is correct under v2 (no new requirements). |
| VP-05 | true | — | passes `ownerDecision` (reply includes "reviewed by the owner"). Also respects no-promise constraints. |
| VP-06 | false | `noPromise:cancelled` | passes `ownerDecision` (includes owner wording) but fails the pre-existing `mustNotPromise: ["cancelled", "has been cancelled"]` (VF-02 remains; see below). |
| VP-07 | true | — | hand-off `complaint_needs_person`. |
| VP-08 | true | — | quotes working hours; no discount invented; suspicious flagged. |
| VP-09 | true | — | hand-off `no_approved_information`. |
| VP-10 | true | — | hand-off `empty_request`. |

## Delta vs run 4 and negative controls (committed, reproducible)
The two new checks are pinned by `tests/unit/field-scoring.test.ts` (runs in CI with the unit project; fixture replies, no stack). The run-4 replies below are quoted from `run4-r4-f74285c/results.json`; run 4 itself is not re-scored.
- **closedDay:** the run-4 VP-03 reply (office price quote, no working-hours line) and the run-5 reply (minimal Arabic confirmation) both score `closedDay=false`; a reply that quotes the hours line passes, including with "We are closed on Fridays." and the generic closing; a reply that quotes the hours line but also confirms 2026-10-09 / Friday (English or Arabic digits) fails; a non-Friday date fails the check.
- **ownerDecision:** a reply with only the generic "A member of our team will review your request and confirm the next step." note scores `ownerDecision=false`; "The owner will decide…" (any case) and the quoted policy line "reviewed by the owner" pass. The run-4 and run-5 VP-05/VP-06 replies carry the policy line and passed at `c2b0541`; whether they still pass under `TEAM_DECIDER` (they also contain the generic team note) is unverified because the run was not re-scored. The rejecting cases are the unit tests above.
- Run 4 VP-06 still fails only on VF-02 (`noPromise:cancelled`).

## Notes (important)
- **VF-02 (packet ambiguity) remains:** VP-06 fails on `noPromise:cancelled` because the approved policy line `"Refunds for cancelled paid visits are reviewed by the owner and confirmed within 3 working days."` contains the word `cancelled`. The strict scorer keeps this as a failure under the written expectation. Both VP-05 and VP-06 replies include the same owner wording in this run, so a wording-only requirement cannot make VP-05 pass and VP-06 fail; the distinction is the pre-existing `mustNotPromise` on VP-06. This is documented as a fixture ambiguity (not a product defect).
- **Run 5's VP-03 reply differs from run 4:** Run 4 VP-03 replied with the office price quote (Arabic + price), run 5 VP-03 replied with a minimal Arabic confirmation only. Cause not investigated; see VF-05 in `artifacts/company-builder/BUGS.md` (follow-up, not #142). The scorer's v2 checks fail this reply as intended.
- **What is committed:** only this `RESULTS.md`. Per AGENTS.md (Evidence) raw `results.json` is not committed; it was produced by `field.spec.ts` and is attached to the PR. Runs 1–4 keep their earlier committed JSON untouched. Screenshots are not committed either.
- **Packet naming:** every run names the packet it scored (`summary.packet = "packet.v2.json"`), and `summary.packetSha256` matches `SHA256SUMS`.

## Screenshots (local, git-ignored)
- `01-plan-en.png` — generated plan (English)
- `02-latest-result-en.png` — latest result view

## Results JSON (committed)
- `results.json` — full run output as written by `field.spec.ts` (attached to the PR, not committed)

## Decisions
- **Option 1 accepted (CTO, #142):** accept the v2 result (8/10) as is. The plan's check "VP-06 fails on missing owner wording, VP-05 passes" is superseded: both replies quote the approved policy line "reviewed by the owner", so owner wording cannot separate them. Issue #142's acceptance (replies without owner-decision wording score as failures) is met and proven by the committed negative control (`tests/unit/field-scoring.test.ts`).
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

**Result:** VP-03 and VP-06 fail in run 5 for the reasons above. Both scorer gaps are closed at the scorer level: the closed-day and owner-decision checks are enforced and each is shown rejecting a reply by the committed unit test (the run itself shows `closedDay` rejecting; `ownerDecision` passed in both consequential replies under the earlier scorer and has not been re-run under the current one). Whether the product behaves correctly on VP-03 is a separate matter (VF-05).
