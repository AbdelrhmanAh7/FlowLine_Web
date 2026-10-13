# Prep for #149: Template: 'Deal won → Mizano quote' with an approval step

> Offline floor prep (2026-10-13T13:23Z): capacity 0 — claude: claude week 87% ≥ 85%: the last 15% is the owner's; codex: codex is in peak hours (16:00–00:00 Africa/Cairo):; opencode: opencode has no live canary pass in the last 3 h (; agy: held until 10-14 14:35Z (1 d 1 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Part of #144 (FlowLine G5 · Mizano connector v1).

## Scope
New template (templates.ts): Lead Qualifier 'won' → ASK approval (shows customer + lines) → Create customer → Create draft quote → notify. Uses steps from the tasks above.

## Acceptance
- [ ] Template listed in the gallery (EN + AR)
- [ ] The approval step blocks until approved; reject ends the run without calls to Mizano
- [ ] e2e spec for the template happy path with a mocked Mizano

## How to test manually
1. Templates → 'Deal won → Mizano quote' → Use
2. Run with a sample deal, approve: draft quote in Mizano
3. Run again and reject: nothing created

Test link: https://abdelrahmans-mac-mini.tailb66912.ts.net:8444 (Mizano: :8446). Blocked by the Mizano scoped API keys task (MZ G5) for live calls; mocks are enough to merge.


## Acceptance checklist

- [ ] Template listed in the gallery (EN + AR)
- [ ] The approval step blocks until approved; reject ends the run without calls to Mizano
- [ ] e2e spec for the template happy path with a mocked Mizano

## Candidate files

- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.husky/pre-commit`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Deal Won → Mizano Quote Template

**Goal:** Verify the new 'Deal won → Mizano quote' template functionality.

**1. Happy Path Approval:**
   * **Name:** Successful Approval
   * **Setup:** Initiate template with a won deal. Approve the draft quote in Mizano.
   * **Assertion:** Customer & lines created in Mizano, draft quote created, notification sent. (templates.ts)

**2. Reject Flow:**
   * **Name:** Reject Flow
   * **Setup:** Initiate template with a won deal. Reject the draft quote in Mizano.
   * **Assertion:** No customer or quote created. (templates.ts)

**3. Empty Deal Input:**
   * **Name:** Empty Deal Input
   * **Setup:** Initiate template with no deal details.
   * **Assertion:** Template fails gracefully, no errors. (templates.ts)

**4. Mizano Timeout:**
   * **Name:** Mizano Timeout Mock
   * **Setup:** Mock Mizano to simulate a timeout.
   * **Assertion:** Template handles timeout gracefully, logs error. (templates.ts)

**5. Duplicate Quote (Edge Case):**
   * **Name:** Duplicate Quote Creation
   * **Setup:** Trigger the template multiple times with the same deal.
   * **Assertion:**  Verify only one quote is created. (templates.ts)

**6. AR Language Display:**
   * **Name:** AR Language Display
   * **Setup:** Run template in AR language.
   * **Assertion:** Template UI is correctly translated to AR. (templates.ts)

**7. Approval Step Block:**
   * **Name:** Approval Step Block
   * **Setup:** Initiate template, approval step pending.
   * **Assertion:** Run stops until approval, reject ends run. (templates.ts)

**8.  Invalid Quote Data (Edge Case):**
    * **Name:** Invalid Quote Data
    * **Setup:**  Force a malformed quote response from Mizano.
    * **Assertion:** Template handles the error gracefully, logs the issue. (templates.ts)

**9.  Large Quote Data (Edge Case):**
    * **Name:** Large Quote Data
    * **Setup:**  Simulate a very large quote response from Mizano.
    * **Assertion:** Template handles the large data without crashing. (templates.ts)

**10.  Missing Customer Data (Edge Case):**
    * **Name:** Missing Customer Data
    * **Setup:**  Simulate a response from Mizano with missing customer data.
    * **Assertion:** Template handles the missing data gracefully, logs the issue. (templates.ts)

**Files:** templates.ts, e2e specs, unit tests.
