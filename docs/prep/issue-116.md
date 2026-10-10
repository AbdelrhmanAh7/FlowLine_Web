# Prep for #116: Postgres adapter and integration tests for runConcurrent (opposite-order deadlock vs same-order pass)

> Offline floor prep (2026-10-10T15:43Z): capacity 0 — claude: claude daily budget spent (13% of 8% week-points) ; codex: Codex daily budget spent (10 of 7 week-points toda; opencode: held until 16:35Z (opencode rate-limited 6× in a r; agy: held until 10-14 14:35Z (3 d 23 h) ( error: Indivi. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

## Depends on
The helper core sub-issue (`runConcurrent` merged).

## Scope
- Add a thin `pg` adapter that opens two separate connections from the existing test DB config and plugs into `runConcurrent`.
- Add integration tests placed in the existing integration suite and using the existing integration harness, DB setup and teardown, and env vars. Create no new secrets or settings.
- Test 1: an opposite-order lock pair on two scratch tables is detected as a deadlock (40P01).
- Test 2: a same-order pair passes.
- Tests clean up their own temporary tables.
- Keep the change under 120 lines.

## Acceptance criteria
- [ ] Both integration tests pass in the existing integration job, are deterministic, and finish in under 10 s.
- [ ] Run the tests locally 20 times in a loop with no flakes.
- [ ] No production code changes.
- [ ] No `.github/` or workflow changes.
- [ ] No existing test is skipped or weakened.
- [ ] The PR description states how the integration harness was reused.
- [ ] The full existing suite is green.

Part 2/2 of #90 (split by the CTO: Split the helper into a DB-free core with fake-driver unit tests, and a Postgres adapter with integration tests, so the red integration job is isolated from the core deliverable.)

<!-- nql-cto-split parent=90 -->

## Acceptance checklist

- [ ] Both integration tests pass in the existing integration job, are deterministic, and finish in under 10 s.
- [ ] Run the tests locally 20 times in a loop with no flakes.
- [ ] No production code changes.
- [ ] No `.github/` or workflow changes.
- [ ] No existing test is skipped or weakened.
- [ ] The PR description states how the integration harness was reused.
- [ ] The full existing suite is green.

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `.github/workflows/gate.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:qwen3:8b)

- **Test Case 1**: Opposite-order deadlock detection  
  **Setup**: Create two scratch tables with locks in opposite order.  
  **Assertion**: Test fails with 40P01 deadlock error.  
  **File**: `tests/integration/p2-concurrent-deadlock.test.ts`  

- **Test Case 2**: Same-order lock pair  
  **Setup**: Create two scratch tables with locks in same order.  
  **Assertion**: Test passes without deadlock.  
  **File**: `tests/integration/p2-concurrent-deadlock.test.ts`  

- **Test Case 3**: Clean up temporary tables  
  **Setup**: Create and use temporary tables in test.  
  **Assertion**: Tables are dropped after test completes.  
  **File**: `tests/integration/p2-concurrent-deadlock.test.ts`  

- **Test Case 4**: Integration harness reuse  
  **Setup**: Use existing DB setup/teardown and env vars.  
  **Assertion**: Tests run with existing integration harness.  
  **File**: `tests/integration/p2-concurrent-deadlock.test.ts`  

- **Test Case 5**: Local reproducibility  
  **Setup**: Run tests 20 times in a loop locally.  
  **Assertion**: No flakes or failures.  
  **File**: `tests/integration/p2-concurrent-deadlock.test.ts`  

- **Test Case 6**: No secret creation  
  **Setup**: Use existing DB config without new secrets.  
  **Assertion**: No new secrets or settings added.  
  **File**: `tests/integration/p2-concurrent-deadlock.test.ts`  

- **Test Case 7**: No test skipping  
  **Setup**: Ensure all existing tests remain intact.  
  **Assertion**: No existing tests are skipped or weakened.  
  **File**: `tests/integration/p2-concurrent-deadlock.test.ts`  

- **Test Case 8**: Deterministic execution  
  **Setup**: Run tests in a loop with fixed inputs.  
  **Assertion**: Results are consistent across runs.  
  **File**: `tests/integration/p2-concurrent-deadlock.test.ts`  

- **Test Case 9**: No workflow changes  
  **Setup**: Use existing CI/CD workflows.  
  **Assertion**: No changes to `.github/` or workflows.  
  **File**: `tests/integration/p2-concurrent-deadlock.test.ts`  

- **Test Case 10**: Full suite green  
  **Setup**: Run full integration suite after PR.  
  **Assertion**: All tests pass without issues.  
  **File**: `tests/integration/p2-concurrent-deadlock.test.ts`
