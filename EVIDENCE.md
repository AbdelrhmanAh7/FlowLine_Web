# Evidence — Issue #318: fix: qa finding: The PR includes changes to src/app/account/security/two-factor-card.tsx (split from #269)

PR #327 (supersedes part of #269, parent issue #199).

All checks and tests were executed locally in the workspace `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-318`.

## Acceptance Criteria and Verification Report

| Req / AC | Description | Verification Method | Result | Exit Code |
|---|---|---|---|---|
| **AC1** | Document `/account/security` route and `TwoFactorCard` enrolment/disabling in `docs/security/ACCOUNT_SECURITY.md` and index in `docs/README.md`. | Verified via `tests/unit/docs-index.test.ts:32-51` checking table row in `docs/README.md` and content in `docs/security/ACCOUNT_SECURITY.md`. | PASS (6/6 unit tests) | 0 |
| **AC2** | Localize TOTP specification with Arabic terms (`TOTP (SHA-1، 6 أرقام، خطوة 30 ثانية)`) and English specification, reword password handling to "cleared from the input on submit", scope Engine decoupling, and cite federated MFA fencing implementation (`src/server/federated-mfa.ts`) and tests (`tests/unit/mfa-session-fence.test.ts`, `tests/integration/sec-federated-mfa-regression.test.ts`). | Verified via `tests/unit/docs-index.test.ts:40-51` asserting each required phrase and code reference is present in `docs/security/ACCOUNT_SECURITY.md`. | PASS (6/6 unit tests) | 0 |
| **AC3** | `TwoFactorCard` disables Cancel button while requests are pending (`disabled={pending !== null}`) and enforces request-id stale-response guards (`requestIdRef`) across `enable()`, `verify()`, `disable()`, and `cancel()` to discard late in-flight responses. Clears sensitive input fields from DOM on submit. | Verified via `tests/unit/account-security-two-factor.test.ts:22-56, 79-88, 97-144` asserting button attributes, function guards, DOM clearing, and mid-request cancellation simulation. | PASS (11/11 unit tests) | 0 |
| **AC4** | Explicitly set `dir="ltr"` for TOTP secret (`<code id="two-factor-secret">`), backup codes container (`<ul data-testid="backup-codes">`), and individual backup codes (`<li dir="ltr">`) to ensure correct display in Arabic/RTL contexts, with explanatory code comments. | Verified via `tests/unit/account-security-two-factor.test.ts:58-69`. | PASS (11/11 unit tests) | 0 |
| **AC5** | In `src/i18n/messages/ar.json`, use an em-dash (`—`) for `account.security.twoFactor.backupCodes` for consistency with Arabic translation conventions and `en.json`. | Verified via `tests/unit/account-security-two-factor.test.ts:71-77` and `tests/unit/i18n.test.ts` (16/16 unit tests). | PASS (16/16 unit tests) | 0 |
| **AC6** | Update `NEXT_ACTION.md` and `docs/implementation/PHASE4_BETA_REPORT.md` referencing PR #327 (supersedes part of #269) and accurately qualifying test commands: `pnpm exec playwright test e2e/account-security.spec.ts --project=chromium --workers=1` (4 passed) plus `pnpm exec playwright test e2e/arabic.spec.ts -g "Arabic account security page" --project=chromium --workers=1` (1 passed) = 5/5 passed specs. | Verified via `tests/unit/docs-index.test.ts:53-64` in `NEXT_ACTION.md` and `docs/implementation/PHASE4_BETA_REPORT.md`. | PASS (6/6 unit tests) | 0 |
| **AC7** | All acceptance criteria met with appropriate unit and regression tests in `tests/unit/account-security-two-factor.test.ts` (11 tests) and `tests/unit/docs-index.test.ts` (6 tests). Pre-push checks (typecheck, lint, secrets audit) pass cleanly. | `pnpm vitest run`, `pnpm typecheck`, `pnpm lint`, and `node scripts/check-evidence-secrets.mjs`. | PASS | 0 |

---

## Command Outputs

### 1. Unit Tests
```bash
$ pnpm vitest run tests/unit/account-security-two-factor.test.ts tests/unit/docs-index.test.ts tests/unit/i18n.test.ts --maxWorkers=2
✓ |unit| tests/unit/docs-index.test.ts (6 tests) 7ms
✓ |unit| tests/unit/account-security-two-factor.test.ts (11 tests) 63ms
✓ |unit| tests/unit/i18n.test.ts (16 tests) 110ms

Test Files  3 passed (3)
     Tests  33 passed (33)
```
Exit code: 0

### 2. TypeScript Typecheck
```bash
$ pnpm typecheck
> flowline@0.1.0 typecheck
> tsc --noEmit
```
Exit code: 0

### 3. ESLint Check
```bash
$ pnpm lint
> flowline@0.1.0 lint
> eslint . --cache --cache-location node_modules/.cache/eslint/
```
Exit code: 0

### 4. Evidence Secrets Audit
```bash
$ node scripts/check-evidence-secrets.mjs
check-evidence-secrets: 0 local secret value(s) checked across 176 file(s); 0 hit(s)
```
Exit code: 0
