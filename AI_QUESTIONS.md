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
4. PR #209 said `Closes #110`, which would have closed the hub's pilot-plan tracker on merge before its checklist was done. Fixed on 2026-10-12 (fix-review round 1): the first line of the PR body now says `Refs #110`, and `gh pr view 209 --json closingIssuesReferences` returns `[]`. The branch's commit messages only use `Refs #110`, so a squash merge does not close it either. The harness wrote `Closes #N` itself; if it regenerates the body, it must keep `Refs #110` for this tracker (see `docs/GITHUB_WORKFLOW.md`). Should the harness use `Refs #N` for every hub tracker issue (`<!-- nql-pilot-plan -->`)?

## Issue #221: [e2e] Accounts, sessions and request safety (`fl-auth-api`) failing on main

**Finding: the product is not broken. The failure comes from the hub running the same shard twice on one stack, so no change to this repo can fix it.**

Evidence (hub log `~/agents/logs/stable/FlowLine_Web/2026-10-12/e2e-army.log`, stack `http://localhost:4316`, `main` @ `2ca60e5`):

1. **First pass, 21:13 (fresh DB):** `[fl-auth-api.1]` to `.5` **all pass** (log lines 57-61), and so do `fl-email-flows.2/.3`, `fl-beta-access.2`, `fl-onboarding.1`, `fl-workspaces.1` and `fl-members.1`.
2. **Second pass, 21:57, same stack and DB, same `E2E_ARMY_SEED`:** the `core-api` shard runs again (log lines 476-560). Every test that creates a fixed-seed account now fails, because that account was already created and verified in pass 1:
   - `fl-auth-api.1` signs up `seededEmail("auth-api-1")` again. The product answers 200 with `token: null` (no account enumeration). The account is already verified, so the "early" sign-in returns 200 instead of 403. That is correct behaviour for a verified account.
   - `fl-email-flows.2` / `fl-onboarding.1`: `verify failed: {"status":"used"}`, because the newest verify mail is the one already used in pass 1.
   - `fl-email-flows.3`: `[429,429,429]`, because the per-address rate limit was already used up in pass 1.
   - `fl-workspaces.1`: the slug is `…-4` where `…-3-2` was expected, and `fl-members.1` gets 409 (invite exists). The UI shards show the same DB reuse: workspace slugs `ui-ai-1-b332d-2` etc. (lines 689-703).
3. **Why pass 2 ran:** `src/jobs/stable.ts` (hub, ~line 189-197) has a quota fallback. When some tests hit a model-quota error (the report note says `quota fallback: agy → model gemini-3.5-flash`), it re-runs every invocation whose *features* overlap the hit tests. That is the whole `core-api` shard, because it holds `fl-email-flows.*` too. It runs on the **same stack with the same seed**, and `outcomes` takes the re-run's results over pass 1's passes.
4. **Why the failure was "confirmed":** `confirmFailures` (`src/jobs/e2eregress.ts:56`) passes `envBase: env({})` without `E2E_ARMY_STAGE: "next"`. Every confirm run then failed with `configuration error NO_TESTS … no test file matched tests-dev/FlowLine_Web` (`confirm/e2e-army.log`), so the failures were kept.

**Needed fix (hub repo `nql-agents`, not FlowLine_Web; I can't edit it from this lane):**
- Run the quota-fallback re-run (and the confirm run) with a per-pass seed, e.g. `E2E_ARMY_SEED=<base>-r2`, or on a fresh DB. Alternatively, re-run only the tests that hit the quota (`--grep`), not whole shards, and never let a re-run's result replace a pass-1 pass for a test that did not hit the quota.
- Pass `E2E_ARMY_STAGE: "next"` to `confirmFailures` when the stable job ran the staged suite, so confirmation actually runs.

**Question for the owner/CTO:** may the hub fix above go in as a hub-side task? Once it lands, the next stable run should turn `fl-auth-api` green (and the same-cause failures in `fl-email-flows`, `fl-beta-access`, `fl-onboarding`, `fl-workspaces` and `fl-members`) with no FlowLine change. Per the rule "Fix the product, never weaken the test", I changed no product code and no test here. No e2e-army test was added because no user-facing flow changes in this repo.
