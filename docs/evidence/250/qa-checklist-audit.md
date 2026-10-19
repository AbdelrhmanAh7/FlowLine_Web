# QA Checklist Audit Report: PRs #81, #83, #87 (Issue #250)

Inspected `main` commit SHA: `264336fb58265d2961c101591db1223855105dbd`  
Checker script: `scripts/ci/qa-checklist.mjs`

---

## 1. Overview of Evaluated PRs

| PR | Title | Merge Commit | Files Touched |
|---|---|---|---|
| #81 | `ci(gate): run the product CI on GitHub-hosted runners again (5-minute jobs, split checks)` | `d21165358834594b5ed56de61ab5a2139c8e7230` | `.github/workflows/gate.yml`, `.github/actions/gate-report/action.yml`, `scripts/ci/integration-shard.mjs`, `tests/unit/ci-integration-shard.test.ts`, `tests/unit/ci-workflows.test.ts`, docs |
| #83 | `ci: Claude on GitHub via claude-code-action (Max subscription, inert until secret)` | `d000b8635490757c723620ba99dec9c25dbc955a` | `.github/workflows/claude.yml`, `tests/unit/ci-workflows.test.ts` |
| #87 | `ci: Claude Action review skips the hub's own ai/* PRs` | `efa3ef08720e39b7bde0e086c80364f753248a95` | `.github/workflows/claude.yml` |

---

## 2. Workflow Jobs, Timeouts, Tiers & Permissions

### `.github/workflows/gate.yml`

Workflow-level permissions:
- `.github/workflows/gate.yml:18-19`: `permissions: contents: read`

| Job | Timeout | Tier | Permissions | Notes |
|---|---|---|---|---|
| `changes` | 5m (`line 42`) | Fast (all runs) | `contents: read`, `pull-requests: read` (`lines 43-45`) | Classifies changed files |
| `checks` (`static·unit·contract`) | 5m (`line 99`) | Fast | Default (`contents: read`) | Static checks, lint, unit, contract |
| `checks` (`integration 1/3`) | 5m (`line 99`) | Fast | Default (`contents: read`) | Matrix shard 1/3 with PostgreSQL |
| `checks` (`integration 2/3`) | 5m (`line 99`) | Fast | Default (`contents: read`) | Matrix shard 2/3 with PostgreSQL |
| `checks` (`integration 3/3`) | 5m (`line 99`) | Fast | Default (`contents: read`) | Matrix shard 3/3 with PostgreSQL |
| `chromium` | 5m (`line 160`) | Fast & Full | Default (`contents: read`) | **Finding T6**: runs full tier under 5m without sharding |
| `firefox` | 40m (`line 194`) | Full only (`line 192`) | Default (`contents: read`) | Skipped on fast tier by design |
| `webkit` | 40m (`line 227`) | Full only (`line 225`) | Default (`contents: read`) | Skipped on fast tier by design |
| `gate` | 5m (`line 263`) | Combiner | Default (`contents: read`) | Aggregates all job statuses |

### `.github/workflows/claude.yml`

Triggers:
- `.github/workflows/claude.yml:16-26`:
  - `issue_comment` (types: `[created]`)
  - `pull_request_review_comment` (types: `[created]`)
  - `pull_request_review` (types: `[submitted]`)
  - `issues` (types: `[opened]`)
  - `pull_request` (types: `[opened, synchronize, ready_for_review, reopened]`)
  - **No `pull_request_target` trigger is declared or used.**

| Job | Timeout | Permissions | Trigger Events | Checkout Ref |
|---|---|---|---|---|
| `claude` | 10m (`line 39`) | `contents: write`, `pull-requests: write`, `issues: write`, `id-token: write`, `actions: read` (`lines 43-48`) | `issue_comment`, `pull_request_review_comment`, `pull_request_review`, `issues` (`lines 31-37`) | Default branch (`main`), not PR head (`lines 90-95`). Gated on actor writer permission (`lines 64-65`) and fork check (`lines 67-68`). |
| `review` | 10m (`line 112`) | `contents: read`, `pull-requests: write`, `issues: write`, `id-token: write`, `actions: read` (`lines 116-121`) | `pull_request` (`line 107`) | Merge ref `refs/pull/<pr>/merge` (`lines 131-136`). Fork PRs excluded (`line 108`). **Finding T5**: lacks collaborator write permission verification. |

---

## 3. Detailed QA Checklist Results per PR

### PR #81: `ci(gate): run the product CI on GitHub-hosted runners again (5-minute jobs, split checks)`

| Item | Status | Citation (file:line) | Quoted Content / Evidence |
|---|---|---|---|
| Actions pinned by commit SHA | PASS | `.github/workflows/gate.yml:49` | `uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`<br>`.github/actions/gate-report/action.yml:32`: `uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1` |
| `ubuntu-24.04` runners | PASS | `.github/workflows/gate.yml:41,98,159,193,226,262` | `runs-on: ubuntu-24.04` across all jobs (`changes`, `checks`, `chromium`, `firefox`, `webkit`, `gate`). |
| No self-hosted labels | PASS | `.github/workflows/gate.yml:41` | No `self-hosted` runner labels in `gate.yml` or actions. |
| No secrets beyond `GITHUB_TOKEN` in `gate.yml` | PASS | `.github/workflows/gate.yml:57` | `GH_TOKEN: ${{ github.token }}`. No references to `secrets.*` in `gate.yml`. |
| `timeout-minutes: 5` on every fast-tier job | FINDING (T6) | `.github/workflows/gate.yml:160` | `changes` (line 42), `checks` (line 99), and `gate` (line 263) have `timeout-minutes: 5`. However, `chromium` (line 160) unconditionally applies `timeout-minutes: 5` for both fast tier and full tier (`GATE_TIER: full` at line 166) without matrix sharding, risking cancellation when running all specs. |
| Least-privilege `permissions:` | PASS | `.github/workflows/gate.yml:18-19,43-45` | Root has `permissions: contents: read`. Only `changes` adds `pull-requests: read`. Test runners have read-only access. |
| No `pull_request_target` checkout of untrusted code | PASS | `.github/workflows/gate.yml:5` | Uses `pull_request`, not `pull_request_target`. Untrusted head code is not checked out with elevated permissions. |
| Claude workflow stays inert without secret | N/A | — | Applies to `claude.yml` (PR #83/#87), not `gate.yml`. |

---

### PR #83: `ci: Claude on GitHub via claude-code-action (Max subscription, inert until secret)`

| Item | Status | Citation (file:line) | Quoted Content / Evidence |
|---|---|---|---|
| Actions pinned by commit SHA | PASS | `.github/workflows/claude.yml:92,98,133,139` | `uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`<br>`uses: anthropics/claude-code-action@6fed3ca145920b639991cb756090506e1bcaf515 # v1.0.245` |
| `ubuntu-24.04` runners | PASS | `.github/workflows/claude.yml:38,111` | `runs-on: ubuntu-24.04` for both `claude` and `review` jobs. |
| No self-hosted labels | PASS | `.github/workflows/claude.yml:38` | No `self-hosted` labels in `claude.yml`. |
| No secrets beyond `GITHUB_TOKEN` in `gate.yml` | N/A | — | `claude.yml` requires `CLAUDE_CODE_OAUTH_TOKEN` for its OAuth app integration. |
| `timeout-minutes: 5` on every fast-tier job | N/A | `.github/workflows/claude.yml:39,112` | `claude.yml` is an interactive/review workflow with `timeout-minutes: 10`, not product gate CI. |
| Least-privilege `permissions:` | FINDING (T5) | `.github/workflows/claude.yml:125` | `review` job requests `pull-requests: write` and `issues: write` (`lines 118-119`), but its gate step (`lines 125-130`) only verifies `HAS_TOKEN` and lacks collaborator write-permission verification for the PR actor. |
| No `pull_request_target` checkout of untrusted code | PASS | `.github/workflows/claude.yml:16-26` | Triggers are `issue_comment`, `pull_request_review_comment`, `pull_request_review`, `issues`, `pull_request`. No `pull_request_target`. `claude` job checks out `main` (`lines 90-95`). Fork PRs rejected (`lines 67-68, 108`). |
| Claude workflow stays inert without its secret | PASS | `.github/workflows/claude.yml:51,63,123,128` | Both jobs define `HAS_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN != '' }}` and verify `[ "$HAS_TOKEN" = "true" ]`. Action steps gate on `steps.gate.outputs.run == 'true'` (`lines 97, 138`). |

---

### PR #87: `ci: Claude Action review skips the hub's own ai/* PRs`

| Item | Status | Citation (file:line) | Quoted Content / Evidence |
|---|---|---|---|
| Actions pinned by commit SHA | PASS | `.github/workflows/claude.yml:133,139` | Same commit SHAs for checkout and claude-code-action. |
| `ubuntu-24.04` runners | PASS | `.github/workflows/claude.yml:111` | `runs-on: ubuntu-24.04`. |
| No self-hosted labels | PASS | `.github/workflows/claude.yml:111` | No `self-hosted` labels. |
| Least-privilege `permissions:` | FINDING (T5) | `.github/workflows/claude.yml:125` | PR #87 added `!startsWith(github.event.pull_request.head.ref, 'ai/')` (`line 110`), but did not add collaborator write-access verification to the `review` job. |
| No `pull_request_target` checkout of untrusted code | PASS | `.github/workflows/claude.yml:107-108` | Trigger is `pull_request` on internal branch (`head.repo.full_name == github.repository`). |
| Claude workflow stays inert without secret | PASS | `.github/workflows/claude.yml:123,128` | `HAS_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN != '' }}` gate preserved. |
| Review job skips `ai/*` PRs | PASS | `.github/workflows/claude.yml:110` | `!startsWith(github.event.pull_request.head.ref, 'ai/')` correctly filters hub AI branches. |

---

## 4. Findings and Suggested Fixes

### Finding T5: Claude Review Job Lacks Collaborator Permission Verification
- **File**: `.github/workflows/claude.yml:125`
- **Issue**: The `review` job requests `pull-requests: write` and `issues: write`, but its gate step only checks `[ "$HAS_TOKEN" = "true" ]`. Unlike the `claude` interactive job (lines 64-65), it does not verify whether the PR author/actor has write permissions on the repository.
- **Suggested Fix**:
```yaml
      - name: Gate (token present and writer)
        id: gate
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}
          ACTOR: ${{ github.event.pull_request.user.login }}
        run: |
          set -euo pipefail
          skip() { echo "::notice::$1"; echo "run=false" >> "$GITHUB_OUTPUT"; exit 0; }
          [ "$HAS_TOKEN" = "true" ] || skip "CLAUDE_CODE_OAUTH_TOKEN is not set - review is a no-op."
          perm="$(gh api "repos/$REPO/collaborators/$ACTOR/permission" --jq .permission 2>/dev/null || echo none)"
          case "$perm" in admin|maintain|write) ;; *) skip "$ACTOR has no write access - review skipped." ;; esac
          echo "run=true" >> "$GITHUB_OUTPUT"
```

### Finding T6: Chromium Job Unsharded on Full Tier under 5-Minute Cap
- **File**: `.github/workflows/gate.yml:160`
- **Issue**: `chromium` had `timeout-minutes: 5` unconditionally, but on `workflow_dispatch` with `inputs.tier == 'full'`, it executes the complete Chromium test suite rather than the `@critical`/`@cross-browser` subset. Running the full suite under 5 minutes without matrix sharding risks timeout cancellation on slower runners.
- **Suggested Fix / Implemented Resolution**:
Shard the full Chromium tier into 5-minute matrix legs similar to `checks`:
```yaml
    strategy:
      fail-fast: false
      matrix:
        shard: [1/2, 2/2]
```

---

## 5. Resolution Implemented on `ai/250` (Round 1 Rework)

Per CTO directive (delegated authority from founder) and reviewer findings:
1. **Finding T5 resolved**: Updated `.github/workflows/claude.yml:125-135` to query collaborator write permissions (`admin|maintain|write`) before running the review job.
2. **Finding T6 resolved**: Updated `.github/workflows/gate.yml:160-165` to declare a matrix strategy with `shard: [1/2, 2/2]` for `chromium` while strictly preserving `timeout-minutes: 5`.
3. **Regression tests added**:
   - `tests/unit/ci-workflows.test.ts`: Added tests verifying collaborator write permission check on `review` job and matrix sharding on `chromium` job.
   - `tests/unit/ci-qa-checklist.test.ts`: Verified 11/11 tests pass with 0 exit code on `ai/250` real files.

---

## 6. Checker Execution Output on `ai/250`

```
$ node scripts/ci/qa-checklist.mjs
PASS actions-pinned-sha All external actions are pinned by a 40-character commit SHA .github/workflows/gate.yml:49
PASS ubuntu-2404-runner All jobs declare runs-on: ubuntu-24.04 .github/workflows/gate.yml:41
PASS no-self-hosted No self-hosted runner labels found .github/workflows/gate.yml:41
PASS gate-secrets No secrets beyond GITHUB_TOKEN used in gate.yml .github/workflows/gate.yml:18
PASS fast-tier-timeout Every fast-tier job has timeout-minutes: 5 .github/workflows/gate.yml:42
PASS least-privilege-permissions Workflows enforce least-privilege permissions .github/workflows/gate.yml:18
PASS pr-target-checkout No pull_request_target checkout of untrusted code .github/workflows/gate.yml:5
PASS claude-inert-without-secret Claude workflow stays inert without CLAUDE_CODE_OAUTH_TOKEN secret .github/workflows/claude.yml:51
```
Observed exit code: `0` (all 8 QA checklist rules passed, 0 findings).
