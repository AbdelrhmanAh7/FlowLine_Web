# Prep for #142: Field validation packet: fix the 2 scoring gaps in packet.json (VP-05/VP-06)

> Offline floor prep (2026-10-13T04:57Z): capacity 0 — codex: held until 10-18 11:15Z (5 d 6 h) (codex week 100%; opencode: held until 05:24Z (opencode rate-limited 10× in a ; agy: held until 10-14 14:35Z (1 d 10 h) ( error: Indivi; or-laguna: or-laguna paced: openrouter-free rpd 50/day used (. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Part of #6 (split in the backlog restructure).

## Scope
- [ ] `packet/packet.json:41` do not score a Friday service confirmation as correct
- [ ] `packet/packet.json:44` enforce the owner-decision qualification in VP-05 and VP-06 replies

## Acceptance
- The harness scores both cases correctly; a new run is recorded (old runs untouched).

## How to test manually
1. Run the field harness on the packet: VP-05/VP-06 replies without the owner-decision wording are scored as failures.


## Acceptance checklist

- [ ] `packet/packet.json:41` do not score a Friday service confirmation as correct
- [ ] `packet/packet.json:44` enforce the owner-decision qualification in VP-05 and VP-06 replies

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.gitignore`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Field Validation Packet - Scoring Gaps (VP-05/VP-06)

**Goal:** Verify corrected scoring logic for VP-05/VP-06 replies in `packet.json`.

**1. Friday Service Confirmation Failure:**
   * **Name:** Friday Confirmation - Incorrect Scoring
   * **Setup:**  VP-05/VP-06 reply with *no* owner-decision wording.
   * **Assertion:** Harness scores as failure.
   * **File:** `packet/packet.json` (Line 41)

**2. Owner-Decision Qualification - Positive:**
   * **Name:** Owner Decision - Valid Reply
   * **Setup:** VP-05/VP-06 reply *with* owner-decision wording.
   * **Assertion:** Harness scores as correct.
   * **File:** `packet/packet.json` (Line 44)

**3. Empty Reply - Failure:**
   * **Name:** Empty Reply - Invalid
   * **Setup:** VP-05/VP-06 reply with an empty string.
   * **Assertion:** Harness scores as failure.
   * **File:** `packet/packet.json` (Line 41)

**4. Minimal Valid Reply - Success:**
   * **Name:** Minimal Valid Reply
   * **Setup:** VP-05/VP-06 reply with just the required minimal data.
   * **Assertion:** Harness scores as correct.
   * **File:** `packet/packet.json` (Line 44)

**5. Invalid Data Type - Failure:**
   * **Name:** Invalid Data Type
   * **Setup:** VP-05/VP-06 reply with a field containing an incorrect data type (e.g., string instead of number).
   * **Assertion:** Harness scores as failure.
   * **File:** `packet/packet.json` (Line 41)

**6. Edge Case - Long String:**
   * **Name:** Long String - Valid
   * **Setup:** VP-05/VP-06 reply with a very long string in a field.
   * **Assertion:** Harness scores as correct.
   * **File:** `packet/packet.json` (Line 44)

**7. Edge Case - Special Characters:**
   * **Name:** Special Characters - Valid
   * **Setup:** VP-05/VP-06 reply with a field containing special characters.
   * **Assertion:** Harness scores as correct.
   * **File:** `packet/packet.json` (Line 44)

**8.  Negative Test - Incorrect Wording:**
    * **Name:** Incorrect Wording - Failure
    * **Setup:** VP-05/VP-06 reply with wording *different* from owner-decision.
    * **Assertion:** Harness scores as failure.
    * **File:** `packet/packet.json` (Line 41)

**9. Harness Run Verification:**
   * **Name:** Harness Run Verification
   * **Setup:** Run the harness with a variety of VP-05/VP-06 replies.
   * **Assertion:** New run recorded, old runs untouched.
   * **File:** N/A (Manual Verification)

**10.  Complete Absence of Data - Failure**
    * **Name:** No Data - Invalid
    * **Setup:** VP-05/VP-06 reply with *no* data at all.
    * **Assertion:** Harness scores as failure.
    * **File:** `packet/packet.json` (Line 41)
