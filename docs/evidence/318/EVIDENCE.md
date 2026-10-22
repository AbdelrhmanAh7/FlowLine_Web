# Evidence for Issue #318: fix: qa finding: Account security two-factor card RTL handling and documentation

PR #327 (supersedes part of #269, parent issue #199).
Branch: `ai/318`

## Acceptance Criteria and Verification Report

| AC | Requirement | Verification Method | Result | Exit Code |
|---|---|---|---|---|
| **AC1** | Document `/account/security` route and `TwoFactorCard` enrolment/disabling in `docs/security/ACCOUNT_SECURITY.md` and index it in `docs/README.md` with status `draft` (`owner-review: yes`). | Verified via `tests/unit/docs-index.test.ts:32-52` checking table row in `docs/README.md` and required content in `docs/security/ACCOUNT_SECURITY.md`. | PASS (6/6 tests) | 0 |
| **AC2** | Localize TOTP specification with Arabic terms (`TOTP (SHA-1، 6 أرقام، خطوة 30 ثانية)`) and English specification, reword password handling to "cleared from the input on submit", remove unverified engine decoupling claims, and cite federated MFA fencing implementation (`src/server/federated-mfa.ts`) and tests (`tests/unit/mfa-session-fence.test.ts`, `tests/integration/sec-federated-mfa-regression.test.ts`). | Verified via `tests/unit/docs-index.test.ts:40-52` checking all required phrases and file citations in `docs/security/ACCOUNT_SECURITY.md`. | PASS (6/6 tests) | 0 |
| **AC3** | `TwoFactorCard` disables Cancel button while requests are pending (`disabled={pending !== null}`), and enforces request-id stale-response guards (`requestIdRef`) across `enable()`, `verify()`, `disable()`, and `cancel()` to discard late in-flight responses. Clears sensitive input fields from DOM on submit and cancel. | Verified via `tests/unit/account-security-two-factor.test.ts` ("Cancel button states while pending", "Input clearing and DOM security", and "API contract and stale response dropping on Cancel") with real render assertions and late-resolving promise simulation. | PASS (11/11 tests) | 0 |
| **AC4** | Explicitly set `dir="ltr"` for TOTP secret (`data-testid="totp-secret"`), backup-codes container (`<ul dir="ltr" data-testid="backup-codes">`), individual backup codes (`<li dir="ltr">`), and the 6-digit code input (`inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`, `dir="ltr"`). Use `data-testid="totp-secret"` uniformly across tests and documentation. | Verified via `tests/unit/account-security-two-factor.test.ts` real render assertions under Arabic RTL context with `renderToStaticMarkup`. | PASS (11/11 tests) | 0 |
| **AC5** | Use consistent em-dash (`—`, U+2014) in `src/i18n/messages/ar.json` for `account.security.twoFactor.backupCodes` matching `en.json`. Read string dynamically from `ar.json` in tests. Disable endpoint sends password-only JSON payload to `/api/auth/two-factor/disable` (no `code` field). | Verified via `tests/unit/account-security-two-factor.test.ts` ("Disable posts only password" and "renders enrolment state... Warning message comes directly from ar.json with em-dash") and `tests/unit/i18n.test.ts`. | PASS (16/16 tests) | 0 |

---

## Changed Covering Tests

1. `tests/unit/account-security-two-factor.test.ts`:
   - Real render assertions using `renderToStaticMarkup` with `I18nProvider`:
     - Checks `data-testid="totp-secret"` and `dir="ltr"` on the TOTP secret element.
     - Checks `data-testid="backup-codes"` and `dir="ltr"` on the backup-codes list and individual items.
     - Checks `dir="ltr"`, `inputMode="numeric"`, `autoComplete="one-time-code"`, and `maxLength="6"` on the code input.
     - Reads `arJson.account.security.twoFactor.backupCodes` directly from `src/i18n/messages/ar.json` to verify em-dash (`—`) without hardcoded strings.
   - Cancel button disabled while pending:
     - Verified disabled when `pending === "enable"`, `pending === "verify"`, and `pending === "disable"`.
     - Verified enabled when `pending === null`.
   - Sensitive DOM input clearing:
     - Verifies `takeSecret()` wipes password field immediately upon reading.
     - Verifies code input value is cleared upon submit.
   - Stale response dropping:
     - Starts an in-flight enable request, cancels mid-request, then resolves the mocked promise. Proves state is not overwritten by late response.
   - Disable API contract:
     - Asserts `api("/api/auth/two-factor/disable")` is called with `{ password }` only (no `code` property).

2. `tests/unit/docs-index.test.ts`:
   - Asserts `docs/security/ACCOUNT_SECURITY.md` is indexed in `docs/README.md` with status `draft` and `owner-review: yes`.
   - Asserts presence of required terms and file references in `docs/security/ACCOUNT_SECURITY.md`, and absence of unverified engine decoupling claims.

3. `e2e-army/199-disable-two-factor.e2e.ts`:
   - Adds scenario `@issue-318 AC4: Arabic account security page renders RTL context with LTR credentials` tagged `feat:fl-i18n-rtl`.
   - Exercises the Arabic account security view (`lang="ar"`, `dir="rtl"`) with the seeded `fl-user` session.

4. `tests/unit/i18n.test.ts`:
   - 16/16 catalog tests verify matching Arabic and English key sets and structure.

---

## Local Verification Commands and Outputs

### 1. Unit Tests
```bash
$ pnpm vitest run tests/unit/account-security-two-factor.test.ts tests/unit/docs-index.test.ts tests/unit/i18n.test.ts --maxWorkers=2
 ✓ |unit| tests/unit/docs-index.test.ts (6 tests)
 ✓ |unit| tests/unit/account-security-two-factor.test.ts (11 tests)
 ✓ |unit| tests/unit/i18n.test.ts (16 tests)

 Test Files  3 passed (3)
      Tests  33 passed (33)
Exit code: 0
```

### 2. TypeScript Typecheck
```bash
$ pnpm typecheck
> flowline@0.1.0 typecheck
> tsc --noEmit
Exit code: 0
```

### 3. ESLint Check
```bash
$ pnpm lint
> flowline@0.1.0 lint
> eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0 (0 errors, 0 warnings)
```

### 4. Evidence Secrets Audit
```bash
$ node scripts/check-evidence-secrets.mjs
check-evidence-secrets: 0 local secret value(s) checked across 176 file(s); 0 hit(s)
Exit code: 0
```

### 5. Playwright & E2E Status
Local Playwright execution requires `.env.test` with a running test stack (Postgres + web server + worker), which is not present in this worktree (`ENOENT: no such file or directory, open '.env.test'`). Full Playwright tests (`e2e/account-security.spec.ts`, `e2e/arabic.spec.ts`) and E2E Army tests (`e2e-army/199-disable-two-factor.e2e.ts`) run on GitHub Actions CI.

---

## Originating Issues & QA Findings

- **Parent issue:** #199
- **Split from:** PR #269 (finding `2c5fe85838f9`)
- **QA review findings resolved:**
  - Finding `16e8ebd254b1`: Explicit `dir="ltr"` on TOTP secret and backup codes in `two-factor-card.tsx`
  - Finding `1efdd3f4963a`: Em-dash (`—`) in `ar.json` for `account.security.twoFactor.backupCodes`
  - Finding `7532d40eb9a4`: Real render assertions in `tests/unit/account-security-two-factor.test.ts`
  - Finding `c6884dc66fc8`: Uniform `data-testid="totp-secret"` locator and RTL/LTR attributes
- **Supersedes:** Supersedes part of #269.
