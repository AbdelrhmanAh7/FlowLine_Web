# Prep for #426: fix: middleware.ts: src/middleware.ts:41: The middleware incorrectly handles malformed UR… (split from #380)

> Offline floor prep (2026-10-24T12:45Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#380 item=finding:45f564509e4b -->
Split from PR #380 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/380), which reached the fix-round cap (6/6) without going green. Parent issue: #375.

### Scope (one item)
- middleware.ts: src/middleware.ts:41: The middleware incorrectly handles malformed UR…

src/middleware.ts:41: The middleware incorrectly handles malformed URI escapes in search parameters. It only checks if request.nextUrl.search exists but doesn't actually decode it, leaving potential security holes with malformed percent-encoded characters in query strings.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/380#issuecomment-6318665142

**4 more item(s) from the parent, for the same task:**
- qa finding: src/app/w/[slug]/layout.tsx:17: The layout.tsx file uses try/catch fo…: src/app/w/[slug]/layout.tsx:17: The layout.tsx file uses try/catch for decodeURIComponent but calls notFound() on any error, including valid URIs with special characters that might be legitimately part of a workspace slug. This could prevent legitimate users from accessing their workspaces.

https:…
- 117-flows-list-dashboard.e2e.ts: e2e-army/117-flows-list-dashboard.e2e.ts:144: The test claims to be a…: e2e-army/117-flows-list-dashboard.e2e.ts:144: The test claims to be a substitute for the unmerged n8n import test, but it doesn't actually test the n8n import functionality. It only tests flow creation via API endpoints, which doesn't verify the original issue about flow list invariance during impo…
- access.ts: src/server/access.ts:56: The requireWorkspace function still has pote…: src/server/access.ts:56: The requireWorkspace function still has potential issues with isPlaceholderSlug check as it's imported from a new module without proper validation of the import itself. This could lead to undefined behavior if the import fails.

https://github.com/AbdelrhmanAh7/FlowLine_Web…
- flows-list-ac2-guard.test.ts: tests/unit/flows-list-ac2-guard.test.ts:9: The unit test file is ment…: tests/unit/flows-list-ac2-guard.test.ts:9: The unit test file is mentioned in the diff but not fully shown, making it impossible to verify the implementation of the 'analyzeFlowInvarianceAssertion' function that supposedly guards against historical test patterns.

https://github.com/AbdelrhmanAh7/F…

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #380". Keep the change small; do not reuse the parent branch `ai/375`.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.github/actions/gate-report/action.yml`
- `.github/workflows/gate.yml`
- `.husky/pre-push`
- `AGENTS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/gate-cceeb5d/webkit-attempt1-failure/error-context.md`
- `artifacts/ai-hub/gate-e1a479b/chromium-attempt1-failure/error-context.md`
- `artifacts/ai-hub/research/providers-2026-09-29.md`
- `artifacts/ai-hub/wavec-84f2cc1/BUGS.md`
- `artifacts/ai-hub/wavec-84f2cc1/CODEX-RETEST-cceeb5d.md`
- `artifacts/ai-hub/wavec-84f2cc1/CODEX-RETEST2-f74a5a1.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/template-actions.test.ts`

## Test plan (ollama:gemma3:4b)

**Test Plan: Malformed URI Escapes in Middleware**

**Issue:** `middleware.ts` incorrectly handles malformed URI escapes in search parameters.

**Goal:** Verify correct decoding of URI escapes and prevent security vulnerabilities.

**Test Cases:**

1.  **Test Case:** Invalid URI Escape - “%20%20”
    *   **File:** `middleware.ts`
    *   **Setup:** Send a request with a search parameter containing multiple consecutive percent-encoded spaces.
    *   **Assertion:** The middleware correctly decodes the spaces and the URL is processed as expected. No security vulnerability is exposed.

2.  **Test Case:** Invalid URI Escape - “%25”
    *   **File:** `middleware.ts`
    *   **Setup:** Send a request with a search parameter containing a single percent-encoded percent sign.
    *   **Assertion:** The middleware correctly decodes the percent sign and the URL is processed as expected.

3.  **Test Case:** Invalid URI Escape - “%26”
    *   **File:** `middleware.ts`
    *   **Setup:** Send a request with a search parameter containing a single percent-encoded ampersand.
    *   **Assertion:** The middleware correctly decodes the ampersand and the URL is processed as expected.

4.  **Test Case:** Mixed Invalid Escapes - “%25%26”
    *   **File:** `middleware.ts`
    *   **Setup:** Send a request with a search parameter containing a percent-encoded percent sign followed by an ampersand.
    *   **Assertion:** The middleware correctly decodes both characters and the URL is processed as expected.

5.  **Test Case:**  Large Number of Invalid Escapes - “%25%25%25%25” (Repeated 4 times)
    *   **File:** `middleware.ts`
    *   **Setup:** Send a request with a search parameter containing a large number of consecutive percent-encoded percent signs.
    *   **Assertion:** The middleware correctly decodes all the percent signs and the URL is processed as expected.

6.  **Test Case:** Valid URI Escape - “%21”
    *   **File:** `middleware.ts`
    *   **Setup:** Send a request with a search parameter containing a single percent-encoded exclamation mark.
    *   **Assertion:** The middleware correctly decodes the exclamation mark and the URL is processed as expected.

7.  **Test Case:**  Empty Search Parameter - ""
    *   **File:** `middleware.ts`
    *   **Setup:** Send a request with an empty search parameter.
    *   **Assertion:** The middleware correctly handles the empty search parameter and the URL is processed as expected.

8.  **Test Case:**  Whitespace Search Parameter - “ “
    *   **File:** `middleware.ts`
    *   **Setup:** Send a request with a search parameter containing only whitespace.
    *   **Assertion:** The middleware correctly handles the whitespace search parameter and the URL is processed as expected.

9. **Test Case:** Complex URI Escape - "%26%24%25"
    *   **File:** `middleware.ts`
    *   **Setup:** Send a request with a search parameter containing a complex combination of URI escapes.
    *   **Assertion:** The middleware correctly decodes all characters and the URL is processed as expected.

10. **Test Case:** Boundary Case - URL with Valid Characters
    *   **File:** `middleware.ts`
    *   **Setup:** Send a request with a URL containing a mix of valid and invalid URI escapes.
    *   **Assertion:** The middleware correctly decodes the valid URI escapes and ignores the invalid ones, preventing potential vulnerabilities.
