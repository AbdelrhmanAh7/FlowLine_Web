# Questions for the owner — issue #142

Issue #142 fixes two scoring gaps in the frozen Company Builder field-validation packet
(`artifacts/company-builder/validation/20261001-d224cfb/packet/packet.json`):

- `packet.json:41` — do not score a Friday (closed-day) service confirmation as correct (VP-03).
- `packet.json:44` — enforce the owner-decision qualification in VP-05 and VP-06 replies.

Both are evaluator fixtures, not user-facing product code. `E2E: not needed — evaluator fixtures only`.

## What was done

- New `packet.v2.json` (plus derived `participant-input.v2.json`, `evaluator-ground-truth.v2.json`), leaving the v1 files
  byte-identical. VP-03 gets `closedDay: true`; VP-05/VP-06 get
  `mustQualifyOwnerDecision: ["reviewed by the owner", "the owner will decide"]`.
- `field.spec.ts` reads `PACKET` (default `packet.json`, so old runs 1–4 stay reproducible) and adds the two checks
  (`closedDay` via `getUTCDay()`, `ownerDecision` via case-insensitive `some()`). The run summary records the packet file
  and its hash.
- New run recorded: `PACKET=packet.v2.json FIELD_RUN=run5-v2-c2b0541` → **8/10**; failures VP-03
  (`quotes:Office cleaning starts a`, `closedDay`) and VP-06 (`noPromise:cancelled`). Old runs 1–4 untouched.

## Question: the manager plan's check for VP-06 cannot be satisfied as written

The plan's check step says: *"With the run4 replies, VP-06 must fail ('member of our team', no owner wording) and VP-05
must pass."* The code and the stored run-4 replies do not support this.

In run 4 (and run 5) the VP-05 and VP-06 drafts both quote the approved policy line
`"Refunds for cancelled paid visits are reviewed by the owner and confirmed within 3 working days."` and then the fixed
note `"A member of our team will review your request…"`. So:

- VP-05 **passes** the v2 owner-decision check (it contains "reviewed by the owner").
- VP-06 **also passes** that same check (same policy line), and fails only on the pre-existing VF-02 check
  `mustNotPromise: "cancelled"`.

Owner wording that appears in both replies cannot make VP-05 pass and VP-06 fail. VP-06 fails for a different,
already-recorded reason (the packet's own approved line contains the word "cancelled" — VF-02, a known fixture
ambiguity, not a product defect).

**Decision needed (pick one):**

1. **Accept the v2 result as-is.** The scoring gap "owner-decision qualification is not enforced" is now enforced by the
   scorer (a reply *without* any owner wording fails — verified with a generic-note negative control). VP-06 continues to
   fail on VF-02, unchanged from runs 1–4. No further change.
2. **Change the product** so refund/cancellation drafts carry a distinct, explicit owner-decision sentence and stop relying
   on the approved policy line. That is a product change outside this issue's "evaluator fixtures" scope and would need its
   own issue; it would also change what v2 scores.
3. **Change the VP-06 packet expectation** (drop `mustNotPromise: "cancelled"` or scope it) so VP-06 passes. This resolves
   VF-02 but is a separate decision that also affects runs 1–4's recorded result; it is not part of #142 as scoped.

Recommendation: **option 1** — it fixes exactly the two scoring gaps named in the issue, keeps old runs intact, and does not
silently resolve the separately-tracked VF-02 ambiguity.

## Notes / deviations

- The plan's instruction to write here only applied "if the stack can't start". The test stack **did** start
  (`FLOWLINE_TEST_DB=flowline_test_142`, port 3100, `/api/health?require=worker` 200), so the run was recorded normally;
  this file exists only for the question above.
- The plan's derived v2 files were created and added to `SHA256SUMS` / `SHA256SUMS.derived` as instructed (no deviation).
- Run 5's VP-03 reply is a minimal Arabic confirmation (`مرحبًا، شكرًا لك، وسنؤكد التفاصيل معك.`), unlike run 4's, which
  quoted `"Office cleaning starts at 900 EGP per visit."`. This looks like pre-existing product behaviour on the mainline
  stack under this deterministic setup, not something the v2 packet or spec introduced. It is recorded as an observation,
  not a #142 finding.
