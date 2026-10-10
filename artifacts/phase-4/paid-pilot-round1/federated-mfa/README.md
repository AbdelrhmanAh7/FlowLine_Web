# Local H3 candidate validation

> **Historical / superseded.** This validation describes an earlier H3 candidate. The current implementation fences every Better Auth adapter session read (not only the admin panel), binds session assurance to the current verified factor, and rejects replayed codes at the federated gates. The typecheck and 63-test integration results below belong to that candidate and are not validation of the current tree, whose status and gaps are in the [H3 readiness README](../../h3-readiness/README.md); behavior is in [FEDERATED_MFA.md](../../../../docs/security/FEDERATED_MFA.md). `reviewable.diff` and `focused-results.json` carry the same label.

Candidate branch: `codex/paid-pilot-federated-mfa-20261003`, based on the independently reviewed local auth commit `08355ae423aa91c7d2b6f106878603d3c2f98ecb`. No commit, push, PR, deployment, real provider, login or browser gate was performed by this worker.

## Immutable source provenance

The original `FL-wt-sec-auth` was read only. During inspection an external writer completed its H3 work and rebase. The imported tail is pinned to commit `8fa9c195e2914d06519cdaaef753e04aa60c50ca`; `git cherry-pick --no-commit` applied that commit to this separate worktree. The sole conflict, `src/server/sso.ts`, was resolved by retaining the reviewed candidate's user/config/member/account/session authority fence and incorporating the new pending-factor path. No original files, reflog, branch, stash or worktree were changed by this worker.

The imported `artifacts/phase-4/security-auth/` logs and README are historical source evidence retained verbatim. Their vulnerable base, 765 unit-test count and dedicated database are not this candidate's validation. The historical source-swapping regression script was not run. Current validation is listed below and in `focused-results.json`.

## Current behavior

- Enrolled custom SSO, global ZITADEL and GitHub sign-ins issue only an opaque, expiring pending-factor cookie before local TOTP. The pending cookie cannot authenticate a session or read the admin panel.
- The final challenge transaction consumes pending state once, rechecks the user/factor and held session, and records session-bound MFA assurance. Custom SSO also rechecks enabled configuration and its revision, membership, mailbox verification and approved identity binding. Revocation while a challenge is pending fails closed.
- Better Auth adapter session hooks run outside database authority locks. A failing final fence deletes the unissued session. Admin reads require session-bound MFA assurance; writes retain their separate ten-minute TOTP step-up.
- English/Arabic copy uses the existing i18n catalogs. Existing verification records store expiring pending state and assurance; no schema migration is required.

## Focused results and limits

- Five focused unit files: **28 passed**, no skipped tests. Covers MFA paths/destinations, confirmation CSRF, ZITADEL issuer binding and registry behavior, and EN/AR key parity.
- Full TypeScript `--noEmit --incremental false`: passed.
- Targeted ESLint over all changed TS/TSX files: passed. Source/docs diff whitespace check: passed. Raw Vitest logs retain their original trailing blank lines, which the all-files whitespace check reports.
- Seven focused integration files: **63 passed**, no skipped tests, including 15 H3 cases and earlier H1/H2/M7, platform setup/admin and sign-in regressions.
- First integration attempt: 61 passed / 1 failed. The existing revoked-env regression expected a legacy Google variable from `.env.test`; this verifier never reads environment files. The runner supplies a synthetic legacy Google id/secret, then the same 62 assertions pass on a fresh disposable database. Both attempts are retained without overwriting evidence. After independent review, the initiating session id/user/hash was also retained through pending state and rechecked after TOTP; the added revocation regression passes in the final 63-test run.

`run-focused.mjs` uses only a cached Postgres image, a uniquely named/labelled disposable container, generated in-memory credentials and a fresh `flowline_test_pilotmfa` database. Both containers were removed in `finally`. It starts no web app or browser and performs no real provider request. Tests use signed synthetic OIDC tokens, mocked HTTP transport and some existing local HTTP doubles. No `.env` file is loaded or printed. No paid resource is provisioned.

Issue #36 follow-up: `run-focused.mjs` now passes the Vitest child an explicit environment allowlist from `scripts/focused-run-env.mjs` (OS/runtime names plus the synthetic values it constructs) instead of `process.env`, records the variable names (never values) under `childEnv` in new result JSON, and supports `--dry-run`. The allowlist and its limits are in [upload-admission/README.md](../upload-admission/README.md#child-environment-issue-36). The recorded integration attempts above predate it: their helper inherited the ambient shell and they carry no `childEnv`. The helper was not re-run (no Docker was started).

This is focused local proof. CI fast/full gates, browser UX, real IdP/email behavior, deployed acceptance and CodeRabbit review remain unverified. Independent review of the frozen candidate is required before the lead's local commit.
