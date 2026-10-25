# Evidence for Issue #459

**Issue:** fix: GITHUB_WORKFLOW.md: docs/GITHUBWORKFLOW.md:1: The PR removes critical documentation about the GitHub workflow
**Branch:** ai/459
**Base:** main
**Supersedes part of:** #458
**Refs:** #449

## Acceptance Criteria Verification

| AC | Description | Command | Exit Code | Result |
|----|-------------|---------|-----------|--------|
| AC1 | Doc has `## Merging into main` heading and mentions "main protection" | `pnpm exec vitest run tests/unit/github-workflow-doc.test.ts -t "AC1" --maxWorkers=2` | 0 | ✅ PASS |
| AC2 | Doc names required \`gate\` and \`docs\` checks | `pnpm exec vitest run tests/unit/github-workflow-doc.test.ts -t "AC2" --maxWorkers=2` | 0 | ✅ PASS |
| AC3 | Doc contains `gh workflow run gate.yml` and `tier=full` | `pnpm exec vitest run tests/unit/github-workflow-doc.test.ts -t "AC3" --maxWorkers=2` | 0 | ✅ PASS |
| AC4 | Doc contains "Labels never start CI" | `pnpm exec vitest run tests/unit/github-workflow-doc.test.ts -t "AC4" --maxWorkers=2` | 0 | ✅ PASS |

## Regression Proof

A modified version of `docs/GITHUB_WORKFLOW.md` with lines 22–31 (the "Merging into main" section) removed was tested against the same test suite:

| AC | Command | Exit Code | Result |
|----|---------|-----------|--------|
| AC1 | `pnpm exec vitest run tests/unit/github-workflow-doc-regression.test.ts -t "AC1" --maxWorkers=2` | 1 | ✅ FAILS (as expected) |
| AC2 | `pnpm exec vitest run tests/unit/github-workflow-doc-regression.test.ts -t "AC2" --maxWorkers=2` | 1 | ✅ FAILS (as expected) |
| AC3 | `pnpm exec vitest run tests/unit/github-workflow-doc-regression.test.ts -t "AC3" --maxWorkers=2` | 1 | ✅ FAILS (as expected) |
| AC4 | `pnpm exec vitest run tests/unit/github-workflow-doc-regression.test.ts -t "AC4" --maxWorkers=2` | 1 | ✅ FAILS (as expected) |

**Full regression test run:** Exit code 1 (4 tests failed)

## Test Files

- `tests/unit/github-workflow-doc.test.ts` — Permanent guard test that validates the critical documentation exists
- The regression test was temporary and has been removed

## Notes

- No e2e-army test added: this is a docs-only change (no user-facing flow)
- No Sentry issue: the source is a CodeRabbit review finding on PR #458
- No UI screenshots: no UI changes
- PR body will include: "Supersedes part of #458" and "Refs #449"