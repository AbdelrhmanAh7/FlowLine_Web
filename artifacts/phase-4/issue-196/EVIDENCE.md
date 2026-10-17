# Issue #196 Verification Report & Evidence

Part 1/4 of #195: Account security page (page, menu link and read-only MFA status).

## Explicit Acceptance Criteria

- **AC1:** Signed in as a regular (non-admin) user: user menu, Account, **Security** opens `/account/security`.
- **AC2:** The page shows "Two-step verification" with **Off** for a user without MFA and **On** for a user whose `twoFactorEnabled` is true.
- **AC3:** A signed-out visit to `/account/security` redirects to `/sign-in`.
- **AC4:** Every new string exists in `ar.json` and `en.json` with identical keys; the layout uses logical CSS so it is correct in RTL.
- **AC5:** No change to `src/app/admin/setup/setup-flow.tsx`, the auth library setup, workflows/CI or the DB schema.

## Verification Mapping

| Criterion | Covering Tests & Verification Commands | Observed Exit Code / Result |
|---|---|---|
| **AC1** (Menu link to `/account/security`) | `e2e/account-security.spec.ts` ("user menu opens the security page and shows the two-step status")<br>`e2e-army/85-sign-in-and-core-flow.e2e.ts` ("@issue-196 AC1: the user menu opens the security page showing two-step verification Off")<br>`e2e-army/features/ui-flows.e2e.ts` ("[fl-workspace-nav.3]") | Exit 0 (all checks passing, menuitem "Security" navigates to `/account/security`) |
| **AC2** (MFA status On/Off) | `e2e/account-security.spec.ts` (verifies initial "Off" status, enables TOTP via API, reloads and verifies "On" status)<br>`src/app/account/security/page.tsx` (queries `db.select({ on: schema.user.twoFactorEnabled }).from(schema.user).where(eq(schema.user.id, user.id))` and renders tone="success" "On" or tone="muted" "Off") | Exit 0 (badge renders "Off" when false, "On" when true) |
| **AC3** (Signed-out redirect) | `e2e/account-security.spec.ts` ("a signed-out visit to the security page redirects to sign-in")<br>`e2e-army/109-account-delete-shared-audit.e2e.ts` ("@issue-196 AC3: a signed-out visit to the security page redirects to sign-in")<br>`e2e-army/features/core-api.e2e.ts` ("[fl-email-flows.7]") | Exit 0 (`GET /account/security` without session returns 307 redirect with `Location: /sign-in`) |
| **AC4** (i18n parity & RTL layout) | `tests/unit/i18n.test.ts` (16 tests verifying exact key parity between `messages/ar.json` and `messages/en.json`)<br>`src/app/account/security/page.tsx` uses only logical CSS (`mx-auto`, `text-start`, `justify-between`, `flex-col`, `gap-4`) | Exit 0 (16/16 tests pass, 0 missing keys, no physical direction classes) |
| **AC5** (No schema/CI changes) | `git status`, `git diff --stat origin/main..HEAD` confirms no changes to `setup-flow.tsx`, `better-auth`, `.github/workflows/`, or `drizzle/` schema | Verified: 0 forbidden files touched |

## Changed Covering Tests

1. `e2e/account-security.spec.ts` (new Playwright spec):
   - Tests navigation from user menu to `/account/security`.
   - Tests "Off" status for user without MFA.
   - Tests "On" status after enabling TOTP via auth API.
   - Tests signed-out redirect from `/account/security` to `/sign-in`.
2. `e2e-army/85-sign-in-and-core-flow.e2e.ts`:
   - Adds scenario `@issue-196 AC1: the user menu opens the security page showing two-step verification Off` tagged `feat:fl-workspace-nav`.
3. `e2e-army/109-account-delete-shared-audit.e2e.ts`:
   - Adds scenario `@issue-196 AC3: a signed-out visit to the security page redirects to sign-in` tagged `feat:fl-email-flows`.
4. `e2e-army/features/ui-flows.e2e.ts`:
   - Adds scenario `[fl-workspace-nav.3]` covering menu click and "Off" status in workspace navigation shard.
5. `e2e-army/features/core-api.e2e.ts`:
   - Adds scenario `[fl-email-flows.7]` covering 3xx redirect to `/sign-in` for unauthenticated requests.
6. `scripts/gate-groups.mjs`:
   - Registers `account-security` in the `auth` gate group.

## Verification Commands & Outputs

### 1. Unit Tests (i18n, gate-groups, e2e-army-tooling)
```
$ pnpm test tests/unit/i18n.test.ts
✓ |unit| tests/unit/i18n.test.ts (16 tests) 72ms
Test Files  1 passed (1)
     Tests  16 passed (16)
Exit code: 0

$ pnpm test tests/unit/gate-groups.test.ts
✓ |unit| tests/unit/gate-groups.test.ts (8 tests) 3ms
Test Files  1 passed (1)
     Tests  8 passed (8)
Exit code: 0

$ pnpm test tests/unit/e2e-army-tooling.test.ts
✓ |unit| tests/unit/e2e-army-tooling.test.ts (12 tests) 1991ms
Test Files  1 passed (1)
     Tests  12 passed (12)
Exit code: 0
```

### 2. Static Analysis (TypeScript & ESLint)
```
$ pnpm typecheck
> tsc --noEmit
Exit code: 0 (clean)

$ pnpm lint
> eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0 (clean)
```

### 3. Feature Coverage Mapping
```
$ node /Users/abdelrahmanahmed/agents/hub-live/src/lib/featurecov.ts map FlowLine_Web src/app/account/security/page.tsx src/components/shell/app-shell.tsx
{
 "features": [
  "fl-email-flows",
  "fl-workspace-nav"
 ],
 "unmapped": [],
 "ignored": []
}
```
All touched features mapped cleanly with zero unmapped gaps.
Both `feat:fl-email-flows` and `feat:fl-workspace-nav` are covered by top-level tests in `e2e-army/`.
Top-level e2e-army file count is preserved at exactly 8 (under the 8-file cap).
