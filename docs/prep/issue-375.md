# Prep for #375: fix: 117-flows-list-dashboard.e2e.ts: blocker (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC2): … (split fro…

> Offline floor prep (2026-10-23T20:16Z): capacity 0 — agy: agy daily code budget (150) used; agy-med: agy daily code budget (150) used; agy-low: agy daily code budget (150) used; agy-pro: agy daily code budget (150) used. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#362 item=finding:aa2180c8c857 -->
Split from PR #362 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/362), which reached the fix-round cap (6/6) without going green. Parent issue: #295.

### Scope (one item)
- 117-flows-list-dashboard.e2e.ts: blocker (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC2): …

**blocker** (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC2): the agent asserts that "the flow list did not change", but no flow count or IDs are captured before the invalid import and compared after. Only alert visibility is checked, so a flow created despite the error would go unnoticed.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/362#discussion_r4337196672

**4 more item(s) from the parent, for the same task:**
- 117-flows-list-dashboard.e2e.ts: blocker (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC5): …: **blocker** (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC5): the test calls `setInputFiles` directly on the hidden input and never uses the visible "Upload .json file" button. It should use `page.waitForEvent('filechooser')` plus a click on the button, so the button-to-input wiring (`fi…
- 117-flows-list-dashboard.e2e.ts: blocker (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC8): …: **blocker** (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC8): the test only checks for 422 and `INVALID_FLOW`. It never asserts that the returned issues include `SETUP_REQUIRED` for the `n8n-nodes-base.set` placeholder. A run rejected for any other reason, such as a missing trigger, woul…
- access.ts: major (Claude Sonnet 5.5·medium): A placeholder wid such as {slug} or…: **major** (Claude Sonnet 5.5·medium): A placeholder wid such as `{slug}` or `slug` makes `requireWorkspace` pick the user's first membership with no ORDER BY, and then applies a write role check against it. A mis-templated API call, for example POST `/api/workspaces/{slug}/flows`, silently creates …
- layout.tsx: major (Claude Sonnet 5.5·medium): decodeURIComponent(slug) throws URI…: **major** (Claude Sonnet 5.5·medium): `decodeURIComponent(slug)` throws `URIError` on a malformed escape such as `%E0%A4%A`, turning what was a 404 into a 500. The placeholder-slug fallback is also a production workaround for a test URL. Remove it, or at least wrap the decode in try/catch.

https:/…

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #362". Keep the change small; do not reuse the parent branch `ai/295`.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.github/actions/gate-report/action.yml`
- `.github/workflows/claude.yml`
- `.gitignore`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `CLAUDE.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/template-actions.test.ts`

## Test plan (ollama:gemma3:4b)

**Issue:** 117-flows-list-dashboard.e2e.ts – Flow Creation Detection Blocker

**Test Plan:**

1.  **Test Case: Flow Creation with Error (Flow Visibility)**
    *   Setup: Simulate an invalid import (e.g., incorrect JSON format).
    *   Assertion: Verify the flow is created and visible in the dashboard despite the error.
    *   File: 117-flows-list-dashboard.e2e.ts
    *   Edge Case: Ensure the flow count and IDs are captured before the error.

2.  **Test Case: Button-Based Upload**
    *   Setup:  Ensure the "Upload .json file" button is present.
    *   Assertion: Verify the test uses the button to trigger the file upload, not direct input manipulation.
    *   File: 117-flows-list-dashboard.e2e.ts
    *   Edge Case: Test with various file types and sizes.

3.  **Test Case: `SETUP_REQUIRED` Assertion**
    *   Setup: Create a flow that triggers an error (e.g., missing trigger).
    *   Assertion: Verify the returned issues include the `SETUP_REQUIRED` error code.
    *   File: 117-flows-list-dashboard.e2e.ts
    *   Edge Case: Test with different error scenarios.

4.  **Test Case: Placeholder Slug Validation**
    *   Setup:  Use a malformed slug (e.g., `%E0%A4%A`).
    *   Assertion: Verify the `decodeURIComponent` call handles the error gracefully (no 500).
    *   File: layout.tsx
    *   Edge Case: Test with a variety of invalid URL encodings.

5.  **Test Case: Basic Flow Creation (Success)**
    *   Setup: Create a valid flow using the UI.
    *   Assertion: Verify the flow appears in the dashboard with the correct count and ID.
    *   File: 117-flows-list-dashboard.e2e.ts
    *   Edge Case: Test with different flow configurations.

6. **Test Case: Flow Deletion**
    * Setup: Create a flow.
    * Assertion: Verify the flow is removed from the dashboard.
    * File: 117-flows-list-dashboard.e2e.ts
    * Edge Case: Test with different flow configurations.

7. **Test Case:  Empty Flow Upload**
    * Setup: Upload an empty JSON file.
    * Assertion: Verify the flow is created with a zero count.
    * File: 117-flows-list-dashboard.e2e.ts
    * Edge Case: Test with different file types and sizes.
