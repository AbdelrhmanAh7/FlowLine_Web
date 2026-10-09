# CodeQL triage D: e2e fake servers (#114, part 4/4 of #63)

Scope: `e2e/fakes/provider-server.ts` and `e2e/fakes/ai-server.ts`. These are test doubles: they listen on `127.0.0.1` only, start under `FLOWLINE_ENV=test` suites and are never deployed. We fixed the alerts anyway so the scanner stays quiet and the fakes model safe behaviour. Shared helpers live in `e2e/fakes/safety.ts`; the contract tests are `tests/contract/codeql-fakes.test.ts` (written first, commit before the fixes).

| alert | rule | file | decision |
|---|---|---|---|
| #5 | `js/stack-trace-exposure` | provider-server | **Fixed.** The catch-all answers `500 {"error":"internal fake server error"}`; the stack goes to `console.error` (server log) only. |
| #6 | `js/regex-injection` | provider-server | **Fixed.** `POST /__fake/fault` `pathPattern` is no longer compiled with `new RegExp`. `compileFaultPattern` matches text: optional leading `^` (starts with), optional trailing `$` (ends with), both = exact, neither = substring; `\x` reads as `x`, so `^/conversations\.list$` still means that exact path. Empty or over 200 characters → `400`. Every pattern used by the existing suites keeps its meaning (checked against all `pathPattern` call sites). A pattern that relied on other regex syntax (`.*`, groups, alternation) now matches literally. |
| #7 | `js/resource-exhaustion` | ai-server | **Fixed.** Request bodies are capped at 1 MiB (`413 {"error":"request body too large"}`, connection closed) and `requestTimeout`/`headersTimeout` are 30 s, so a client cannot hold memory or a socket open. Fixtures are a few KB, so no suite is near the cap. No rate limit: the cap plus timeout bounds the cost and the server is loopback-only. |
| #9 | `js/server-side-unvalidated-url-redirection` | provider-server | **Fixed** for every redirect that takes its target from a request URL: OAuth `/oauth/authorize`, OIDC `/authorize` (`redirect_uri`) and the Paddle checkout `success_url` query parameter. Targets are allowlisted by `safeRedirectTarget`: a same-site relative path, or an `http(s)` URL on `localhost`, `127.0.0.1` or `[::1]` without credentials. The authorize endpoints answer `400 invalid_request` otherwise; Paddle falls back to its own checkout page. **Dismissal (Stripe `success_url`/`cancel_url`):** the 303 after Stripe's fake checkout goes to the URL the API caller registered when it created the session (authenticated with the secret key, stored server-side, the real Stripe behaviour). The contract suite (`tests/contract/billing.test.ts`) registers `http://x/ok` and `http://x/cancel` and asserts the redirect, so an allowlist would weaken that test. Risk: none beyond a local test double that only a test process can configure. |

## Verification

- `tests/contract/codeql-fakes.test.ts`: helper units, OAuth/OIDC/Paddle redirects, fault control API, generic 500 body (and the stack in the log), 413 for a 2 MiB body.
- The whole `contract` project passes with the fixes (480 tests); `tsc` and `eslint` are clean on the changed files. The full gate runs on CI.
- No e2e-army test: the change is internal to test doubles with no user-facing flow.

CodeQL's own re-scan after merge is the final confirmation for each alert.
