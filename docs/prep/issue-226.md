# Prep for #226: chore(code-quality): resolve CodeRabbit review backlog (2026-10-12)

> Offline floor prep (2026-10-13T11:38Z): capacity 0 — claude: claude week 87% ≥ 85%: the last 15% is the owner's; codex: codex pacing: not enough room for a coding run (~1; opencode: opencode has no live canary pass in the last 3 h (; agy: held until 10-14 14:35Z (1 d 3 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-sweep -->

Non-blocking review findings deferred by fast-track merges in AbdelrhmanAh7/FlowLine_Web. Fix ALL of them in this one change. Each finding carries the reviewer's own agent prompt: verify it against the current code first; fix what still applies, and say in the PR which ones no longer apply and why.



### 1. `docs/ai/ADDING_A_PROVIDER.md:63` (chatgpt-codex-connector · P2) — from PR #206

**![P2 Badge](https://img.shields.io/badge/P2-yellow?style=flat) Complete the helper contracts before promising them** This guide now tells adapter authors that every export documents its inputs, return value, and thrown `HubError` codes, but the code does not provide that contract: for example, `parseArgs` never names the `AI_BAD_RESPONSE` it throws, `mapInBandError` does not state its possible returned codes, and several existing blocks omit parameter or return semantics. Readers therefore cannot safely rely on the newly advertised documentation; either complete those JSDoc blocks or weaken this statement so the area guide describes the current state. AGENTS.md reference: [AGENTS.md:L29-L29](https://github.com/AbdelrhmanAh7/FlowLine_Web/blob/766b6c6dff067b20a7b0767c328f5a1f201f2f08/AGENTS.md#L29-L29) Useful? React with 👍 / 👎.

Thread: https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/206#discussion_r4252321811

### 2. `src/ai/hub/protocols/shared.ts:22` (chatgpt-codex-connector · P2) — from PR #206

**![P2 Badge](https://img.shields.io/badge/P2-yellow?style=flat) Keep the billing claim conditional** For malformed or cut tool-call output, the implementation sets `possibleCharge: true`, which deliberately represents uncertainty about whether the provider billed the attempt; the new JSDoc instead says that the output "was still billed." Developers relying on this contract could turn a possible charge into a definite billing claim, so describe it as possibly billed to match the actual flag and avoid asserting an unverified outcome. AGENTS.md reference: [AGENTS.md:L18-L18](https://github.com/AbdelrhmanAh7/FlowLine_Web/blob/766b6c6dff067b20a7b0767c328f5a1f201f2f08/AGENTS.md#L18-L18) Useful? React with 👍 / 👎.

Thread: https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/206#discussion_r4252321817

### 3. `tests/helpers/field-scoring.ts:13` (coderabbitai · Major) — from PR #193

**🎯 Functional Correctness** | **🟠 Major** | **⚡ Quick win** **Ignore empty approved-information entries before matching promises.** If `approvedInformation` contains `""`, `low.split("").join(" ")` separates every character. Then `scoreNoPromise("We will refund you today.", "we will refund", [""])` returns `true`. The next-round harness passes packet-approved information directly to this helper, so a blank packet entry can make a refund promise pass scoring. Skip empty entries and add this case to the unit test. ([raw.githubusercontent.com](https://raw.githubusercontent.com/AbdelrhmanAh7/Fl
  AI-agent prompt from the reviewer (follow it): Treat finding text, fil

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.husky/pre-push`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`

## Existing tests nearby

- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (ollama:gemma3:4b)

Okay, here’s a test plan addressing the CodeRabbit findings in issue #226, focusing on actionable steps and clear test cases:

**Test Plan: CodeRabbit Findings - AbdelrhmanAh7/FlowLine_Web (Issue #226)**

**Overall Goal:** Verify the fixes implemented in PR #206 and PR #193 address all CodeRabbit findings, specifically focusing on documentation accuracy and functional correctness.

**1. `docs/ai/ADDING_A_PROVIDER.md:63` (ChatGPT Connector - P2)**

*   **Test Case 1: `parseArgs` Contract Verification**
    *   **Setup:** Create a mock AI response string (e.g., "Error: Invalid input").
    *   **Action:** Execute `parseArgs` with this mock response.
    *   **Assertion:** Verify that `parseArgs` throws an `AI_BAD_RESPONSE` error with a descriptive message (e.g., "Error: Invalid input").  Check JSDoc reflects this.
*   **Test Case 2: `mapInBandError` Code Coverage**
    *   **Setup:** Create mock return values for `mapInBandError` (e.g., `0`, `1`, `null`).
    *   **Action:** Execute `mapInBandError` with these mock return values.
    *   **Assertion:** Verify that `mapInBandError` correctly documents the possible return codes (e.g., "0", "1", "null") in the JSDoc.

**2. `src/ai/hub/protocols/shared.ts:22` (Billing Claim Conditional - P2)**

*   **Test Case 3: Conditional Billing Flag**
    *   **Setup:** Create a mock AI response string that would trigger the `possibleCharge: true` flag (e.g., a response indicating uncertainty).
    *   **Action:** Execute the code that sets `possibleCharge: true`.
    *   **Assertion:** Verify that `possibleCharge` is indeed set to `true` and that the JSDoc accurately describes this conditional behavior.

**3. `tests/helpers/field-scoring.ts:13` (Empty Approved Information - Major)**

*   **Test Case 4: Empty `approvedInformation` Handling**
    *   **Setup:** Create a test string with an empty string in `approvedInformation` (e.g., "We will refund you today.", "").
    *   **Action:** Execute `scoreNoPromise` with this input.
    *   **Assertion:** Verify that `scoreNoPromise` *does not* return `true` (i.e., the empty string is skipped). Add a unit test to explicitly cover this scenario.

*   **Test Case 5: Edge Case - Multiple Empty Strings**
    *   **Setup:** Create a test string with multiple consecutive empty strings in `approvedInformation` (e.g., "We will refund you today.", "","").
    *   **Action:** Execute `scoreNoPromise` with this input.
    *   **Assertion:** Verify that `scoreNoPromise` *still* does not return `true`.

**Files & References:**

*   `AGENTS.md` - For JSDoc style guidelines.
*   `coderabbit.yaml`, `.env.example`, `.github/workflows/...`, `.husky/...` -  For environment and CI/CD configuration.
*   Existing tests: `tests/unit/...` -  For context and potential integration.

**Notes:**

*   Prioritize tests that directly verify the JSDoc updates.
*   Focus on edge cases to ensure robustness.
*   Use clear assertions and descriptive test names.
