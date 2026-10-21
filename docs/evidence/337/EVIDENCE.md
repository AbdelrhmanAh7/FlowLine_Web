# Evidence — Issue #337: delete unpassable duplicate e2e-army/124-signup-verify.e2e.ts (split from #135)

## Overview & Scope
- **Issue**: #337 (`fix: 124-signup-verify.e2e.ts: e2e-army/124-signup-verify.e2e.ts: delete this file. It duplicates 12… (split from #135)`)
- **Parent Issue**: #124 (`staging: auto-verify sign-ups for automated testing`)
- **Supersedes**: part of PR #135
- **Branch**: `ai/337` (clean branch off `origin/main`)
- **Tested Commit SHA**: `b5f4fd28`
- **Originating Sentry Issue**: None (internal QA finding split from PR #135)
- **User-Facing**: No (`E2E: not needed — test-only hygiene chore and deletion guard; no user-facing flows changed`)

## Acceptance Criteria

| ID | Acceptance Criterion | Verification Method | Observed Result | Exit Code |
|---|---|---|---|---|
| **AC1** | Guard against historical unpassable e2e-army test anti-patterns (mutating server `process.env` in test runner, hardcoded `test@example.com`, non-existent `/api/users/` endpoint, non-canonical `/en/signup`, unisolated `toHaveLength(0)` on outbox) via `findSignupVerifyViolations` in `tests/unit/e2e-signup-verify-guard.test.ts`. | `pnpm vitest run tests/unit/e2e-signup-verify-guard.test.ts` | 4 passed, 0 failed | 0 |
| **AC2** | Verify `e2e-army/124-signup-verify.e2e.ts` is deleted and absent from repo tree (`tests/unit/e2e-signup-verify-guard.test.ts:79-82`). | `tests/unit/e2e-signup-verify-guard.test.ts` test 2 | Confirmed absent (`existsSync` is false) | 0 |
| **AC3** | Verify active `e2e-army/*.e2e.ts` files contain no unpassable environment-mutation or non-existent endpoint anti-patterns (`tests/unit/e2e-signup-verify-guard.test.ts:84-93`). | `tests/unit/e2e-signup-verify-guard.test.ts` test 3 | All active e2e-army files clean (0 violations) | 0 |
| **AC4** | Verify total top-level `e2e-army/*.e2e.ts` files count respects hub cap of maximum 8 files (`tests/unit/e2e-signup-verify-guard.test.ts:95-99`). | `tests/unit/e2e-signup-verify-guard.test.ts` test 4 | 8 files (<= 8) | 0 |
| **AC5** | Regression negative control: demonstrate that the guard fails when `e2e-army/124-signup-verify.e2e.ts` exists (fails AC2 & AC4) and detects all 5 defects on historical PR #135 code. | `touch e2e-army/124-signup-verify.e2e.ts && pnpm vitest run tests/unit/e2e-signup-verify-guard.test.ts` | 2 failed (AC2, AC4) | 1 |
| **AC6** | Clean checks: `pnpm typecheck` exit 0, `pnpm eslint tests/unit/e2e-signup-verify-guard.test.ts` exit 0, diff kept under 300 changed lines. | `pnpm typecheck && pnpm eslint tests/unit/e2e-signup-verify-guard.test.ts` | Clean output (tsc exit 0, eslint exit 0) | 0 |

## Root Cause Analysis
1. In PR #135 (commit `69dac3ab`), a duplicate test file `e2e-army/124-signup-verify.e2e.ts` was added.
2. The file could never pass in CI/verify environments for 6 concrete reasons:
   - (a) Lines 6-7 set `process.env.FLOWLINE_ENV = 'test'` and `process.env.FLOWLINE_TEST_AUTO_VERIFY = '1'` inside the test runner client process, which has zero effect on the already-running server process;
   - (b) It navigated to `/en/signup`, whereas FlowLine's canonical auth route is `/sign-up` or `/en/sign-up`;
   - (c) It expected `Welcome, test@example.com!` heading, whereas FlowLine redirects successful sign-ups to workspace onboarding ("Name your workspace");
   - (d) It queried a non-existent `/api/users/test@example.com` endpoint to read `user.verified`;
   - (e) It asserted `expect(emails).toHaveLength(0)` on the shared `/api/test/outbox`, which fails whenever other tests send mail in shared test execution;
   - (f) The hardcoded address `test@example.com` collides on reruns and adding the file exceeded the 8 top-level file cap.
3. PR #135 was stuck and unmerged. Finding `4eeabaf55600` was split into Issue #337 to ensure `e2e-army/124-signup-verify.e2e.ts` is deleted on a fresh branch off `main` and protected by a regression guard.
4. On `main` and `ai/337`, `e2e-army/124-signup-verify.e2e.ts` is confirmed deleted/absent, and `tests/unit/e2e-signup-verify-guard.test.ts` ensures it cannot be reintroduced.

## Verification Commands & Outputs

### 1. Guard Unit Test Execution (AC1, AC2, AC3, AC4)
```bash
pnpm vitest run tests/unit/e2e-signup-verify-guard.test.ts
```
Output:
```
 ✓ |unit| tests/unit/e2e-signup-verify-guard.test.ts (4 tests) 6ms
   ✓ @issue-337 guard against unpassable duplicate e2e-army/124-signup-verify.e2e.ts (supersedes part of #135, refs #124) (4)
     ✓ AC1 & AC5: flags all 5 unpassable anti-patterns on historical PR #135 test code (regression negative control) 1ms
     ✓ AC2: verifies e2e-army/124-signup-verify.e2e.ts is deleted and absent from repo tree 0ms
     ✓ AC3: verifies active e2e-army suite contains no unpassable environment-mutation or non-existent endpoint anti-patterns 3ms
     ✓ AC4: verifies total top-level e2e-army test files respects the hub cap (<= 8 files) 1ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  375ms
```
Exit code: 0

### 2. Regression Negative Control (AC5: Base vs Head demonstration)
```bash
touch e2e-army/124-signup-verify.e2e.ts && pnpm vitest run tests/unit/e2e-signup-verify-guard.test.ts
```
Output:
```
 ❯ |unit| tests/unit/e2e-signup-verify-guard.test.ts (4 tests | 2 failed) 6ms
   ❯ @issue-337 guard against unpassable duplicate e2e-army/124-signup-verify.e2e.ts (supersedes part of #135, refs #124) (4)
     ✓ AC1 & AC5: flags all 5 unpassable anti-patterns on historical PR #135 test code (regression negative control) 1ms
     × AC2: verifies e2e-army/124-signup-verify.e2e.ts is deleted and absent from repo tree 2ms
     ✓ AC3: verifies active e2e-army suite contains no unpassable environment-mutation or non-existent endpoint anti-patterns 1ms
     × AC4: verifies total top-level e2e-army test files respects the hub cap (<= 8 files) 0ms

 FAIL  |unit| tests/unit/e2e-signup-verify-guard.test.ts > AC2: verifies e2e-army/124-signup-verify.e2e.ts is deleted and absent from repo tree
 AssertionError: e2e-army/124-signup-verify.e2e.ts must not exist: expected true to be false

 FAIL  |unit| tests/unit/e2e-signup-verify-guard.test.ts > AC4: verifies total top-level e2e-army test files respects the hub cap (<= 8 files)
 AssertionError: expected 9 to be less than or equal to 8
```
Exit code: 1 (Fails on base regression condition; passes on head when file is deleted).

### 3. Typecheck (AC6)
```bash
pnpm typecheck
```
Output:
```
> flowline@0.1.0 typecheck
> tsc --noEmit
```
Exit code: 0

### 4. Linter (AC6)
```bash
pnpm eslint tests/unit/e2e-signup-verify-guard.test.ts
```
Output: Clean (no errors, no warnings)
Exit code: 0
