# Prep for #90: Add a concurrent-transaction test helper for lock-order regression tests

> Offline floor prep (2026-10-10T09:24Z): capacity 0 — claude: claude daily budget spent (12% of 8% week-points) ; codex: Codex daily budget spent (9 of 7 week-points today; opencode: held until 12:02Z (opencode rate-limited 5× in a r; agy: held until 10-14 14:35Z (4 d 5 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

## Context
The lock-order fixes in #41, #42, #45 and #47 each need a regression test that runs two transactions concurrently and asserts that no deadlock occurs. A shared helper avoids four ad-hoc implementations.

## Scope
Add a test-only utility, for example `test/helpers/concurrentTx.ts`, plus its own unit test (under 250 changed lines):
- `runConcurrent(txA, txB, { timeoutMs })` starts both transactions on separate connections.
- It uses a barrier so both reach their first lock before either proceeds.
- It resolves with each result, or fails with a clear message on a deadlock error (Postgres 40P01) or a timeout.
- It does not modify production code or any issue's fix.

## Acceptance criteria
- [ ] The helper is exported and documented with a short usage example in a header comment.
- [ ] A unit test shows a deliberately opposite-order pair is detected as a deadlock.
- [ ] A unit test shows a same-order pair passes.
- [ ] Tests are deterministic and complete in under 10 s, with no sleeps beyond the barrier timeout.
- [ ] No `.github/` or workflow files are changed.

## Test plan
- Run the new unit tests locally 20 times in a loop and confirm there is no flakiness.
- Run the full existing test suite to confirm no regressions.

<!-- nql-generated -->
<sub>Drafted by the Tech Lead from the roadmap while the queue was empty (claude-haiku-cli); backlog triage decides whether the AI engineers take it.</sub>

## Acceptance checklist

- [ ] The helper is exported and documented with a short usage example in a header comment.
- [ ] A unit test shows a deliberately opposite-order pair is detected as a deadlock.
- [ ] A unit test shows a same-order pair passes.
- [ ] Tests are deterministic and complete in under 10 s, with no sleeps beyond the barrier timeout.
- [ ] No `.github/` or workflow files are changed.

## Candidate files

- `.github/workflows/claude.yml`
- `.gitignore`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/RETEST.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/codex-stdout.md`
- `artifacts/ai-hub/e2e/waveA-full.txt`
- `artifacts/ai-hub/e2e/waveB-full.txt`
- `artifacts/ai-hub/gate-cceeb5d/gate-chromium.results.json`

## Existing tests nearby

- `artifacts/ai-hub/e2e/waveA-full.txt`
- `artifacts/ai-hub/e2e/waveB-full.txt`

## Test plan (ollama:qwen3:8b)

TEST PLAN

1. **Deadlock Detection Test** - `test/helpers/concurrentTx.ts`  
   Setup: Two transactions with opposite lock order.  
   Assertion: Helper detects deadlock (Postgres 40P01) and fails.

2. **Same Order Pass Test** - `test/helpers/concurrentTx.ts`  
   Setup: Two transactions with same lock order.  
   Assertion: Helper completes without deadlock.

3. **Timeout Test** - `test/helpers/concurrentTx.ts`  
   Setup: Transactions wait longer than timeoutMs.  
   Assertion: Helper fails with timeout error.

4. **Barrier Sync Test** - `test/helpers/concurrentTx.ts`  
   Setup: Both transactions reach first lock via barrier.  
   Assertion: Both proceed after barrier is released.

5. **Deterministic Test** - `test/helpers/concurrentTx.ts`  
   Setup: Run same test 20 times in loop.  
   Assertion: No flaky results, consistent outcome.

6. **No Workflow Changes** - `.github/`  
   Setup: Check for changes in workflows.  
   Assertion: No `.github/` files modified.

7. **No Production Code Change** - `src/`  
   Setup: Verify helper is test-only.  
   Assertion: No production code is modified.

8. **Unit Test for Helper** - `test/helpers/concurrentTx.test.ts`  
   Setup: Unit test for helper function.  
   Assertion: Helper resolves with results or fails on error.

9. **Helper Exported** - `test/helpers/concurrentTx.ts`  
   Setup: Check exported function.  
   Assertion: Helper is exported with usage example.

10. **Test Suite Integrity** - `test/`  
    Setup: Run full test suite.  
    Assertion: No regressions, existing tests pass.
