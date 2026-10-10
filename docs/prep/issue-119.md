# Prep for #119: [e2e] Platform admin panel failing on main

> Offline floor prep (2026-10-10T16:24Z): capacity 0 — claude: claude daily budget spent (13% of 8% week-points) ; codex: Codex daily budget spent (10 of 7 week-points toda; opencode: held until 16:35Z (opencode rate-limited 6× in a r; agy: held until 10-14 14:35Z (3 d 22 h) ( error: Indivi. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stable-gate 2026-10-09 -->
**Stable release gate 2026-10-09:** `fl-platform-admin` failed on `main` @ `d211653`.

> /admin/copy: expected "<!DOCTYPE html><html id=\"__next_error__\"><head><meta charSet=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><link rel=\"preload\" as=\"script\" fetchPriority=\"low\" href=\"/_next/static/chunks/1_e6a85y-pivw.js\"/><script src=\"/_next/static/chunks/1eg3sl69jmsjd.js\" async=\"\"></script><script src=\"/_next/static/chunks/3x12uta91knz5.j

Evidence of the run: hub logs `~/agents/logs/stable/FlowLine_Web/2026-10-09`.

Reproduce: `ops/verify/e2e-army/run-local.sh FlowLine_Web d211653 -- --tag feat:fl-platform-admin` (hub repo). Fix the product, never weaken the test. The previous stable version stays deployed.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:qwen3:8b)

**TEST PLAN: e2e Platform Admin Panel Failing on Main**

1. **Test Case**: Admin login success  
   **Setup**: Navigate to `/admin/login` with valid credentials  
   **Assertion**: Redirect to dashboard, no error  
   **File**: `e2e/admin-login.spec.ts`  
   **Edge Case**: Invalid credentials, expect error message

2. **Test Case**: Admin dashboard load  
   **Setup**: Login as admin, navigate to `/admin/dashboard`  
   **Assertion**: Dashboard loads, no error  
   **File**: `e2e/admin-dashboard.spec.ts`  
   **Edge Case**: Network error, check error handling

3. **Test Case**: Copy functionality in admin panel  
   **Setup**: Navigate to `/admin/copy`  
   **Assertion**: Page loads, no error  
   **File**: `e2e/admin-copy.spec.ts`  
   **Edge Case**: Missing dependencies, check fallback

4. **Test Case**: Admin user management  
   **Setup**: Navigate to `/admin/users`  
   **Assertion**: Users list loads, no error  
   **File**: `e2e/admin-users.spec.ts`  
   **Edge Case**: No users, check empty state

5. **Test Case**: Admin settings page  
   **Setup**: Navigate to `/admin/settings`  
   **Assertion**: Page loads, no error  
   **File**: `e2e/admin-settings.spec.ts`  
   **Edge Case**: Invalid settings, check validation

6. **Test Case**: Admin logout functionality  
   **Setup**: Login, click logout  
   **Assertion**: Redirect to login page  
   **File**: `e2e/admin-logout.spec.ts`  
   **Edge Case**: Session timeout, check redirect

7. **Test Case**: Admin error page rendering  
   **Setup**: Navigate to non-existent admin route  
   **Assertion**: Error page renders, no crash  
   **File**: `e2e/admin-error.spec.ts`  
   **Edge Case**: 500 error, check error message

8. **Test Case**: Admin navigation links  
   **Setup**: Login, click navigation links  
   **Assertion**: Correct routes load, no errors  
   **File**: `e2e/admin-nav.spec.ts`  
   **Edge Case**: Broken links, check 404 handling
