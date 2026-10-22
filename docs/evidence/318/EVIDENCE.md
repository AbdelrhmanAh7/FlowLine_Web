# Evidence for Issue #318: fix: qa finding: Account security two-factor card RTL handling and documentation

PR #327 (supersedes part of #269, parent issue #199).
Branch: `ai/318`
Tested commit SHA: `8ff9e77295b44634ead6d6dab4a3669e5d791ea1`

## Acceptance Criteria and Verification Report

| AC | Requirement | Verification Method | Result | Exit Code |
|---|---|---|---|---|
| **AC1** | Document `/account/security` route and `TwoFactorCard` enrolment/disabling in `docs/security/ACCOUNT_SECURITY.md` and index it in `docs/README.md` with status `draft` (`owner-review: yes`). | Verified via `tests/unit/docs-index.test.ts:32-52` checking table row in `docs/README.md` and required content in `docs/security/ACCOUNT_SECURITY.md`. | PASS (6/6 tests) | 0 |
| **AC2** | Localize TOTP specification with Arabic terms (`TOTP (SHA-1، 6 أرقام، خطوة 30 ثانية)`) and English specification, reword password handling to "cleared from the input on submit", remove unverified engine decoupling claims, and cite federated MFA fencing implementation (`src/server/federated-mfa.ts`) and tests (`tests/unit/mfa-session-fence.test.ts`, `tests/integration/sec-federated-mfa-regression.test.ts`). | Verified via `tests/unit/docs-index.test.ts:40-52` checking all required phrases and file citations in `docs/security/ACCOUNT_SECURITY.md`. | PASS (6/6 tests) | 0 |
| **AC3** | `TwoFactorCard` disables Cancel button while requests are pending (`disabled={pending !== null}`), and enforces request-id stale-response guards (`requestIdRef`) across `enable()`, `verify()`, `disable()`, and `cancel()` to discard late in-flight responses. Clears sensitive input fields from DOM on submit and cancel. | Verified via `tests/unit/account-security-two-factor.test.ts` ("Cancel button states while pending", "Input clearing and DOM security", and "API contract and stale response dropping on Cancel") with real render assertions and late-resolving promise simulation. | PASS (11/11 tests) | 0 |
| **AC4** | Explicitly set `dir="ltr"` for TOTP secret (`data-testid="totp-secret"`), backup-codes container (`<ul dir="ltr" data-testid="backup-codes">`), individual backup codes (`<li dir="ltr">`), and the 6-digit code input (`inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`, `dir="ltr"`). Use `data-testid="totp-secret"` uniformly across tests and documentation. | Verified via `tests/unit/account-security-two-factor.test.ts` real render assertions under Arabic RTL context with `renderToStaticMarkup`. | PASS (11/11 tests) | 0 |
| **AC5** | Use consistent em-dash (`—`, U+2014) in `src/i18n/messages/ar.json` for `account.security.twoFactor.backupCodes` matching `en.json`. Read string dynamically from `ar.json` in tests. Disable endpoint sends password-only JSON payload to `/api/auth/two-factor/disable` (no `code` field). | Verified via `tests/unit/account-security-two-factor.test.ts` ("Disable posts only password" and "renders enrolment state... Warning message comes directly from ar.json with em-dash") and `tests/unit/i18n.test.ts`. | PASS (16/16 tests) | 0 |

---

## Bug Fix Regression Analysis: Base vs Head

### Base Behavior (commit `688eeafe`)
1. **Missing LTR Attributes on RTL Surfaces**:
   - `src/app/account/security/two-factor-card.tsx` rendered the TOTP secret (`<code id="two-factor-secret">`) and backup codes (`<ul data-testid="backup-codes">`) without `dir="ltr"`. Under Arabic locale (`dir="rtl"`), digits and hyphenated tokens inverted visual direction.
   - The 6-digit code `<Input>` lacked `dir="ltr"`, `inputMode="numeric"`, and `autoComplete="one-time-code"`.
   - As flagged by QA Second Opinion (`c6884dc66fc8`), assertions at `e2e/account-security.spec.ts:53-54` and `e2e/arabic.spec.ts:383-385` (`getComputedStyle(el).direction === "ltr"`) failed against base.
2. **Punctuation Discrepancy in Arabic Localization**:
   - `src/i18n/messages/ar.json` used an ASCII hyphen (`-`) instead of an em-dash (`—`, U+2014) in `account.security.twoFactor.backupCodes`, failing QA finding `1efdd3f4963a`.
3. **Flaky Static Unit Test**:
   - `tests/unit/account-security-two-factor.test.ts` used string regex scanning (`expect(src).toContain(...)`) that failed at line 13 on base (QA finding `7532d40eb9a4`) rather than validating rendered DOM attributes and behavior.
4. **Documentation Inaccuracies**:
   - `docs/README.md` listed `ACCOUNT_SECURITY.md` as `approved` instead of `draft`.
   - `docs/security/ACCOUNT_SECURITY.md` included unverified statements regarding engine decoupling and `src/server/access.ts`.

### Head Behavior (Verified Pass)
1. **Explicit LTR Attributes**:
   - `src/app/account/security/two-factor-card.tsx`:
     - `<code id="two-factor-secret" dir="ltr" data-testid="totp-secret">` ensures base32 secret is explicitly LTR.
     - `<ul dir="ltr" data-testid="backup-codes">` and `<li dir="ltr">` ensure backup codes are explicitly LTR.
     - `<Input ref={codeRef} id="two-factor-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" />` ensures input is LTR, numeric-optimized, and integrates with OTP autofill.
2. **Consistent Em-Dash Localization**:
   - `src/i18n/messages/ar.json`: `account.security.twoFactor.backupCodes` contains em-dash (`—`, U+2014) matching `en.json`.
3. **Real Render Unit Assertions**:
   - `tests/unit/account-security-two-factor.test.ts` renders `TwoFactorCard` via `renderToStaticMarkup` with `I18nProvider`, asserting `dir="ltr"` attributes, disabled states during pending requests, sensitive input clearing, and stale response rejection when Cancel resolves late.
4. **Docs Verification & Compliance**:
   - `docs/README.md` updated to `draft` (`owner-review: yes`).
   - `docs/security/ACCOUNT_SECURITY.md` reflects verified implementation and cites `src/server/federated-mfa.ts` and test files directly.

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
   - Verifies valid Playwright command strings for account security in `docs/implementation/PHASE4_BETA_REPORT.md`.

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
- **Originating Sentry issue:** None (feature & QA finding split from PR #269 / parent issue #199; not triggered by an unhandled Sentry crash report).
- **QA review findings resolved:**
  - Finding `16e8ebd254b1`: Explicit `dir="ltr"` on TOTP secret and backup codes in `two-factor-card.tsx`
  - Finding `1efdd3f4963a`: Em-dash (`—`) in `ar.json` for `account.security.twoFactor.backupCodes`
  - Finding `7532d40eb9a4`: Real render assertions in `tests/unit/account-security-two-factor.test.ts`
  - Finding `c6884dc66fc8`: Uniform `data-testid="totp-secret"` locator and RTL/LTR attributes
- **Supersedes:** Supersedes part of #269.
