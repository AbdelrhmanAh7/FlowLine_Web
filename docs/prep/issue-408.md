# Prep for #408: fix: qa finding: Acceptance-criterion deviation from 108 (bundled parent item) is stil… (split from #321)

> Offline floor prep (2026-10-24T09:34Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#321 item=finding:e505a04e310c -->
Split from PR #321 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/321), which reached the fix-round cap (6/6) without going green. Parent issue: #315.

### Scope (one item)
- qa finding: Acceptance-criterion deviation from 108 (bundled parent item) is stil…

Acceptance-criterion deviation from #108 (bundled parent item) is still unresolved. The issue asks for a test that 'reliably fails due to the lock ordering', but the PR still delivers a test that passes on main. The deviation is justified only by a 'CTO decision 2026-10-13 on PR #214 / head b9ae3ee' cited inside the PR's own docs and comments. artifacts/phase-4/issue-315/EVIDENCE.md has no AC row for this item. Either add pre-fix failure evidence, or link the actual decision record and list the item as skipped with a reason.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/321#issuecomment-6278206709

**14 more item(s) from the parent, for the same task:**
- qa finding: docs/implementation/PHASE4BETAREPORT.md, 'Reconciliation 2026-10-14' …: docs/implementation/PHASE4_BETA_REPORT.md, 'Reconciliation 2026-10-14' paragraph: it says every local-validation statement about federated-lock-order.test.ts 'in this entry' now uses the exact wording 'ran locally on 2026-10-12 against a throwaway PostgreSQL database for #108, and CI is the gate'. …
- qa finding: docs/security/FEDERATEDMFA.md, Validation limits: 'the latter ran loc…: docs/security/FEDERATED_MFA.md, Validation limits: 'the latter ran locally on 2026-10-12 … for #108' does not name which two-connection integration test 'the latter' is. Name the file, e.g. `tests/integration/federated-lock-order.test.ts`, so the claim can be checked.

https://github.com/Abdelrhman…
- qa finding: (non-blocking) [minor] docs/implementation/PHASE4BETAREPORT.md, recon…: (non-blocking) [minor] docs/implementation/PHASE4_BETA_REPORT.md, reconciliation paragraph: it says the `email-token-lock-order` two-connection tests 'remain marked unexecuted'. The same entry lists `email-token-lock-order.test.ts` as verified locally against `flowline_test_i108`. FEDERATED_MFA.md …
- qa finding: (non-blocking) [minor] docs/implementation/PHASE4BETAREPORT.md: the r…: (non-blocking) [minor] docs/implementation/PHASE4_BETA_REPORT.md: the reconciliation paragraph ends 'No test code, test assertions or CI configuration changed'. This PR does change test code: tests/integration/federated-lock-order.test.ts drops its local `routeTransactions` and the `AsyncLocalStora…
- qa finding: (non-blocking) [minor] artifacts/phase-4/issue-315/EVIDENCE.md: tests…: (non-blocking) [minor] artifacts/phase-4/issue-315/EVIDENCE.md: tests/integration/federated-lock-order.test.ts was refactored to use the shared `routeTransactions`, but the verification table records only typecheck and eslint for it, with no integration run on this branch head. The 58e5823b re-run …
- qa finding: (non-blocking) [nit] tests/integra

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.env.example`
- `.github/workflows/claude.yml`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/RETEST.md`

## Existing tests nearby

- none found

## Test plan (ollama:gemma3:4b)

**Test Plan: FlowLine_Web - Issue #408 - Lock Ordering Deviation**

**Overall Goal:** Verify the fix for the acceptance criterion deviation related to lock ordering, specifically addressing the CTO decision and documentation inconsistencies.

**1. Test Case: Verify CI Failure with Updated Test File**
   * **Name:** CI Lock Order Failure
   * **Setup:**  Run the `tests/integration/federated-lock-order.test.ts` against the main branch.
   * **Assertion:**  The CI build should fail due to the lock ordering discrepancy.
   * **File:** `tests/integration/federated-lock-order.test.ts`

**2. Test Case: Document Verification - Shared RouteTransactions**
   * **Name:** RouteTransactions Verification
   * **Setup:** Inspect the `artifacts/phase-4/issue-315/EVIDENCE.md` file for updated test assertions related to the `routeTransactions` shared function.
   * **Assertion:**  Evidence should demonstrate successful integration testing with `routeTransactions`.
   * **File:** `artifacts/phase-4/issue-315/EVIDENCE.md`

**3. Test Case:  Re-run CI with 58e5823b**
   * **Name:** Re-run CI with Previous Commit
   * **Setup:**  Run the `tests/integration/federated-lock-order.test.ts` against the commit `58e5823b`.
   * **Assertion:** The CI build should pass, confirming the previous state.
   * **File:** `tests/integration/federated-lock-order.test.ts`

**4. Test Case:  Documentation Consistency - FEDERATED_MFA.md**
   * **Name:** MFA Documentation Update
   * **Setup:** Verify the `docs/security/FEDERATED_MFA.md` file accurately reflects the 'latter' test reference.
   * **Assertion:** The document should explicitly name the `tests/integration/federated-lock-order.test.ts` file.
   * **File:** `docs/security/FEDERATED_MFA.md`

**5. Test Case: Local Run Verification (Edge Case)**
    * **Name:** Local Run with Throwaway DB
    * **Setup:** Manually execute the local test against a throwaway PostgreSQL database.
    * **Assertion:** The test should consistently fail due to the lock ordering issue.
    * **File:** `tests/integration/federated-lock-order.test.ts`

**Notes:**  This plan focuses on verifying the core fix and addressing documentation gaps.  Further investigation into the CTO decision rationale is recommended.  Prioritize CI failure verification.
