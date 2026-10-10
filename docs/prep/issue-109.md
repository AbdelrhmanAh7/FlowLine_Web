# Prep for #109: Fix lock order in consumeAccountToken to resolve deadlock

> Offline floor prep (2026-10-10T14:18Z): capacity 0 — claude: claude daily budget spent (12% of 8% week-points) ; codex: Codex daily budget spent (10 of 7 week-points toda; opencode: held until 16:35Z (opencode rate-limited 6× in a r; agy: held until 10-14 14:35Z (4 d 0 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Modify `src/server/email/flows.ts` to change the lock order, placing the audit row insert before the workspace `FOR UPDATE` lock. Ensure the fix passes the deadlock test and `tests/integration/retained-file-locking.test.ts:122`.

Part 2/2 of #47 (split by the CTO: Splitting into two parts: first create a failing integration test for the deadlock, then apply the lock reordering fix.)

<!-- nql-cto-split parent=47 -->

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/setup-gate/action.yml`
- `.github/workflows/claude.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/02-connect-en.txt`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:qwen3:8b)

- **Test Case**: Deadlock scenario with concurrent account token consumption  
  **Setup**: Simulate two concurrent requests to `consumeAccountToken` with overlapping audit and workspace locks  
  **Assertion**: Ensure no deadlock occurs, and both requests complete successfully  
  **File**: `tests/integration/retained-file-locking.test.ts`  

- **Test Case**: Audit row insertion before workspace lock  
  **Setup**: Trigger `consumeAccountToken` with audit logging enabled  
  **Assertion**: Audit row is inserted before the workspace `FOR UPDATE` lock is applied  
  **File**: `tests/unit/run-output-redaction.test.ts`  

- **Test Case**: Lock order change in `consumeAccountToken`  
  **Setup**: Use a test harness to monitor lock acquisition order  
  **Assertion**: Audit insert happens before workspace lock  
  **File**: `tests/integration/p2-actions.test.ts`  

- **Test Case**: Retained file locking after audit insert  
  **Setup**: Simulate a scenario where audit is written and workspace is locked  
  **Assertion**: File locking is released correctly after audit is persisted  
  **File**: `tests/integration/retained-file-locking.test.ts`  

- **Test Case**: Concurrency with audit and workspace locks  
  **Setup**: Run multiple `consumeAccountToken` calls in parallel  
  **Assertion**: All calls complete without deadlock or data corruption  
  **File**: `tests/integration/retained-file-locking.test.ts`  

- **Test Case**: Edge case: audit write fails after workspace lock  
  **Setup**: Simulate audit write failure after workspace lock is acquired  
  **Assertion**: Workspace lock is released, and audit write is retried  
  **File**: `tests/integration/retained-file-locking.test.ts`  

- **Test Case**: Lock reordering in edge cases  
  **Setup**: Test with empty audit data or missing workspace  
  **Assertion**: Lock reordering does not cause errors or deadlocks  
  **File**: `tests/unit/run-output-redaction.test.ts`
