# Prep for #406: fix: qa finding: E2E tests have been added in e2e/account-security.spec.ts and e2e-arm… (split from #327)

> Offline floor prep (2026-10-24T08:52Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#327 item=finding:f580766562f0 -->
Split from PR #327 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/327), which reached the fix-round cap (6/6) without going green. Parent issue: #318.

### Scope (one item)
- qa finding: E2E tests have been added in e2e/account-security.spec.ts and e2e-arm…

E2E tests have been added in e2e/account-security.spec.ts and e2e-army/199-disable-two-factor.e2e.ts covering the account security page functionality

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/327#issuecomment-6282577680

**28 more item(s) from the parent, for the same task:**
- qa finding: Unit tests have been added in tests/unit/account-security-two-factor.…: Unit tests have been added in tests/unit/account-security-two-factor.test.ts to verify specific implementation details

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/327#issuecomment-6282577680
- qa finding: Arabic RTL support has been verified in e2e/arabic.spec.ts with prope…: Arabic RTL support has been verified in e2e/arabic.spec.ts with proper direction handling for secret codes and backup codes

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/327#issuecomment-6282577680
- two-factor-card.tsx: src/app/account/security/two-factor-card.tsx:31-52 and :69-83: Cancel…: src/app/account/security/two-factor-card.tsx:31-52 and :69-83: Cancel stays enabled while a request is pending, and enable()/disable() have no abort or stale-response guard after await. Clicking Cancel during an in-flight enable re-opens the enrolment view and shows the secret/backup codes when the…
- ACCOUNT_SECURITY.md: docs/security/ACCOUNTSECURITY.md:16: 'Passwords ... cleared from memo…: docs/security/ACCOUNT_SECURITY.md:16: 'Passwords ... cleared from memory upon submission' is inaccurate: takeSecret() only clears the DOM input value; the password is still held in a JS string and sent in the request body (src/app/account/security/two-factor-card.tsx:41,44). Reword to 'cleared from…
- ACCOUNT_SECURITY.md: docs/security/ACCOUNTSECURITY.md:26: the section is titled 'Integrati…: docs/security/ACCOUNT_SECURITY.md:26: the section is titled 'Integration with Federated MFA and Engine' but contains no Engine content. Rename it or add the missing Engine coverage; the federated-MFA 'cannot bypass local MFA' guarantee should also cite the fencing implementation/tests rather than o…
- NEXT_ACTION.md: NEXTACTION.md:5,7 and docs/implementation/PHASE4BETAREPORT.md:3,7: th…: NEXT_ACTION.md:5,7 and docs/implementation/PHASE4_BETA_REPORT.md:3,7: the new sections cite 'PR #262', which is not this split PR (the brief says it supersedes part of #269), and the claimed '5/5' Playwright result does not reconcile with the four tests in e2e/account-security.spec.ts plus the new …
- qa finding: In src/i18n/messages/ar.json, the Arabic translation for 'security.tw…: In src/i18n/messages/ar.json, the Arabic translation for 'security.twoFactor.backupCodes' uses a dash (—) which is a longer 

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.github/actions/gate-report/action.yml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/gate.yml`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/template-actions.test.ts`

## Test plan (ollama:gemma3:4b)

Okay, here’s a test plan based on the provided information, aiming for conciseness and actionable steps:

**Test Plan: E2E Account Security Tests - Issue #406**

**Overall Goal:** Verify the newly added E2E tests in `e2e/account-security.spec.ts` and `e2e-army/199-disable-two-factor.e2e.ts` cover the core account security functionality.

**1. Two-Factor Enable/Disable Flow (e2e/account-security.spec.ts)**
   * **Name:** Basic Enable/Disable
   * **Setup:** Navigate to account security page, initiate two-factor enable, then disable.
   * **Assertion:** Verify the status changes correctly (enabled/disabled) and the UI reflects the state.
   * **Edge Case:** Simulate network latency during enable/disable.

**2. Cancel Flow (e2e/account-security.spec.ts)**
   * **Name:** Cancel Two-Factor Enrollment
   * **Setup:** Initiate two-factor enable, click "Cancel".
   * **Assertion:** Verify the enrollment view reopens and secret/backup codes are displayed.
   * **Edge Case:**  Test cancel during a long-running enable request.

**3. Arabic RTL Support (e2e/arabic.spec.ts)**
   * **Name:** RTL Code Display
   * **Setup:** Navigate to Arabic language settings, specifically the two-factor section.
   * **Assertion:** Verify secret and backup codes are displayed correctly in RTL (right-to-left) direction.

**4. Password Clearing Verification (Manual/UI Check)**
   * **Name:** DOM Clearing Confirmation
   * **Setup:** Manually inspect the `two-factor-card.tsx` component during input.
   * **Assertion:** Confirm the DOM input field is cleared upon submission, but the password remains in a JS string.

**5. Backup Code Translation (e2e/arabic.spec.ts)**
   * **Name:** Arabic Translation Accuracy
   * **Setup:** Navigate to the Arabic language settings.
   * **Assertion:** Verify the Arabic translation for “backup codes” uses the correct dash character.

**Test Files:**

*   `e2e/account-security.spec.ts` – Primary tests for core functionality.
*   `e2e-army/199-disable-two-factor.e2e.ts` – Specific disable test.
*   `e2e/arabic.spec.ts` – RTL and language-specific tests.

**Notes:**  Prioritize verifying the core enable/disable flow.  The Arabic RTL test is critical.  Manual UI checks are needed to confirm password clearing.  Consider adding a test for the inaccurate 'Passwords ... cleared from memory' documentation.
