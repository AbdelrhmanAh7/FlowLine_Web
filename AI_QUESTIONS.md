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
