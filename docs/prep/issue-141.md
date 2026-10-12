# Prep for #141: Field validation harness: fix the 4 scoring gaps in field.spec.ts

> Offline floor prep (2026-10-12T10:50Z): capacity 0 — claude: claude daily budget spent (14% of 4.4% week-points; codex: held until 12:47Z (codex 5-h 100% used (codex app-; opencode: opencode has no live canary pass in the last 3 h (; agy: held until 10-14 14:36Z (2 d 4 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Part of #6 (split in the backlog restructure).

## Scope
In `flowline-field/field.spec.ts` (next validation round only; the frozen run `20261001-d224cfb` stays unchanged):
- [ ] :117 do not score approved policy text as a cancellation promise
- [ ] :138 exercise the approval side of the review gate
- [ ] :143 compare persisted records after the duplicate trial
- [ ] :160 verify the packet digest before recording it

## Acceptance
- Each item has a unit/spec assertion that fails before the fix and passes after.
- No change to recorded evidence of earlier runs.

## How to test manually
1. `pnpm test flowline-field` locally: the 4 new assertions pass.
2. Temporarily revert one fix: its assertion fails.


## Acceptance checklist

- [ ] :117 do not score approved policy text as a cancellation promise
- [ ] :138 exercise the approval side of the review gate
- [ ] :143 compare persisted records after the duplicate trial
- [ ] :160 verify the packet digest before recording it

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/workflows/gate.yml`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Field Validation Harness - Issue #141

**Goal:** Verify fixes for 4 scoring gaps in `field.spec.ts`.

**1. Gap 1: Policy Cancellation (Line 117)**
* **Name:** Policy Cancellation Verification
* **Setup:** Simulate a policy approval and a subsequent cancellation attempt.
* **Assertion:** Verify the system correctly flags the cancellation as a promise.
* **File:** `field.spec.ts`

**2. Gap 2: Approval Gate Exercise (Line 138)**
* **Name:** Approval Gate Trigger
* **Setup:** Initiate a review gate with an approval.
* **Assertion:** Confirm the approval side of the gate is correctly exercised.
* **File:** `field.spec.ts`

**3. Gap 3: Duplicate Trial Records (Line 143)**
* **Name:** Duplicate Trial Record Comparison
* **Setup:** Trigger a duplicate trial.
* **Assertion:** Verify persisted records reflect the duplicate trial accurately.
* **File:** `field.spec.ts`

**4. Gap 4: Packet Digest Verification (Line 160)**
* **Name:** Packet Digest Integrity
* **Setup:** Record a packet digest.
* **Assertion:** Confirm the digest is verified before recording.
* **File:** `field.spec.ts`

**5. Regression Test (All Gaps)**
* **Name:** Full Validation Regression
* **Setup:** Run the entire test suite.
* **Assertion:** All 4 assertions pass.
* **File:** `field.spec.ts`

**Edge Cases:**
* Vary policy types (e.g., different approval criteria).
* Simulate different user actions within the gate.
* Test with large/complex data sets.
