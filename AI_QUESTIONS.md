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
## Issue #110: Pilot plan → 2026-10-16 (no implementation possible in one PR)

Checked on 2026-10-12 on branch `ai/110` at `b1023c9` (same as `origin/main`, so the branch had no earlier commits). No code was changed and no e2e-army test was added.

### Why this issue cannot be done as an implementation PR

#110 is the hub's generated pilot-plan tracker (`<!-- nql-pilot-plan -->`). Its body says it is "refreshed daily; the checklist ticks itself when the step's evidence exists". Each unchecked item belongs to someone else, or is already tracked by its own issue:

| Checklist item | Owner named in the plan | Why it does not belong in this PR |
|---|---|---|
| 2026-10-12: #60 #62 #63 closed, main CI green | dispatch + engineers + automerge | #62 (Dependabot high alert) is still open as its own issue. Fixing it here would bundle a second issue, which the one-task-per-PR rule forbids. |
| 2026-10-14: first `stable-YYYY-MM-DD` tag, 25/25 pilot features green | hub job `stable` (20:00 Riyadh) | Tagging, fast-forwarding `stable` and deploying staging are hub and owner actions. Agents do not push, tag or deploy. |
| 2026-10-15: #103 #68 closed, 25/25 pilot features covered by e2e | dispatch + e2eregress | #103 (CSV column order) and #68 (restore/rollback runbook) are separate issues. Covering 25 features with e2e is far larger than one ~300-line PR. Coverage tests live in the hub suite (`ops/verify/e2e-army/tests/FlowLine_Web/`) in `nql-agents`, not in this repo. |
| 2026-11-06: 5 pilot users invited, 3 signed in | owner (`scripts/beta/create-code.mts`) | Real invitations are owner-only (AGENTS.md constitution, article 7). |
| 2026-11-06: story video (EN+AR) on the landing page | Claude (tools/story-video), #137 | Tracked by #137. |
| 2026-11-13: week-1 review with measured numbers | owner + hub CEO brief | Needs real pilot usage data. |

### Questions for the owner / dispatcher

1. Should #110 be removed from the engineer dispatch queue (for example with a `tracking` or `owner-only` label)? It is a status issue that the hub closes itself.
2. If you want e2e coverage of the 25 pilot features from this repo, which features should be split into separate issues? Ideally one issue per feature (or small group), each with its own acceptance criterion, so each can be one ~100–300-line PR with an `e2e-army/<issue>-<flow>.e2e.ts` test tagged `feat:<id>`.
3. No test was added because the issue has no user-facing acceptance criterion of its own. A PR for this branch would contain only this note. Its description should state `E2E: not needed — tracking issue, no product change`.
