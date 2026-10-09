# Prep for #45: Lock order: email-token rows vs user delete and concurrent resets

> Offline floor prep (2026-10-09T18:46Z): run by hand (node src/cli.ts floorprep). Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Found during #41 (pre-existing, not reproduced): (1) email_token.user_id is ON DELETE SET NULL; user deletion updates token rows after locking the user, while reset/verify/delete-confirmation lock their token row first — a concurrent reset and account-deletion confirmation can deadlock. (2) Two resets with different outstanding tokens each hold their token row and queue at the user row; the winner updates the loser's token. Fix needs 'user before token' in reset/verify/delete flows (user id via an unlocked read first). Documented as known gaps in docs/security/FEDERATED_MFA.md.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `.github/workflows/claude.yml`
- `.github/workflows/gate.yml`
- `.gitignore`
- `AGENTS.md`
- `CLAUDE.md`
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
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:qwen3:8b)

- **Test Case**: Concurrent reset and user deletion deadlock  
  **Setup**: Simulate reset and user deletion in parallel  
  **Assertion**: Deadlock occurs if token row is locked before user  
  **File**: `tests/unit/gate-groups.test.ts`  
  **Edge Case**: Token row lock precedes user lock  

- **Test Case**: Reset with existing token  
  **Setup**: User has pending token, perform reset  
  **Assertion**: Token is updated, user is locked first  
  **File**: `tests/unit/gate-selection.test.ts`  
  **Edge Case**: Token row is not locked during user read  

- **Test Case**: Verify token after reset  
  **Setup**: Reset token, verify with new token  
  **Assertion**: Verification succeeds with new token  
  **File**: `tests/unit/gate-selection.test.ts`  
  **Edge Case**: Token is invalidated during verification  

- **Test Case**: Delete confirmation with concurrent reset  
  **Setup**: User deletes account, reset occurs in parallel  
  **Assertion**: Reset fails or is rolled back  
  **File**: `tests/unit/gate-groups.test.ts`  
  **Edge Case**: Token row is locked during user deletion  

- **Test Case**: Multiple resets with different tokens  
  **Setup**: Two users with different tokens perform reset  
  **Assertion**: Each reset updates their own token  
  **File**: `tests/unit/test-integration-env.test.ts`  
  **Edge Case**: Token rows are not locked during user read  

- **Test Case**: User deletion after token lock  
  **Setup**: Token is locked, user is deleted  
  **Assertion**: Token is set to NULL, user is deleted  
  **File**: `tests/unit/gate-selection.test.ts`  
  **Edge Case**: Token row is not updated after user deletion  

- **Test: Token cleanup on user deletion**  
  **Setup**: User has active token, user is deleted  
  **Assertion**: Token is set to NULL, not deleted  
  **File**: `tests/unit/gate-groups.test.ts`  
  **Edge Case**: Token is not updated during user deletion  

- **Test: Reset with no existing token**  
  **Setup**: User has no token, perform reset  
  **Assertion**: New token is created, user is locked  
  **File**: `tests/unit/gate-selection.test.ts`  
  **Edge Case**: Token is not created if user is locked  

- **Test: Token expiration during reset**  
  **Setup**: Token is expired, reset is initiated  
  **Assertion**: Reset fails or generates new token  
  **File**: `tests/unit/test-integration-env.test.ts`  
  **Edge Case**: Expired token is not invalidated during reset  

- **Test: Token race condition during reset**  
  **Setup**: Two resets on same user with different tokens  
  **Assertion**: Only one token is updated, others are rolled back  
  **File**: `tests/unit/gate-groups.test.ts`  
  **Edge Case**: Tokens are not properly invalidated during reset
