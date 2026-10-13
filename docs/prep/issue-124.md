# Prep for #124: staging: auto-verify sign-ups for automated testing

> Offline floor prep (2026-10-13T04:24Z): capacity 0 — codex: held until 10-18 11:15Z (5 d 7 h) (codex week 100%; opencode: held until 04:44Z (opencode rate-limited 9× in a r; agy: held until 10-14 14:35Z (1 d 10 h) ( error: Indivi; or-laguna: or-laguna paced: openrouter-free rpd 50/day used (. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

External automated testing (TestSprite cloud, milestone runs) cannot complete sign-up on staging: src/lib/auth.ts hardcodes requireEmailVerification: true and there is no env flag to skip it. The only mail catcher is /api/test/outbox, which a cloud test generator does not know about.

Ask: a staging/test-only switch (FLOWLINE_ENV=test plus an explicit opt-in env such as FLOWLINE_TEST_AUTO_VERIFY=1, never allowed in production) that marks new sign-ups verified so a generated sign-up -> sign-in -> create flow test can run end to end. Must be impossible to enable when FLOWLINE_ENV is not test. Context: #110.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.env.example`
- `.gitignore`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/RETEST.md`
- `artifacts/ai-hub/gate-cceeb5d/GATE.md`
- `artifacts/ai-hub/research/providers-2026-09-29.md`
- `artifacts/beta-execution/20260930-landing-executor/CP27_SOURCE_REVIEW.md`

## Existing tests nearby

- none found

## Test plan (ollama:gemma3:4b)

## Test Plan: Staging Auto-Verify Sign-Ups

**Issue:** Staging sign-up verification blocked by hardcoded requireEmailVerification.

**Goal:** Implement a staging-only toggle for automated sign-up verification.

**Test Cases:**

1.  **Case:** Verify Sign-Up with `FLOWLINE_ENV=test & FLOWLINE_TEST_AUTO_VERIFY=1`
    *   **Setup:** Set environment variables. Initiate sign-up.
    *   **Assertion:** New user is marked as verified. Check `/api/test/outbox` for confirmation email.
    *   **File:** `src/lib/auth.ts`
2.  **Case:** Verify Sign-Up without Toggle (Default)
    *   **Setup:** No environment variables set. Initiate sign-up.
    *   **Assertion:** Sign-up fails due to requireEmailVerification.
    *   **File:** `src/lib/auth.ts`
3.  **Case:** Verify Toggle Disabled (Non-Test Env)
    *   **Setup:** `FLOWLINE_ENV=production`. Initiate sign-up.
    *   **Assertion:** Sign-up succeeds, email verification is enabled.
    *   **File:** `src/lib/auth.ts`
4.  **Case:** Verify Outbox Content
    *   **Setup:** `FLOWLINE_ENV=test & FLOWLINE_TEST_AUTO_VERIFY=1`. Sign-up.
    *   **Assertion:** `/api/test/outbox` contains expected verification email.
    *   **File:** `/api/test/outbox`
5.  **Case:** Edge Case - Empty Email
    *   **Setup:** `FLOWLINE_ENV=test & FLOWLINE_TEST_AUTO_VERIFY=1`. Sign-up with empty email.
    *   **Assertion:** Sign-up fails with appropriate error message.
    *   **File:** `src/lib/auth.ts`
6.  **Case:** Verify Test Sign-Up Flow
    *   **Setup:** `FLOWLINE_ENV=test & FLOWLINE_TEST_AUTO_VERIFY=1`. Sign-up. Sign-in. Create Flow.
    *   **Assertion:** End-to-end flow completes successfully.
    *   **File:** `src/lib/auth.ts` (indirectly)
7. **Case:** Verify Env Variable Absence
    * **Setup:** `FLOWLINE_ENV=production`. Initiate sign-up.
    * **Assertion:** requireEmailVerification is true.
    * **File:** `src/lib/auth.ts`

**Notes:**  Focus on verifying the staging toggle functionality and the email verification process.  Document any unexpected behavior.
