# CodeQL triage C: insufficient password hash (issue #113, part 3/4 of #63)

Scope: the two `js/insufficient-password-hash` alerts, in `src/server/rate-limit.ts` (#12) and
`e2e/fakes/ai-protocols.ts` (#10). For each one we first checked whether the hashed value is really a
password. Neither is, so both keep SHA-256 and are classified as false positives. The GitHub dismissal is pending the post-merge admin action below. Each flagged line
also has a `CodeQL` comment with the same reason.

| Alert | Rule | File | Disposition | Reason |
|---|---|---|---|---|
| #10 | `js/insufficient-password-hash` | `e2e/fakes/ai-protocols.ts` | false positive (dismissal pending) | The value is a fake token in test-only code, not a password. The fake AI hub is a loopback-bound test double: `startFakeAi` listens on 127.0.0.1, and only the test stack (`scripts/dev-test.mjs`) and the test suites start it. It accepts only `sk-fake-…` keys and refuses any other key, except on the opt-in public model lists, which check no key. It logs the key a request carried in its `Authorization`, `x-api-key` or `x-goog-api-key` header only as a SHA-256 fingerprint and leaves those headers out of the logged headers, so tests can check which key was sent without the log holding it. Nothing is stored or checked as a password. The tests (`tests/integration/ai-hub*.test.ts`, `tests/contract/ai-openai-chat.test.ts`, `e2e/ai-hub.spec.ts`) compute the same SHA-256, so the fingerprint must stay plain SHA-256. |
| #12 | `js/insufficient-password-hash` | `src/server/rate-limit.ts` | false positive (dismissal pending) | `checkRate` hashes rate-limit bucket names such as `runs:apikey:<api key row id>`, `runs:<user id>`, `platform-write:<user id>` or `public-body:<kind>:<ip>`. No password, API-key secret or token reaches it (every caller is listed below). `runs:apikey:` (built by `checkRunRate` from `apikey:<id>`) uses the API key's row id (`apiKeyId`/`keyId`), not the key itself. SHA-256 turns any bucket name into a fixed-length table key and advisory-lock id. It is not meant to hide the name: low-entropy names (an IPv4 address, a known id) could be found again by brute force, and nothing secret is in them. scrypt/argon2 would slow every rate-limit check and add no security. |

## Caller audit for alert #12

Every `checkRate` / `checkRunRate` caller builds its bucket name from ids, enum values or a client IP only.
A new caller is added here after the same check, as the doc comment on `checkRate` asks:

| Caller | Bucket name |
|---|---|
| `src/app/api/v1/flows/[fid]/runs/route.ts`, `src/server/agents.ts` | `runs:apikey:<api key row id>` or `runs:<user id>` |
| `src/app/api/flows/[fid]/runs/route.ts`, `src/app/api/runs/[rid]/rerun/route.ts` | `runs:<user id>` |
| `src/server/copilot.ts` | `runs:copilot:<user id>` |
| `src/server/platform-http.ts`, `platform-access.ts`, `sso-link.ts`, `oauth-apps.ts`, `federated-mfa.ts` | `<action>:<user id>` or `<action>:<workspace id>` |
| `src/server/platform-secrets.ts` | `platform-probe:<user id or actor label>`, `platform-probe-purpose:<purpose>` |
| `src/server/platform-setup.ts` | `platform-setup-redeem:<client IP>`, `platform-setup-redeem:all`, `platform-setup-complete:<challenge id>` (the setup token is hashed separately and never reaches `checkRate`) |
| `src/server/public-body.ts` | `public-body:<kind>:<ip>` |
| `src/ai/hub/connections.ts` | `ai-key:user:<user id>`, `ai-key:conn:<connection id>` |

## What CodeQL traced

The sources CodeQL took for passwords, from its analysis of `main` at `6aa89ed` (analysis `1930269476`, read
on 2026-10-11 with `gh api`). None of them is a password:

| Alert | CodeQL source | Where | What reaches the hash |
|---|---|---|---|
| #10 | an access to `x-api-key`, an access to `x-goog-api-key` | `keyOf` in `e2e/fakes/ai-protocols.ts` | The key header of a request to the fake hub; the tests send fake keys. |
| #12 | a call to `authenticateApiKey` | `src/app/api/v1/flows/[fid]/runs/route.ts`, `src/app/api/v1/agents/[aid]/runs/route.ts` | The principal's `keyId`, the API key's row id, as `runs:apikey:<id>`; `authenticateApiKey` returns the row id, not the key. |
| #12 | an access to `apiKeyId` | `startAgentRun` in `src/server/agents.ts` | The same row id, passed in by the v1 agents route. |
| #12 | a call to `requireWorkspace` | `src/app/api/workspaces/[wid]/oauth-apps/[family]/probe/route.ts` | The workspace id, as `oauthapp-probe-ws:<workspace id>` through `probeWorkspaceApp`. |

## Options we did not take

- **HMAC-SHA-256 with a non-secret salt constant.** We did not use it. A salt that is not secret makes the
  rate-limit keys no harder to guess than plain SHA-256. Changing the hash would also change the stored
  `rate_limit_hit.key` values, so every open window would reset once at deploy, and the brief requires
  the rate-limit behaviour to stay identical. In the fake, an HMAC would also break the tests that compare
  `keySha256` with their own SHA-256.
- **scrypt or argon2.** These are only for real passwords or secrets. Neither value here is one.

## Verification

- `pnpm vitest run --project unit tests/unit/codeql-triage-hashing.test.ts`: checks that `checkRate`
  still sends the SHA-256 hex of the bucket name (never the name itself) to the advisory lock and to the
  delete, count and insert statements. It checks both sides of the limit (the last hit below it is
  recorded; a hit at it is refused and not recorded), the `runs:` prefix and 429 from `checkRunRate`, and
  that the fake hub accepts an `sk-fake-…` key, refuses another key with 401 and logs each key only as its
  SHA-256, without the key headers. It also checks that both rows above and the comments at the flagged
  lines exist.
- The PostgreSQL behaviour (sliding window, global limit under concurrency) is still covered by
  `tests/integration/p4-rate-limit.test.ts`. The code under test did not change.
- No credentials were read, created or printed. The test uses fixed fake values only. No CodeQL CLI was
  run locally. The code still uses SHA-256 and the comments do not suppress anything, so the PR's CodeQL
  run will still report #10 and #12; it only confirms that no new alerts were added. The two alerts close
  only through the dismissal commands below.

## Dismissing on GitHub (repository admin, after the merge)

```sh
gh api -X PATCH repos/AbdelrhmanAh7/FlowLine_Web/code-scanning/alerts/10 -f state=dismissed -f dismissed_reason="false positive" -f dismissed_comment="See docs/security/codeql-triage-hashing.md (#113)"
gh api -X PATCH repos/AbdelrhmanAh7/FlowLine_Web/code-scanning/alerts/12 -f state=dismissed -f dismissed_reason="false positive" -f dismissed_comment="See docs/security/codeql-triage-hashing.md (#113)"
```
