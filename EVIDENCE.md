# Issue #250 — Review gate and Claude Action workflows merged outside automerge (#81, #83, #87) against QA checklist

Branch `ai/250`, PR #271.
Tested commit: `5c157d49a322b7d74de054d2b6d64edf93320531`
Originating report: GitHub issue #250 (deferred from PR-cycle audit #192)
Sentry: None (CI workflow infrastructure review and static verification; no application runtime incident or Sentry issue)

## Why and what this PR changes

| Item | Fact | Location |
|---|---|---|
| Checklist automation | Implemented standalone checker `scripts/ci/qa-checklist.mjs` supporting `--json`, enforcing the 8 QA checklist security rules, and exiting 0 on clean / 1 on findings | `scripts/ci/qa-checklist.mjs` |
| Fixture & structural tests | Unit tests verifying each rule's pass and finding conditions via isolated fixtures and verifying exit code + JSON/markdown parity | `tests/unit/ci-qa-checklist.test.ts` |
| Security invariants | Unit test coverage enforcing token inertness, action SHA pinning, ubuntu runner declaration, write permission least privilege, pr-target exclusion, and chromium matrix sharding | `tests/unit/ci-workflows.test.ts` |
| Finding T5 resolution | Added collaborator write-permission verification (`repos/$REPO/collaborators/$ACTOR/permission`) in the `review` job before executing action | `.github/workflows/claude.yml:125-135` |
| Finding T6 resolution | Sharded `chromium` job into matrix legs `shard: [1/2, 2/2]` while preserving the strict 5-minute timeout cap (`timeout-minutes: 5`) | `.github/workflows/gate.yml:160-165` |
| Audit documentation | Detailed line-by-line audit report covering PRs #81, #83, #87 with quoted evidence | `docs/evidence/250/qa-checklist-audit.md` |

## Acceptance Criteria

- **AC1**: QA checklist checker `scripts/ci/qa-checklist.mjs` evaluates all 8 QA checklist rules (`actions-pinned-sha`, `ubuntu-2404-runner`, `no-self-hosted`, `gate-secrets`, `fast-tier-timeout`, `least-privilege-permissions`, `pr-target-checkout`, `claude-inert-without-secret`), supports `--json`, and exits with code 0 on all pass / code 1 on findings.
- **AC2**: Unit tests in `tests/unit/ci-qa-checklist.test.ts` verify checker logic against isolated fixtures (pass vs finding for each rule) and ensure output structure and exit codes against real repo files.
- **AC3**: Workflow security and inertness invariants are enforced by unit tests in `tests/unit/ci-workflows.test.ts` (Claude token gating, action commit SHA pinning, ubuntu runner declaration, write permission least privilege, gate pr-target exclusion, and chromium matrix sharding).
- **AC4**: Comprehensive QA checklist audit report documented in `docs/evidence/250/qa-checklist-audit.md` evaluating PRs #81, #83, and #87 merged outside automerge, with exact file:line citations and quoted code.
- **AC5**: Resolution of Finding T5: `.github/workflows/claude.yml:125-135` verifies collaborator write permissions (`admin|maintain|write`) before running the review job.
- **AC6**: Resolution of Finding T6: `.github/workflows/gate.yml:160-165` shards the `chromium` job across a 2-way matrix strategy (`shard: [1/2, 2/2]`) preserving the mandatory 5-minute timeout cap (`timeout-minutes: 5`).
- **AC7**: Audit comments posted on Issue #250 with per-PR line citations and findings for PRs #81, #83, and #87.

## Verification Report

| AC | Evidence | Command | Exit Code | Observed Output |
|---|---|---|---|---|
| AC1 | `scripts/ci/qa-checklist.mjs` outputs markdown format with 8 passing rules | `node scripts/ci/qa-checklist.mjs` | 0 | 8/8 rules reported `PASS`, exit code 0 |
| AC1 | `scripts/ci/qa-checklist.mjs` outputs valid JSON array of 8 items with `--json` | `node scripts/ci/qa-checklist.mjs --json` | 0 | Valid JSON array of 8 objects with status `PASS`, exit code 0 |
| AC2 | `tests/unit/ci-qa-checklist.test.ts` executes fixture tests and real file structural assertions | `pnpm exec vitest run tests/unit/ci-qa-checklist.test.ts` | 0 | 11 passed (head) |
| AC3, AC5, AC6 | `tests/unit/ci-workflows.test.ts` executes workflow invariant checks including collaborator permission check and chromium matrix sharding | `pnpm exec vitest run tests/unit/ci-workflows.test.ts` | 0 | 90 passed (head) |
| AC5, AC6 (Regression: fails on base) | Checking out base `origin/main` `.github/workflows/claude.yml` and `.github/workflows/gate.yml` and running tests | `pnpm exec vitest run tests/unit/ci-workflows.test.ts tests/unit/ci-qa-checklist.test.ts` | 1 | 3 failed (T5 collaborator write check missing, T6 chromium unsharded, real file checker finding) |
| AC1 (Regression: fails on base) | Running QA checklist against base `origin/main` workflows | `node scripts/ci/qa-checklist.mjs` | 1 | Reported 2 `FINDING`s (`fast-tier-timeout` at `gate.yml:160`, `least-privilege-permissions` at `claude.yml:125`), exit code 1 |
| Typecheck | Strict TypeScript compilation | `pnpm typecheck` | 0 | `tsc --noEmit` clean, 0 errors |
| Lint | ESLint code style and hygiene | `pnpm lint` | 0 | `eslint` clean, 0 errors / 0 warnings |
| Docs check | Verification of documentation updates | Checked via CI docs validation rule | 0 | Documentation updated in `docs/evidence/250/`, `docs/implementation/`, `NEXT_ACTION.md` |

## Changed Covering Tests

- `tests/unit/ci-qa-checklist.test.ts`: 11 tests covering AC1 and AC2 (fixture evaluation for all 8 rules, real file structure, and JSON CLI flags).
- `tests/unit/ci-workflows.test.ts`: 90 tests covering AC3, AC5, and AC6 (added test blocks for `claude.yml` safety invariants, collaborator permission checks, and `gate.yml` chromium matrix sharding).

## UI and Arabic / RTL Note

Non-user facing (CI/CD workflows, developer audit tooling, and documentation only; no web UI components, routes, styles, or user-facing translation strings touched). Playwright screenshots and RTL/LTR testing are not applicable (exempt per AGENTS.md and brief instructions).

## Regression Test Red-Green Demonstration

### Base (commit `264336fb58265d2961c101591db1223855105dbd` workflows)
```
$ git checkout origin/main -- .github/workflows/claude.yml .github/workflows/gate.yml
$ pnpm vitest run tests/unit/ci-workflows.test.ts tests/unit/ci-qa-checklist.test.ts
 FAIL  |unit| tests/unit/ci-workflows.test.ts > claude.yml safety and inertness invariants > verifies collaborator write permissions in the review job before running action
 AssertionError: expected '\n    needs: [gate]\n...' to include 'repos/$REPO/collaborators/$ACTOR/permission'
 ❯ tests/unit/ci-workflows.test.ts:578:23

 FAIL  |unit| tests/unit/ci-workflows.test.ts > gate.yml security invariants > shards chromium via matrix strategy to prevent timeout cancellation on full tier
 AssertionError: expected '\n    needs: changes\n...' to match /^ {4}strategy:\n/m
 ❯ tests/unit/ci-workflows.test.ts:593:22

 Test Files  2 failed (2)
      Tests  3 failed | 98 passed (101)
 Exit code: 1

$ node scripts/ci/qa-checklist.mjs
PASS actions-pinned-sha All external actions are pinned by a 40-character commit SHA .github/workflows/gate.yml:49
PASS ubuntu-2404-runner All jobs declare runs-on: ubuntu-24.04 .github/workflows/gate.yml:41
PASS no-self-hosted No self-hosted runner labels found .github/workflows/gate.yml:41
PASS gate-secrets No secrets beyond GITHUB_TOKEN used in gate.yml .github/workflows/gate.yml:18
FINDING fast-tier-timeout Chromium job runs full tier under 5-minute timeout without matrix sharding .github/workflows/gate.yml:160
FINDING least-privilege-permissions Review job requests write permissions without collaborator write-permission verification .github/workflows/claude.yml:125
PASS pr-target-checkout No pull_request_target checkout of untrusted code .github/workflows/gate.yml:5
PASS claude-inert-without-secret Claude workflow stays inert without CLAUDE_CODE_OAUTH_TOKEN secret .github/workflows/claude.yml:51
Exit code: 1
```

### Head (commit `5c157d49a322b7d74de054d2b6d64edf93320531`)
```
$ git checkout HEAD -- .github/workflows/claude.yml .github/workflows/gate.yml
$ pnpm vitest run tests/unit/ci-workflows.test.ts tests/unit/ci-qa-checklist.test.ts
 ✓ |unit| tests/unit/ci-qa-checklist.test.ts (11 tests) 247ms
 ✓ |unit| tests/unit/ci-workflows.test.ts (90 tests) 777ms

 Test Files  2 passed (2)
      Tests  101 passed (101)
   Duration  988ms
 Exit code: 0

$ node scripts/ci/qa-checklist.mjs
PASS actions-pinned-sha All external actions are pinned by a 40-character commit SHA .github/workflows/gate.yml:49
PASS ubuntu-2404-runner All jobs declare runs-on: ubuntu-24.04 .github/workflows/gate.yml:41
PASS no-self-hosted No self-hosted runner labels found .github/workflows/gate.yml:41
PASS gate-secrets No secrets beyond GITHUB_TOKEN used in gate.yml .github/workflows/gate.yml:18
PASS fast-tier-timeout Every fast-tier job has timeout-minutes: 5 .github/workflows/gate.yml:42
PASS least-privilege-permissions Workflows enforce least-privilege permissions .github/workflows/gate.yml:18
PASS pr-target-checkout No pull_request_target checkout of untrusted code .github/workflows/gate.yml:5
PASS claude-inert-without-secret Claude workflow stays inert without CLAUDE_CODE_OAUTH_TOKEN secret .github/workflows/claude.yml:51
Exit code: 0

$ node scripts/ci/qa-checklist.mjs --json
[
  { "id": "actions-pinned-sha", "status": "PASS", "file": ".github/workflows/gate.yml", "line": 49, "detail": "All external actions are pinned by a 40-character commit SHA" },
  { "id": "ubuntu-2404-runner", "status": "PASS", "file": ".github/workflows/gate.yml", "line": 41, "detail": "All jobs declare runs-on: ubuntu-24.04" },
  { "id": "no-self-hosted", "status": "PASS", "file": ".github/workflows/gate.yml", "line": 41, "detail": "No self-hosted runner labels found" },
  { "id": "gate-secrets", "status": "PASS", "file": ".github/workflows/gate.yml", "line": 18, "detail": "No secrets beyond GITHUB_TOKEN used in gate.yml" },
  { "id": "fast-tier-timeout", "status": "PASS", "file": ".github/workflows/gate.yml", "line": 42, "detail": "Every fast-tier job has timeout-minutes: 5" },
  { "id": "least-privilege-permissions", "status": "PASS", "file": ".github/workflows/gate.yml", "line": 18, "detail": "Workflows enforce least-privilege permissions" },
  { "id": "pr-target-checkout", "status": "PASS", "file": ".github/workflows/gate.yml", "line": 5, "detail": "No pull_request_target checkout of untrusted code" },
  { "id": "claude-inert-without-secret", "status": "PASS", "file": ".github/workflows/claude.yml", "line": 51, "detail": "Claude workflow stays inert without CLAUDE_CODE_OAUTH_TOKEN secret" }
]
Exit code: 0
```
