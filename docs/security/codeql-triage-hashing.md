# CodeQL triage C: insufficient password hash (issue #113, part 3/4 of #63)

Scope: the two `js/insufficient-password-hash` alerts, in `src/server/rate-limit.ts` (#12) and
`e2e/fakes/ai-protocols.ts` (#10). For each one we first checked whether the hashed value is really a
password. Neither is, so both keep SHA-256 and are dismissed with the reason below. Each flagged line
also has a `CodeQL` comment with the same reason.

| Alert | Rule | File | Disposition | Reason |
|---|---|---|---|---|
| #10 | `js/insufficient-password-hash` | `e2e/fakes/ai-protocols.ts` | dismissed: used in tests | The fake AI hub (test double, only with `FLOWLINE_ENV=test`, listens on 127.0.0.1) records a SHA-256 fingerprint of the fake `sk-fake-…` key a request carried. Tests use it to check which key was sent, so the request log never holds the key. Nothing is stored or checked as a password. The tests (`tests/integration/ai-hub*.test.ts`, `e2e/ai-hub.spec.ts`) compute the same SHA-256, so the fingerprint must stay plain SHA-256. |
| #12 | `js/insufficient-password-hash` | `src/server/rate-limit.ts` | dismissed: false positive | `checkRate` hashes rate-limit bucket names such as `apikey:<api key row id>`, `runs:<user id>`, `platform-write:<user id>` or `public-body:<kind>:<ip>`. No password, API-key secret or token reaches it. CodeQL keys on the `apiKeyId`/`keyId` name, but that value is only the row id. SHA-256 only keeps ids out of the `rate_limit_hit` table. scrypt/argon2 would slow every rate-limit check and add no security. |

## Options we did not take

- **HMAC-SHA-256 with a non-secret salt constant.** We did not use it. A salt that is not secret makes the
  rate-limit keys no harder to guess than plain SHA-256. Changing the hash would also change the stored
  `rate_limit_hit.key` values, so every open window would reset once at deploy, and the brief requires
  the rate-limit behaviour to stay identical. CodeQL models `createHmac` with SHA-256 as the same weak
  hashing operation, so the change would probably not close the alert either. In the fake, an HMAC would
  also break the tests that compare `keySha256` with their own SHA-256.
- **scrypt or argon2.** These are only for real passwords or secrets. Neither value here is one.

## Verification

- `pnpm vitest run --project unit tests/unit/codeql-triage-hashing.test.ts`: checks that `checkRate`
  still sends the SHA-256 hex of the bucket name (never the name itself) to the advisory lock and to the
  delete, count and insert statements. It also checks the limit and refusal logic, the `runs:` prefix and
  429 from `checkRunRate`, and that the fake hub records `sha256(key)` and never the key itself. It also
  checks that both rows above and the comments at the flagged lines exist.
- The PostgreSQL behaviour (sliding window, global limit under concurrency) is still covered by
  `tests/integration/p4-rate-limit.test.ts`. The code under test did not change.
- No credentials were read, created or printed. The test uses fixed fake values only. No CodeQL CLI was
  run locally; the PR's CodeQL run is the check.

## Dismissing on GitHub (repository admin, after the merge)

```sh
gh api -X PATCH repos/AbdelrhmanAh7/FlowLine_Web/code-scanning/alerts/10 -f state=dismissed -f dismissed_reason="used in tests" -f dismissed_comment="See docs/security/codeql-triage-hashing.md (#113)"
gh api -X PATCH repos/AbdelrhmanAh7/FlowLine_Web/code-scanning/alerts/12 -f state=dismissed -f dismissed_reason="false positive" -f dismissed_comment="See docs/security/codeql-triage-hashing.md (#113)"
```
