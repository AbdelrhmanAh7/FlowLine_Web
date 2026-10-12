# AI_QUESTIONS.md

## Issue #173: Add unit tests for hub transport

### Name Mismatch

The issue brief mentions testing functions that don't exist in `src/ai/hub/transport.ts`:

| Issue mentions | Actual export | Notes |
|----------------|---------------|-------|
| `createRequest` | `assertAllowedUrl` + `providerHeaders` | Validates URL against allowlist, builds headers |
| `executeRequest` | `hubFetch` | Main fetch function with error mapping |
| `handleResponse` | (part of `hubFetch`) | Error mapping: EGRESS_TOO_MANY_REDIRECTS→AI_REDIRECT_REFUSED, TimeoutError→AI_TIMEOUT, other→AI_UNAVAILABLE |

The tests cover the actual exported functions with the same behavioral coverage.

### Proposed Replacement Acceptance Check

The original acceptance criterion uses a Jest flag that doesn't exist in vitest:

```
npx tsc --noEmit && npm test -- --listTests | grep transport.spec
```

**Proposed replacement:**

```
npx tsc --noEmit && npx vitest list --project unit | grep transport
```

This verifies:
1. TypeScript compiles without errors
2. The transport test file is discovered by vitest's unit project
3. All transport-related tests are listed

### Test Coverage Summary

Created `tests/unit/ai-hub-transport.test.ts` with 19 tests covering:

**assertAllowedUrl (createRequest equivalent)** - 6 tests:
- Accepts allowlisted https host
- Refuses http
- Refuses IP address hosts
- Refuses credentials in URL
- Refuses unknown hosts
- Works with dashscope placeholder hosts

**providerHeaders** - 3 tests:
- Keeps provider's fixed static headers (anthropic-version)
- Adds header-mapped connection fields (OpenAI-Organization, OpenAI-Project)
- Does not add headers for empty/missing fields

**hubFetch (executeRequest equivalent)** - 8 tests:
- Calls safeFetch with correct URL, auth header, maxRedirects: 0, JSON body
- Uses fromOrigin to resolve against origin instead of base URL
- Maps EGRESS_TOO_MANY_REDIRECTS → AI_REDIRECT_REFUSED
- Maps TimeoutError → AI_TIMEOUT (retryable, possibleCharge)
- Maps AbortError → AI_TIMEOUT (retryable, possibleCharge)
- Maps other errors → AI_UNAVAILABLE (retryable)
- Maps EGRESS_TOO_LARGE → AI_RESPONSE_TOO_LARGE (possibleCharge)
- Maps other EgressError codes → AI_EGRESS_BLOCKED

**resolveBaseUrl and resolveOrigin** - 2 tests:
- Returns documented base URL without trailing slash
- Fills dashscope placeholders from settings

### Notes

- No e2e-army test needed: this change only adds unit tests (pure test addition)
- PR description should include: `E2E: not needed — unit tests only`
- File named `*.test.ts` (not `*.spec.ts`) to match vitest conventions
- Does not modify `transport.ts` — tests only
- Uses real providers from `getProviderDef` as specified in the manager plan

## Issue #160: GitHub security settings — blocked, owner action required

The brief explicitly says these repository settings require owner access and cannot be changed by engineers under the secrets-settings hard rule. No settings were changed or inspected; all three acceptance criteria remain unverified. This handoff does not complete #160.

Read-only verification on 2026-10-12: `gh issue view 160 --repo AbdelrhmanAh7/FlowLine_Web --json number,title,body,comments,labels,milestone,state,url` confirmed the issue is open, labelled `post-pilot` / `priority:p2`, in milestone `FL G6 · Post-pilot hardening: concurrency and quality`. The [owner's scope-cut comment](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/160#issuecomment-6113889098) defers it until after the pilot; reactivation requires re-adding the `pilot` label.

Owner follow-up after reactivation:

- AC1: enable secret scanning **and** push protection in Settings → Code security; record both enabled states.
- AC2: enable Dependabot alerts; record the enabled state.
- AC3: enable Copilot code review in Settings → Copilot; confirm it reviews a PR as a second reviewer alongside CodeRabbit, and record the review link. Keep the existing CodeRabbit confirmation requirement.

Can the owner perform these actions and record dated, non-sensitive evidence on #160 when it is reactivated? Do not include secrets or alert payloads in evidence, and do not authorize spending through this handoff.

Harness PR description: `Refs #160`. Keep the issue open for owner verification; merging this handoff must not close it. `E2E: not needed — documentation-only owner handoff; no application UI, API or job behaviour changes.` No e2e-army test applies. No CI/workflow, security configuration or dependency changes belong in this blocked task; separate documentation work remains under #161.
