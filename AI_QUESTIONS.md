# Issue #250: Review of merged CI PRs against QA checklist

## PR #81: ci(gate): run the product CI on GitHub-hosted runners again (5-minute jobs, split checks) — Merge commit d211653

**Status:** ✅ PASS on all checklist items

### QA Checklist Results

| Item | Status | Details |
|------|--------|---------|
| Actions pinned by commit SHA | ✅ PASS | gate.yml: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 (v7.0.1)<br>gate-report: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a (v7.0.1) |
| ubuntu-24.04 runners | ✅ PASS | All jobs use `runs-on: ubuntu-24.04` |
| No self-hosted labels | ✅ PASS | No `[self-hosted]` in gate.yml |
| No secrets beyond GITHUB_TOKEN in gate.yml | ✅ PASS | Only `github.token` used; no secrets.* refs |
| timeout-minutes: 5 on every fast-tier job | ✅ PASS | changes (line 42), checks (line 99), chromium (line 159), gate (line 262) all have `timeout-minutes: 5` |
| Least-privilege permissions: | ✅ PASS | `permissions: contents: read` (line 19)<br>changes job: `contents: read, pull-requests: read` (lines 44-45)<br>checks/chromium/firefox/webkit: only `contents: read` (no pull-requests) |
| No pull_request_target checkout of untrusted code | ✅ PASS | Uses `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` with `fetch-depth: 1` and `persist-credentials: false` (lines 49-51, 112-114) |
| gate.yml stays inert without its secret | N/A | gate.yml is a CI configuration, not a Claude Action workflow |

### Findings
None. The PR correctly implements the 5-minute job split, proper permissions, and runner configuration.

---

## PR #83: ci: Claude on GitHub via claude-code-action (Max subscription, inert until secret) — Merge commit d000b86

**Status:** ✅ PASS on all checklist items

### QA Checklist Results

| Item | Status | Details |
|------|--------|---------|
| Actions pinned by commit SHA | ✅ PASS | claude-code-action@6fed3ca145920b639991cb756090506e1bcaf515 (v1.0.245) |
| ubuntu-24.04 runners | ✅ PASS | Both jobs use `runs-on: ubuntu-24.04` (lines 38, 111) |
| No self-hosted labels | ✅ PASS | No `[self-hosted]` in claude.yml |
| No secrets beyond GITHUB_TOKEN in gate.yml | N/A | Not applicable (this is claude.yml, not gate.yml) |
| timeout-minutes: 5 on every fast-tier job | N/A | Not applicable (Claude jobs are 10 minutes, not 5) |
| Least-privilege permissions: | ✅ PASS | claude job: `contents: write, pull-requests: write, issues: write, id-token: write, actions: read` (lines 43-48)<br>review job: `contents: read, pull-requests: write, issues: write, id-token: write, actions: read` (lines 116-121)<br>Both jobs gate on write access and repo ownership (lines 64-69, 128-129) |
| No pull_request_target checkout of untrusted code | ✅ PASS | Uses `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` with `fetch-depth: 1` (lines 92, 133) |
| Claude workflow stays inert without its secret | ✅ PASS | Both jobs check `HAS_TOKEN` (line 51, 123) and skip when unset (lines 63, 129) |

### Findings
None. The workflow correctly stays inert when the secret is missing and only runs for the owner's repo with write access.

---

## PR #87: ci: Claude Action review skips the hub's own ai/* PRs — Merge commit efa3ef0

**Status:** ✅ PASS on all checklist items

### QA Checklist Results

| Item | Status | Details |
|------|--------|---------|
| Actions pinned by commit SHA | ✅ PASS | Same claude-code-action@6fed3ca145920b639991cb756090506e1bcaf515 (v1.0.245) |
| ubuntu-24.04 runners | ✅ PASS | Same as PR #83 (line 111) |
| No self-hosted labels | ✅ PASS | Same as PR #83 |
| No secrets beyond GITHUB_TOKEN in gate.yml | N/A | Not applicable |
| timeout-minutes: 5 on every fast-tier job | N/A | Not applicable |
| Least-privilege permissions: | ✅ PASS | Same as PR #83 |
| No pull_request_target checkout of untrusted code | ✅ PASS | Same as PR #83 |
| Claude workflow stays inert without its secret | ✅ PASS | Same as PR #83 |
| Review job skips ai/* PRs | ✅ PASS | Added `!startsWith(github.event.pull_request.head.ref, 'ai/')` condition (line 110) |

### Findings
None. The PR correctly filters out the hub's own AI PRs from review, preventing redundant reviews.

---

## Summary

All three merged CI PRs pass the QA checklist items. No fixes are needed.

**Files reviewed:**
- PR #81: `.github/workflows/gate.yml`, `.github/actions/gate-report/action.yml`, `scripts/ci/integration-shard.mjs`, `tests/unit/ci-workflows.test.ts`
- PR #83 & #87: `.github/workflows/claude.yml`, `tests/unit/ci-workflows.test.ts`

**Current state (main):** All files are present and match the expected structure from the merged PRs. No regressions detected.
# AI questions / notes

## 2026-10-15 — hub e2e-army file cap reached (recorded, not a blocker)

The hub's verify job copies only the first 8 top-level `e2e-army/*.e2e.ts` files of a branch
(`readdirSync(e2e-army).filter(/^[\w.-]+\.e2e\.ts$/).slice(0, 8)` in `nql-agents src/lib/e2earmy.ts`),
and `tests/unit/e2e-army-tooling.test.ts` asserts the repo stays within that cap.

`main` now sits exactly at 8 files (#221 added `e2e-army/221-auth-isolation.e2e.ts`), so the required
#166 test (`e2e-army/166-mena-template.e2e.ts`) is the ninth and the cap guard fails on any fresh CI run
of the PR. Since the hub cannot run the ninth file, the repo has to stay at 8.

**Suggestion for the owner (hub-side, not changed here):** raise the hub cap above 8, or make the hub run
every `e2e-army/*.e2e.ts` file, so a new feature test no longer silently evicts the alphabetically last one.
Until then, #166 keeps the repo at 8 by merging the two same-route platform-admin API tests (#179 into
`e2e-army/200-route-error-headers.e2e.ts`); every test and tag is kept. See that file's header.
