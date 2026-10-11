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
## Issue #174: Add unit tests for hub selection

### The named functions do not exist

`selectEngineByScore` and `selectFreeEndpoint` are not in `src/ai/hub/selection.ts`, anywhere else in the repo, or in its
git history (`git log --all -S selectEngineByScore` is empty). The planner made up the names, so no test can import them.
That is the root cause of the QA finding "tests never exercise the required functions". The real exports are
`assertRouteSelection`, `assertRoutesUsable`, `pinDefaultRoutes` and `aiRoutesIn`. As with #173, the tests cover those.

### What changed (rework of PR #183)

- Removed `src/ai/hub/selection.spec.ts` (231 lines). It sat outside the vitest `unit` include (`tests/unit/**/*.test.ts`), so it
  never ran. Its db mock also didn't match drizzle's `select().from().where()` call shape.
- Added `tests/unit/ai-hub-selection.test.ts` (9 tests, under 70 lines). It uses a fake db with the same call chain as drizzle.
  It covers: connection missing, revoked or not allowed for the role; an empty route list makes no query;
  unchanged routes are not re-checked; only new or changed routes are checked; `aiRoutesIn` skips bad routes.
  `pinDefaultRoutes` is already covered in `tests/unit/ai-hub.test.ts`.
- Mutation check: turning off the REVOKED check or the "changed routes only" filter makes 2 tests fail.

### Replacement acceptance check

`npm test -- --listTests` is a Jest flag; this repo uses vitest. Use instead:
`npx tsc --noEmit && npx vitest list --project unit tests/unit/ai-hub-selection.test.ts`.

### Question for the owner

Should a selection helper by score or for free endpoints exist? If so, it needs its own feature issue with a spec. These tests
cover only what exists. E2E: not needed, because this change adds unit tests only and does not change any behaviour.
