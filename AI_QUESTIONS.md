# Questions for the owner — issue #66

## REQ-FL-66-5: audit entry after a failed or abandoned federated MFA step

The issue and PRD ask for a test that "a failed or abandoned MFA step ... writes an audit entry", with the event "taken from the existing audit code". They also say "tests only, no production behaviour change".

The existing code writes no audit entry on a failed or abandoned federated MFA step:

- `completeFederatedChallenge` (`src/server/federated-mfa.ts`) throws `FEDERATED_MFA_CODE_INVALID` (403) or `FEDERATED_MFA_INVALID` (401) without writing to `audit_event` or `platform_audit`. An abandoned challenge just expires in `verification` after ten minutes.
- `docs/security/FEDERATED_MFA.md` states the design: "Audit is emitted only on successful completion." The only federated sign-in audit is `sso.signin` (workspace audit, `data.localTotp: true`), written inside the completion transaction.
- The nearest failure audit is `admin.stepup` / `denied` in `platform_audit`, but that belongs to platform-admin step-up (`performStepUp`), not the federated challenge.

A test asserting a failure audit would fail on main, and making it pass needs a production change, which the issue rules out. So the branch tests what the code does: a failed or abandoned step leaves no usable session and no `sso.signin` entry, and completing the step writes exactly one `sso.signin` with `localTotp: true` (AC3 tests). It does not claim REQ-FL-66-5 is met.

**Decision needed:** should a failed or abandoned federated MFA step be audited?

1. **Yes:** open a follow-up issue for the production change. Suggested shape: a new workspace action (for example `sso.mfa_failed`) for workspace challenges and a `platform_audit` action for global-provider challenges, written outside the rolled-back completion transaction, with bounded reason codes only (`invalid_code`, `replayed_code`, `expired`, `rate_limited`) and never the code itself. "Abandoned" has no request to hook, so it would need a sweep of expired `federated-mfa:*` rows. Then add the REQ-FL-66-5 test there.
2. **No:** keep "audit only on success", and drop REQ-FL-66-5 from the PRD.
