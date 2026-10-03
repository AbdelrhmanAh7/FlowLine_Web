# PR #16 proxy/body deadline follow-up

- Date: 2026-10-03. Base HEAD: `a9f7597c90b98128a1cebf46a949810e0586c31d`.
- Worktree branch: `claude/pr16-proxy-caps`, based on PR #16's resource-bound commit; no branch switch, commit, push, PR/comment, merge or GitHub-setting change performed.
- Evidence is for the uncommitted local diff, identified by the file hashes below. It is not merged-SHA, CI, Caddy-runtime or deployment evidence.
- `AGENTS.md`, the installed Next.js 16.3.6 Proxy/buffer guides and body-stream implementation, deploy/beta configs, application cap callers and the original deferral were inspected. `git log origin/main..HEAD --format=%B` had no proxy deferral text; the deferral was in `security-resource.md`.

## Changes and decisions

- `deploy/beta/Caddyfile`: replace the blanket 6 MiB allowance with 1 MiB default, public 16 KiB, auth 64 KiB, webhooks 256 KiB, platform 16 KiB and setup/workspace OAuth credentials 8 KiB. Only exact file/knowledge collection paths get the existing 5 MiB + 64 KiB budget, including knowledge JSON submissions. Add 10-second absolute body-read and 5-second header deadlines; explicitly configure port 80's 308 redirect so its listener inherits the deadlines.
- Enable only HTTP/1.1 and HTTP/2: Caddy 2.10's HTTP/3 server does not receive these read deadlines. Preserve existing isolation, trusted-IP overwrite, internal-route blocks, redaction and response headers. No response timeout that would cut off SSE.
- `src/server/http.ts`: this base did not contain the referenced `BODY_READ_TIMEOUT_MS`; add it as 10,000 ms and enforce one total read deadline in `capBody`, retaining byte caps and caller-specific 413 codes. Cancel without waiting for potentially unending cleanup, and release reader/timer resources. Timeout is 408 `BODY_READ_TIMEOUT`, preserved through `parseBody`.
- `src/i18n/errors.ts`, `messages/ar.json`, `messages/en.json`: register and translate the new API timeout code. Auth retains its existing flat error-code response; public routes retain their nested error envelope.
- Tests: extend `http-capbody`, `public-route-body-budget`, and `knowledge-errors-i18n`; add `proxy-body-limits` to exercise real config regexes/values, route exceptions and constant alignment. Existing assertions remain intact.
- Docs: new `docs/security/REQUEST_BODY_LIMITS.md`; update `CREDENTIALS_DESIGN.md`, README, developer guide, private beta runbook, Phase 4 report and the original security-resource deferral.
- No Next.js Proxy file added: its installed experimental buffer limit truncates rather than rejects, and body finalization waits for the original stream. Caddy is the earliest owned socket boundary. Streaming Caddy can forward a bounded prefix; this is not a claim that the app receives zero bytes before ingress refusal.

## Exact validation commands and results

```powershell
pnpm.cmd exec vitest run --project unit --configLoader runner tests/unit/http-capbody.test.ts tests/unit/proxy-body-limits.test.ts tests/unit/public-body-budget.test.ts tests/unit/public-route-body-budget.test.ts tests/unit/knowledge-errors-i18n.test.ts tests/unit/platform-units.test.ts --maxWorkers 1 --no-file-parallelism
```

Final run at 17:22:39: exit 0, **6 files / 92 tests passed**, no skips, 2.78 seconds. An earlier run passed 83 tests before adding route deadline cases. The next run had 85 passed / 7 failed because the new tests expected nested errors on auth routes, whose existing dispatcher returns a flat `{ code }` envelope. Corrected the new assertions to check each existing envelope exactly; no product behavior, prior assertions or timeouts changed to hide those failures.

```powershell
pnpm.cmd exec eslint --no-cache src/server/http.ts src/i18n/errors.ts tests/unit/http-capbody.test.ts tests/unit/proxy-body-limits.test.ts tests/unit/public-route-body-budget.test.ts tests/unit/knowledge-errors-i18n.test.ts
pnpm.cmd typecheck
```

Both exited 0. Typecheck ran **once**, after the final TypeScript/JSON edits. Subsequently only the explicit port-80 Caddy site and documentation were added; the config-related suites were rerun:

```powershell
pnpm.cmd exec vitest run --project unit --configLoader runner tests/unit/proxy-body-limits.test.ts tests/unit/platform-units.test.ts --maxWorkers 1 --no-file-parallelism
git diff --check
```

Exit 0, **2 files / 37 tests passed**, no skips, 987 ms; whitespace check exit 0. Workers were limited to one and files ran serially. No Docker, DB, browser/Playwright, installs, build or full/local gate was run.

## Unverified / orchestrator follow-up

The [layered policy](../../../docs/security/REQUEST_BODY_LIMITS.md) records the precise boundary. Unit config tests do not execute Caddy's adapter or sockets. A Caddy executable was not on PATH, and Docker use was prohibited. Validate/adapt with the deployment image, test byte boundaries/chunked/stalled/slow-drip requests and legitimate multipart uploads over both enabled protocols, verify port-80 redirect/header deadlines, and prove trusted-IP overwrite plus no direct web exposure. A provider/CDN/tunnel needs its own verified client-connection deadlines/caps and must route through this ingress. Some custom app readers still depend on ingress; no full direct-Next.js protection, live provider proof, deployment acceptance, aggregate quotas or worker isolation is claimed. M4's owned-ingress source deferral is addressed; deployment verification remains partial.

## Final source/config/test fingerprints (SHA-256, local bytes)

```text
13af2d49008c8a40e9f7a78bbc04045af2bc60756c68ab629b5838d35ae916f2  deploy/beta/Caddyfile
959f0ee2be562c6832919e6f867eb5bc2366259c0b6d7ca0dd3174a35254696f  src/server/http.ts
4271301a28a24a562021c95f9c434f2bced4424c44d75eb2e6fb0bc1b5749f4a  src/i18n/errors.ts
6c1a87d30fa73fad6b3bf1a416852c4e60898b1bb0d49b39fc2fc48208fb1d60  src/i18n/messages/ar.json
0acda8153e8068837f9e34a738d906bc1877ca759fc7a19dca8fc46c97dd2aa3  src/i18n/messages/en.json
f03ad5bc852acc2b984597f109c9ec4211060f2f47636a6671b420ed0449150e  tests/unit/http-capbody.test.ts
bbe4e0d62aaa9a5567014269bdb27b8f23abf6aee624a6f1f1f3ed3d194778cc  tests/unit/proxy-body-limits.test.ts
3352b6ec2f56f2ae488dcb9c24ad3569e0a584abe02178b985008144a367cad6  tests/unit/public-route-body-budget.test.ts
4d2592ab83ec31f0b0967998d58f9028c16c993cedd84dfbd0fb256602a333b1  tests/unit/knowledge-errors-i18n.test.ts
```
