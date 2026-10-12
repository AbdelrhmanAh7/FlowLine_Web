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
## Issue #205: merge order (stacked on #204 / PR #207)

The brief says to start after the gate-fix PR merges, or to work independently if no files overlap. PR #207 (#204) has not merged. The files overlap: the backfill needs #207's migration `0025_flow_version_run_unnumbered` (`flow_version.version` nullable), the `schema.ts` change and the next journal slot. So `ai/205` was fast-forwarded onto `origin/ai/204` (`f5c2eaa`), and the #205 work is the two commits on top (`e75e741` test, `cc52740` migration).

- Merge PR #207 first. Before then, a PR from `ai/205` into `main` also shows #204's diff. Retarget it to `ai/204`, or wait for #207.
- After #207 is squash-merged, rebase with `git rebase --onto origin/main f5c2eaa ai/205`. If #207 changes its 0025 migration or journal entry before merging, regenerate `drizzle/meta/0026_snapshot.json` and `_journal.json` (`pnpm db:generate`) and keep the hand edits in `0026_flow_version_run_backfill.sql`.
- Question for the owner: should the reverse step (`drizzle/reverse/0026_flow_version_run_backfill.sql`, run by hand) stay outside the drizzle journal? The project has no down migrations (rollback = previous image on the newer schema), so it was not wired into `src/db/migrate.ts`.
