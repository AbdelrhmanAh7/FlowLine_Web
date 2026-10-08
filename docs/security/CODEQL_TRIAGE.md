# CodeQL code-scanning triage

Issue [#63](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/63). CodeQL default setup (on since 2026-10-03) reported 13 open alerts on 2026-10-07. Rule: fix each alert, or dismiss it with the reason written down next to the code (precedent: alert #11 in [FEDERATED_MFA.md](FEDERATED_MFA.md)). Every dismissed alert below also has a `CodeQL \`<rule>\` (alert #N)` comment at the flagged line, and `tests/unit/codeql-triage.test.ts` checks this table, those comments and that the fixed code stays gone.

Fixed alerts close when CodeQL rescans main after the merge. Dismissals are a GitHub action by a repository admin (commands below); until then those alerts stay open with their reason documented here. No CodeQL CLI was run locally; the PR's CodeQL run is the check.

| Alert | Rule | File | Disposition | Reason / fix |
| --- | --- | --- | --- | --- |
| #1 | `js/identity-replacement` | `tests/unit/cb-pack-customer-follow-up.test.ts` | fixed | Removed a no-op `.replace(/^\(/, "(")` from the expected value. |
| #2 | `js/incomplete-multi-character-sanitization` | `tests/unit/landing-header.test.ts` | fixed | The helper only compares visible button text; it now drops tags with `split(/<[^>]*>/).join("")`. |
| #3 | `js/incomplete-sanitization` | `e2e/phase3.spec.ts` | fixed | The fake checkout URL is escaped for every regex metacharacter, backslash included. |
| #4 | `js/incomplete-sanitization` | `scripts/stop-test-stack.mjs` | fixed | The PowerShell script is passed to `execFileSync` as one argument; no quote escaping is needed. |
| #5 | `js/stack-trace-exposure` | `e2e/fakes/provider-server.ts` | fixed | `/__fake/fault` answers an invalid `pathPattern` with a fixed message, not the caught exception. |
| #6 | `js/regex-injection` | `e2e/fakes/provider-server.ts` | dismissed: used in tests | Test-control endpoint of the fake provider server, which listens on 127.0.0.1 only; the pattern comes from the test that injects the fault, and an invalid one gets a 400. |
| #7 | `js/resource-exhaustion` | `e2e/fakes/ai-server.ts` | fixed | A slow fault's `delayMs` must be a number from 0 to 60000, checked when the fault is registered and again before `setTimeout`. |
| #8 | `js/disabling-certificate-validation` | `scripts/release/verify-beta-stack.mjs` | dismissed: won't fix | `--insecure-local` is an opt-in dry run against Caddy's internal CA and is now refused (exit 2) for any host but `localhost`, `127.0.0.1` or `[::1]`; every other host, the real beta domain included, keeps full certificate validation. |
| #9 | `js/server-side-unvalidated-url-redirection` | `e2e/fakes/provider-server.ts` | dismissed: used in tests | The fake Paddle checkout redirects to the caller's `success_url` exactly as Paddle.js does; the fake listens on 127.0.0.1 only and exists for the E2E billing flow. |
| #10 | `js/insufficient-password-hash` | `e2e/fakes/ai-protocols.ts` | dismissed: used in tests | The fake AI hub logs a SHA-256 fingerprint of the API key a request carried so tests can assert which key was sent without the log holding it; nothing is stored or verified as a password. |
| #12 | `js/insufficient-password-hash` | `src/server/rate-limit.ts` | dismissed: false positive | `checkRate` hashes bucket names such as `apikey:<row id>` or `platform-write:<user id>`; no password or API-key secret reaches it. CodeQL keys on the `apiKeyId` name; a slow KDF would only slow every rate-limit check. |
| #13 | `js/shell-command-injection-from-environment` | `scripts/stop-test-stack.mjs` | fixed | Commands run through `execFileSync` with argument arrays, and pids are killed with `process.kill`; no shell parses ports or pids. |
| #14 | `js/incomplete-url-substring-sanitization` | `tests/unit/ai-hub-wave-b.test.ts` | fixed | The price-source check accepts `cohere.com` or a `.cohere.com` subdomain, not any host ending in `cohere.com`. |

## Dismissing on GitHub (repository admin, after the merge)

```sh
dismiss() { gh api -X PATCH "repos/AbdelrhmanAh7/FlowLine_Web/code-scanning/alerts/$1" -f state=dismissed -f dismissed_reason="$2" -f dismissed_comment="See docs/security/CODEQL_TRIAGE.md (#63)"; }
dismiss 6 "used in tests"; dismiss 9 "used in tests"; dismiss 10 "used in tests"; dismiss 8 "won't fix"; dismiss 12 "false positive"
gh api 'repos/AbdelrhmanAh7/FlowLine_Web/code-scanning/alerts?state=open' --jq 'length'   # 0 once main is rescanned
```

A new alert follows the same rule: fix it, or add a row here and a comment at the code, then dismiss it with the matching reason.
