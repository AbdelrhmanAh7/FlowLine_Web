# H3 security review and PR handoff — 2026-10-03

Reviewed `origin/main...HEAD` and `origin/main..HEAD` at HEAD `2c85f058c2bf382ee861a2c2007af129705c62c6`. Requested delivery branch: `codex/paid-pilot-federated-mfa-20261003`. Actual checkout: `claude/h3-mfa-ready`, same requested head. Changes remain uncommitted in this worktree; the orchestrator owns transfer to the delivery branch, commit, PR and CI. No GitHub writes occurred.

Local `origin/main` is `9641ad1e684cad7b84bd2385751ea19b0a9d4060`. `git rev-list --left-right --count origin/main...HEAD` returned `0 2`: not behind the local ref, two commits ahead (`08355ae` SSO linking/mailbox fencing plus `2c85f05` H3). This is not an H3-only diff. `git merge-tree --write-tree origin/main HEAD` passed with tree `2d8a31c78cbd56a2d223b5ee3354385745af6dd8`, no conflicts. The initial invocation could not write shared `.git/objects`; the successful invocation used `GIT_OBJECT_DIRECTORY=<this-worktree>/artifacts/phase-4/h3-readiness/git-objects` and `GIT_ALTERNATE_OBJECT_DIRECTORIES=C:/Users/Abdelrahman/Desktop/Personal_Project/FlowLine/.git/objects`. Neither refs nor the index changed. A read-only `git ls-remote origin refs/heads/main` failed with `SEC_E_NO_CREDENTIALS`, so remote freshness is unverified.

## Findings fixed

1. **High: unassured ordinary sessions.** `access.ts` and Better Auth's internal account middleware accepted any live session while only platform access checked assurance. The shared adapter now rejects enrolled accounts lacking exact-session/current-factor proof, with cookie caching disabled. Pre-enrollment and legacy sessions require reauthentication. Refresh cannot mint/extend assurance, and revoked sessions remain unusable.
2. **Medium: incomplete pending authority fences.** Global pending challenges did not retain app configuration or account/password state. They now bind/recheck these authorities under completion locks, invalidate on unlink/relink/recovery/password/factor changes and remove rejected unissued sessions. Callback configuration is checked after provider work. Existing workspace configuration/membership/link/initiating-session checks are retained.
3. **Medium: stale local assurance during linking.** The final link transaction now rechecks the verified factor, local credential and user timestamp after password/TOTP verification, preventing a concurrent replacement from authorizing a stale link. A PostgreSQL race regression is written, not executed.
4. **Low: false credential verification.** A session-cookie deletion previously matched the success regex. Only a nonempty, nonexpired issued cookie counts. For MFA sign-in, metadata is marked after completion and only for the matching app ID/revision, preserving the clear/recreate fence.
5. **Low: error-copy gaps.** The MFA page differentiates wrong codes, expiry, throttling, network errors and other failures in existing AR/EN copy. `PLATFORM_MFA_REQUIRED` is now in the translated API-error allowlist.
6. **High: revoked-session global account linking.** Installed Better Auth carries the user identity through an explicit OAuth link but does not recheck the initiating session after provider work. Server-controlled OAuth context now binds that session hash/configuration; account create/update hooks re-read authority, including direct ID-token linking. Real library GitHub callback tests cover success, logout, a different session, revocation/factor replacement during exchange and app revocation during exchange. Implicit-link policy remains unchanged.

No new MFA requirement is imposed on accounts that have not enrolled. Existing API keys remain independent machine credentials, subject to their existing revocation/scope/current-membership checks; they cannot substitute for browser MFA or access platform APIs. Existing completed sessions are not implicitly revoked by provider unlinking. No schema migration was needed. Google/GitHub implicit-link policy was retained; ZITADEL disables implicit linking as before.

## Exact validation commands and results

Final focused set (54 tests across 8 files passed, exit 0; `unit-link-final.log`):

```powershell
pnpm.cmd exec vitest run --project unit --configLoader runner tests/unit/mfa-session-fence.test.ts tests/unit/federated-mfa-lifecycle.test.ts tests/unit/auth-provider-fence.test.ts tests/unit/federated-mfa.test.ts tests/unit/auth-confirmation.test.ts tests/unit/zitadel-issuer-binding.test.ts tests/unit/zitadel-review-fixes.test.ts tests/unit/i18n.test.ts
```

Changed-file lint passed, exit 0, followed by successful focused lint after later fixes. These commands produced no output, so PowerShell's `Tee-Object` did not create lint log files:

```powershell
pnpm.cmd exec eslint --no-cache 'src/app/(auth)/auth/step-up/page.tsx' src/i18n/errors.ts src/lib/auth.ts src/server/auth-dispatch.ts src/server/federated-mfa.ts src/server/sso-link.ts tests/unit/mfa-session-fence.test.ts tests/unit/federated-mfa-lifecycle.test.ts tests/unit/auth-provider-fence.test.ts tests/unit/i18n.test.ts tests/integration/sec-federated-totp.test.ts tests/integration/sec-platform.test.ts tests/integration/sec-sso-link-consent.test.ts tests/integration/zitadel-callback-fixture.ts
pnpm.cmd exec eslint --no-cache src/server/federated-mfa.ts tests/unit/mfa-session-fence.test.ts tests/integration/sec-platform.test.ts
pnpm.cmd exec eslint --no-cache src/server/federated-mfa.ts src/server/auth-dispatch.ts src/server/platform-secrets.ts tests/unit/federated-mfa-lifecycle.test.ts tests/unit/auth-provider-fence.test.ts
pnpm.cmd exec eslint --no-cache src/server/federated-link.ts src/server/federated-mfa.ts src/lib/auth.ts tests/unit/mfa-session-fence.test.ts
```

`pnpm.cmd typecheck` was run **once** and exited 2 (`typecheck.log`). It found three errors: generic session-row cast, Buffer passed to a string-only fixture, and missing `createUser` provisioning source. All three were corrected in source (runtime shape validation, UTF-8 conversion, `{ method: "email-password" }` per installed definitions). The user allowed at most one typecheck, so **the final tree has no passing typecheck result**. Focused tests and lint passed after correction; CI must confirm types, including the subsequent credential-verification metadata and global-link changes.

`git diff --check` passed. `node artifacts/phase-4/h3-readiness/snapshot.mjs` records the uncommitted source/docs/test fingerprint and i18n parity in `source-manifest.json`. Message-key parity passes. Literal JSON-leaf equality does not: Arabic has 126 additional plural-category leaves, also present in local `origin/main`; these are intentional CLDR forms and were preserved. This distinction is not a new H3 missing-translation defect.

Earlier focused runs: session fence 5 then 6 tests passed; seven-file set 43 passed; provider-fence draft first failed parsing (missing closure), then failed because its mock returned undefined instead of a Promise; both fixture defects were fixed, after which all 4 provider tests passed. The metadata regression brings that file to 5 tests. Eight-file sets of 47 and 48 tests passed before the global-link additions; focused link checks then passed 18/19 tests with the ZITADEL regression file. The final 54-test set covers all additions. No assertion was removed, weakened, skipped or retried unchanged. Standalone Node `-e`/`-p` probes hit PowerShell quoting errors; the file-backed snapshot command replaces those probes.

## Documentation and gaps

Updated auth behavior/security design/review, README, developer guide, AR/EN beta user guide, private-beta runbook, ZITADEL assessment, privacy inventory, phase-4 ledger and scope matrix. The manifest lists every changed source/document/test file.

**Not executed:** PostgreSQL integration tests (including concurrency/revocation and the new linking race), contract suite, browsers/Playwright, live Google/GitHub/ZITADEL, real email, full CI, build or gate. No Docker, databases, installs, commits, pushes, PRs, merges or deployments. The installed Better Auth in-memory middleware tests are real library execution; mocked transaction tests are not PostgreSQL lock proof. Remote-main freshness and final typecheck need orchestrator/CI verification. This is a source-review handoff, not merge or release approval.

Automatic policy review blocked cleanup of the temporary merge-check objects. They remain under `git-objects/`, excluded by this directory's `.gitignore`; do not force-add them. Shared Git storage was not changed.
