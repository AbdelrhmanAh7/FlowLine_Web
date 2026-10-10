# Prep for #108: Add integration test for account deletion deadlock

> Offline floor prep (2026-10-10T13:57Z): capacity 0 — claude: claude daily budget spent (12% of 8% week-points) ; codex: Codex daily budget spent (10 of 7 week-points toda; opencode: held until 16:35Z (opencode rate-limited 6× in a r; agy: held until 10-14 14:35Z (4 d 1 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Write an integration test that replicates the deadlock scenario where a user deletes their account (via consumeAccountToken('delete')) while their own SSO transaction is in flight. Ensure the test reliably fails due to the lock ordering.

Part 1/2 of #47 (split by the CTO: Splitting into two parts: first create a failing integration test for the deadlock, then apply the lock reordering fix.)

<!-- nql-cto-split parent=47 -->

## Acceptance checklist

- (none in the issue — derive from the brief)

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
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/02-connect-en.txt`

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

- **Test Case**: Delete Account While SSO Transaction Active  
  **Setup**: Start SSO transaction, initiate account deletion via `consumeAccountToken('delete')`  
  **Assertion**: Deadlock occurs, test fails with lock ordering error  
  **File**: `tests/integration/p2-actions.test.ts`  
  **Edge Case**: Ensure SSO transaction is in flight before deletion  

- **Test Case**: SSO Transaction Locks Table A  
  **Setup**: Acquire lock on table A during SSO transaction  
  **Assertion**: Lock is held, prevent concurrent access  
  **File**: `tests/integration/p2-actions.test.ts`  
  **Edge Case**: Ensure lock is acquired correctly  

- **Test Case**: Account Deletion Locks Table B  
  **Setup**: Initiate account deletion, acquire lock on table B  
  **Assertion**: Lock is held, prevent concurrent access  
  **File**: `tests/integration/p2-actions.test.ts`  
  **Edge Case**: Ensure lock is acquired correctly  

- **Test Case**: Lock Order Conflict  
  **Setup**: SSO transaction acquires lock on table A, deletion acquires lock on table B  
  **Assertion**: Deadlock detected due to lock ordering  
  **File**: `tests/integration/p2-actions.test.ts`  
  **Edge Case**: Ensure lock order is enforced  

- **Test Case**: Deadlock Detection Enabled  
  **Setup**: Ensure deadlock detection is active in DB config  
  **Assertion**: Test fails with deadlock error  
  **File**: `tests/integration/p2-actions.test.ts`  
  **Edge Case**: Verify DB settings are correct  

- **Test Case**: Clean Up After Deadlock  
  **Setup**: Trigger deadlock, check for automatic cleanup  
  **Assertion**: Transaction rolled back, no data corruption  
  **File**: `tests/integration/p2-actions.test.ts`  
  **Edge Case**: Ensure no partial updates occur  

- **Test Case**: Multiple Concurrent Deletions  
  **Setup**: Simulate multiple users deleting accounts during SSO  
  **Assertion**: All deletions fail due to deadlock  
  **File**: `tests/integration/p2-actions.test.ts`  
  **Edge Case**: Ensure race conditions are handled  

- **Test Case**: SSO Transaction Timeout  
  **Setup**: Set SSO transaction timeout, initiate deletion  
  **Assertion**: Transaction times out before deadlock  
  **File**: `tests/integration/p2-actions.test.ts`  
  **Edge Case**: Ensure timeout logic is enforced
