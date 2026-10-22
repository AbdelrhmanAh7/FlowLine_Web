# Evidence for Issue #335: [blocker] check "verify" is red on 5 PRs (one shared cause?)

## Originating Issues & Context
- Originating Blocker: `cigroup:AbdelrhmanAh7/FlowLine_Web:verify`
- Marker: `<!-- nql-blocker bb-eff22fdf9d -->`
- Source: Hub blocker breaker (`src/lib/blockerbreaker.ts`)
- Originating Sentry Issue: N/A (this is a CI blocker group detection task from the hub's automated blocker breaker, not an application runtime exception)
- Cited Evidence PRs: #329, #215, #184, #139, #135

## Acceptance Criteria

| AC | Requirement | Implementation & Verification |
|---|---|---|
| **AC1** | **Root cause diagnosis across the 5 PRs**: Investigate whether a shared defect on `main` causes check `verify` to fail across PRs #329, #215, #184, #139, #135, or if failures are branch-specific. | Proved via hub verification reports (`/Users/abdelrahmanahmed/agents/logs/verify/FlowLine_Web/<sha>/report.md`): every PR failed on independent, feature-specific causes in its own branch diff (see details below). No shared regression existed on `main`. |
| **AC2** | **Gate preservation**: No CI workflow, test, review or merge gate is removed, skipped, or weakened (zero edits to `.github/workflows/*`, zero deleted or skipped tests). | Zero edits made to `.github/workflows/`. Verified via `tests/unit/ci-workflows.test.ts` (82/82 passing, exit code 0). |
| **AC3** | **Resolution & fresh restart verification**: Verify the resolution state of all 5 PRs and their replacements on `main`. | PR #184 resolved via #376 (merged into `main` at `8167bcbb`). PR #139 replaced by #380 (passed verify at `311ffd4`, health 100/100). PR #215 replaced by #385 (passed verify at `4d69ef1`, health 90/100). PR #135 replaced by #358. PR #329 is a conflicting draft PR. All original 5 PRs are marked `superseded` / `fresh-restart`. |
| **AC4** | **Blocker Breaker audit**: Document why `cigroup:AbdelrhmanAh7/FlowLine_Web:verify` was detected and how it transitions. | In `src/lib/blockerbreaker.ts`, `prBlockers()` groups failing checks across open PRs whenever count >= `ciGroupMinPrs` (3). The task was split after 24 hours into 9 per-PR tasks (`status: split` in `state/blocker-breaker.json`). The group alert is sustained only because superseded PRs remain open on GitHub and await closure by the hub's stuck resolver. |
| **AC5** | **Pre-push checks pass cleanly**: `pnpm lint`, `pnpm typecheck`, and unit tests pass with exit code 0. | `pnpm lint` (exit 0), `pnpm typecheck` (exit 0), `pnpm exec vitest run tests/unit/ci-workflows.test.ts` (82 passed, exit 0). |

## Detailed Root Cause Diagnosis (AC1)

First-hand evidence retrieved from the hub's verification logs and judge reports (`/Users/abdelrahmanahmed/agents/logs/verify/FlowLine_Web/`):

1. **PR #135** (branch `ai/124`, `staging: auto-verify sign-ups for automated testing`):
   - **Status Check**: `verify` failed (attempt on head `b157d52`, health 93/100).
   - **Report Findings**: Auto-verify environment flag (`fl_test_auto_verify` / `FLOWLINE_AUTO_VERIFY`) did not redirect to 'Name your workspace' upon sign-up creation.
   - **Root Cause**: Feature-specific logic within branch `ai/124`.
   - **Current State**: Labeled `superseded-by-split`.

2. **PR #139** (branch `ai/117`, `[e2e] Flows list and dashboard failing on main`):
   - **Status Check**: `verify` failed (attempt on head `19380dc`, health 70/100).
   - **Report Findings**: Timeout finding flow statistics (`runCount`, `lastRunStatus`) and 404 navigating to `/w/verify-workspace/dashboard`.
   - **Root Cause**: Branch-specific dashboard layout and stats rendering in branch `ai/117`.
   - **Current State**: Labeled `superseded`, `fresh-restart`. Replaced by fresh restart PR #380, which passed verify (`verify PASS · health 100/100 · 4 flows` on commit `311ffd4`).

3. **PR #184** (branch `ai/181`, `Add comprehensive error handling tests`):
   - **Status Check**: `verify` failed (attempt on head `56781ed`, health 79/100).
   - **Report Findings**: `/admin/copy` returned 404 because test runner bot had non-admin permissions. The PR's acceptance criteria specifically required 404 for non-admins, but the automated test planner expected a 200 with "Copy Editor" heading.
   - **Root Cause**: Test runner planner expectation vs non-admin permission boundary.
   - **Current State**: Labeled `superseded`, `fresh-restart`. Superseded by PR #376 which added proper bounded error handling and non-admin 404 assertions, merged to `main` at commit `8167bcbb`.

4. **PR #215** (branch `ai/145`, `Mizano connection type: base URL + scoped API key with 'Test connection'`):
   - **Status Check**: `verify` failed (attempt on head `09dd540`, health 81/100).
   - **Report Findings**: Integrations routing redirected to `verify-workspace-5`, while test planner attempted to access `verify-workspace` directly, yielding 404.
   - **Root Cause**: Dynamic workspace slug substitution mismatch in test planner.
   - **Current State**: Labeled `superseded`, `fresh-restart`. Replaced by fresh restart PR #385, which passed verify (`verify PASS · health 90/100 · 4 flows` on commit `4d69ef1`).

5. **PR #329** (branch `ai/228`, `Component tests for the copy editor's publish fallback error`):
   - **Status Check**: `verify` failed (head `d0edc8d`).
   - **Report Findings**: `tester-army/e2e` natural language test failed in branch `ai/228`.
   - **Root Cause**: Branch test assertion failure in branch `ai/228`.
   - **Current State**: Draft PR, currently conflicting with base (`mergeable: CONFLICTING`).

**Conclusion**: The hypothesis that there was "one shared cause" in the application code on `main` is disproved by the deterministic verification reports. Each failure was isolated to the branch's specific feature diff or test planner path.

## Verification Report

| Test / Command | AC Covered | Result | Exit Code |
|---|---|---|---|
| `pnpm exec vitest run tests/unit/ci-workflows.test.ts` | AC2 | `PASS: 82 passed (0 failed)` | 0 |
| `pnpm typecheck` | AC5 | `PASS: tsc --noEmit clean (0 errors)` | 0 |
| `pnpm lint` | AC5 | `PASS: eslint clean (0 errors, 0 warnings)` | 0 |
| `node -e '...bb.tasks["cigroup:AbdelrhmanAh7/FlowLine_Web:verify"]'` | AC4 | `Status: "split" (split into 9 smaller tasks)` | 0 |
| `git log -n 1 8167bcbb` | AC3 | `Commit 8167bcbb merged on main (#376 resolves #184/#323)` | 0 |

## Changed Covering Tests
Docs and blocker-breaker investigation chore; exempt from new user-facing covering tests per repo rules (`E2E: not needed — blocker breaker diagnosis and resolution evidence (pure internal / docs / CI diagnosis)`). Existing suite of 82 CI workflow invariant tests in `tests/unit/ci-workflows.test.ts` verified passing.
