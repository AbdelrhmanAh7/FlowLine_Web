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

### Functions do not exist in this repo

The brief asks for unit tests of `selectEngineByScore` and `selectFreeEndpoint` in `src/ai/hub/selection.ts` (or elsewhere under `src/ai/hub`). Neither name exists anywhere in this repository:

```
$ grep -rn "selectEngineByScore\|selectFreeEndpoint" src tests
$ echo $?
1
```

(no output, exit 1 — no match).

The actual exports of `src/ai/hub/selection.ts` are:

| Export | Purpose |
|--------|---------|
| `assertRouteSelection` | Selection-time role check for AI routes on a saved graph |
| `assertRoutesUsable` | Checks connections exist, are not revoked and the role may use them |
| `pinDefaultRoutes` | Writes the workspace default route into a published snapshot |
| `aiRoutesIn` | Lists the valid routes referenced by AI steps |

`pinDefaultRoutes` is already covered at `tests/unit/ai-hub.test.ts:80`. Because the brief's two functions do not exist, no test can import them without inventing them (which the brief forbids: "Don't make up these functions or write stubs").

### Proposed Replacement Acceptance Check

The original acceptance grep looks for a `selection.spec` file, but vitest only collects `tests/unit/**/*.test.ts` (`vitest.config.mts:10`), so `selection.spec` can never match the include pattern and the check cannot pass:

```
npx tsc --noEmit && npm test -- --listTests | grep selection.spec
```

`--listTests` is a Jest-only flag, and vitest does not collect `*.spec.ts` under `tests/unit/`.

**Proposed replacement:**

```
npx tsc --noEmit && npx vitest run tests/unit/ai-hub-selection.test.ts
```

### Proposed Work

Keep `tests/unit/ai-hub-selection.test.ts` (it already covers `aiRoutesIn`, `assertRouteSelection` and `assertRoutesUsable`; the no-op / legacy-`model` branches of `pinDefaultRoutes` could be added) and change the acceptance check to the replacement above. If the intent really was `selectEngineByScore` / `selectFreeEndpoint`, this issue likely belongs in the hub repo (`nql-agents`), not `FlowLine_Web`.

### Notes

- No e2e-army test needed: this change only adds unit tests (pure test addition)
- PR description should include: `E2E: not needed — unit tests only`
- PR description should include: `Docs not needed because: test-only change`
- Does not modify any `src/` file — tests only