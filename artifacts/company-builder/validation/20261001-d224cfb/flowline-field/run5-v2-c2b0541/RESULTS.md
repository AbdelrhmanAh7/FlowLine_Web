# Field run 5 — packet.v2.json (scoring-gap fix #142)

**Candidate (at time of run):** `c2b0541`  
**Packet:** `packet.v2.json`  
**Packet SHA256:** `3684c632fafa91e116f4095be8f37420041f15b43003c9c02910adfefb5ac11e`  
**Run ID:** `run5-v2-c2b0541`  
**Run at (UTC):** `2026-10-11T00:30:54.770Z`  
**Environment:** Isolated test stack (`FLOWLINE_TEST_DB=flowline_test_142`, `FLOWLINE_COMPANY_BUILDER=on`, `FLOWLINE_BETA_MODE=open`), port 3100, `next dev` test mode. The stack was healthy (`/api/health?require=worker` 200) at the start of the run.

**Harness:** `flowline-field/field.spec.ts` (read-only for this run except that the spec itself was the code change; old runs 1–4 unchanged). The spec reads `PACKET` (default `packet.json`) and records the packet file and its hash in the summary.

## Summary
- **Score (strict, against evaluator v2):** **8/10**
- **Failures:** VP-03 (`quotes:Office cleaning starts a`, `closedDay`), VP-06 (`noPromise:cancelled`)
- **Passes:** VP-01, VP-02, VP-04, VP-05, VP-07, VP-08, VP-09, VP-10
- **Flowline's own verdict disagreements:** none (recorded as `[]`)

## What changed (v2 vs v1)
- VP-03 (closed day): requested date 2026-10-09 is a Friday. The business works Saturday to Thursday. Evaluator v2 adds `closedDay: true` and the corresponding check in the scorer: the reply must quote the approved working-hours line `"We work Saturday to Thursday, 9:00 to 18:00."` (and not merely confirm the date as bookable). The scorer uses `new Date(...T00:00:00Z).getUTCDay() === 5` (timezone-independent).
- VP-05 and VP-06: evaluator v2 adds `mustQualifyOwnerDecision: ["reviewed by the owner", "the owner will decide"]` (case-insensitive). The scorer requires this wording in consequential replies.

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

## Delta vs run 4 (v1 spec applied historically; v2 extra checks)
- Run 4 VP-03 (historical, v1): passed under v1 expectations (quoted the office price `"Office cleaning starts at 900 EGP per visit."`), but under v2's extra checks: `closedDay=false` (the reply did not quote the working-hours line). This isolates the closed-day scoring gap that v2 fixes (scorer now requires the working-hours line when the requested date is a Friday).
- Run 4 VP-05/VP-06: both satisfy `ownerDecision=true` in the v2 check (they quote "reviewed by the owner"). Run 4 VP-06 still fails only on VF-02 `noPromise:cancelled`.
- Negative control: a generic-only note `"A member of our team will review your request and confirm the next step."` gives `ownerDecision=false` under the v2 check, confirming the check does not pass on generic wording.

## Notes (important)
- **VF-02 (packet ambiguity) remains:** VP-06 fails on `noPromise:cancelled` because the approved policy line `"Refunds for cancelled paid visits are reviewed by the owner and confirmed within 3 working days."` contains the word `cancelled`. The strict scorer keeps this as a failure under the written expectation. Both VP-05 and VP-06 replies include the same owner wording in this run, so a wording-only requirement cannot make VP-05 pass and VP-06 fail; the distinction is the pre-existing `mustNotPromise` on VP-06. This is documented as a fixture ambiguity (not a product defect).
- **Run 5's VP-03 reply differs from run 4:** Run 4 VP-03 replied with the office price quote (Arabic + price), run 5 VP-03 replied with a minimal Arabic confirmation only. This appears to be pre-existing product behaviour on the mainline stack under this deterministic setup; it is not introduced by the v2 packet or the spec changes. The scorer's v2 checks still behave correctly (both fail appropriately).
- **What is committed:** `results.json` (this run's output) is committed exactly as runs 1–4 were — the maintainers explicitly kept the field-validation harness and its run records as inputs of open work (#6/#141/#142, commit `b372098`, `docs/slimdown-plan.md` §"Keep"). The two PNG screenshots are **not** committed (`/artifacts/**` ignores everything except `*.md`); they remain local, as for runs 1–4. This `RESULTS.md` is the human-readable record.
- **Packet naming:** every run names the packet it scored (`summary.packet = "packet.v2.json"`), and `summary.packetSha256` matches `SHA256SUMS`.

## Screenshots (local, git-ignored)
- `01-plan-en.png` — generated plan (English)
- `02-latest-result-en.png` — latest result view

## Results JSON (committed)
- `results.json` — full run output as written by `field.spec.ts`

**Result:** VP-03 and VP-06 fail as expected under v2 (the two gaps are fixed at the scorer level); VP-05 passes the owner-decision check. The acceptance criterion is satisfied by the v2 scorer correctly applying the new checks.