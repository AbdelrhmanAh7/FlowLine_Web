# Request body limits

## Owned ingress: `deploy/beta/Caddyfile`

Caddy installs streaming byte caps before `reverse_proxy` reads and forwards a body to Next.js. Limits depend on the URL path, not a caller-supplied Content-Type or Content-Length. Missing or falsely small Content-Length does not bypass the stream cap. Multiple matching caps apply together; the smallest wins. Trailing slashes are covered. The default applies to every other path, including custom JSON readers.

| Path | Ingress maximum | Application source |
|---|---:|---|
| `/api/email`, `/api/beta/check` | 16 KiB (16,384 bytes) | `public-body.ts`: `PUBLIC_JSON_MAX_BYTES` |
| `/api/auth` and descendants | 64 KiB (65,536 bytes) | `public-body.ts`: `AUTH_BODY_MAX_BYTES` (all auth POSTs) |
| `/api/hooks/<token>`, `/api/billing/webhook` | 256 KiB (262,144 bytes) | public webhook: `publish.ts` `WEBHOOK_MAX_BYTES`; billing webhook: an inline `256 * 1024` literal in its route |
| `/api/platform` and descendants | 16 KiB | `platform-http.ts` |
| `/api/platform/setup` and descendants; `/api/workspaces/<wid>/oauth-apps/<family>` | 8 KiB (8,192 bytes) | `platform-setup-http.ts`, workspace OAuth-app handler |
| Exactly `/api/workspaces/<wid>/files` or `/api/workspaces/<wid>/knowledge` | 5 MiB + 64 KiB (5,308,416 bytes) | file/knowledge handlers: 5 MiB content plus multipart/JSON overhead |
| All other paths | 1 MiB (1,048,576 bytes) | `http.ts`: `JSON_BODY_MAX_BYTES` |

The upload exception is restricted to those collection paths, including knowledge JSON text submissions. A source/file detail path or a similarly named path gets the default cap. Caps apply regardless of method; handlers retain their own method/authentication rules.

`servers.timeouts.read_body 10s` establishes an absolute upload-read budget, rather than a timer reset by each chunk; `read_header 5s` bounds incomplete headers. These are inbound read deadlines, not deadlines for route execution, external providers, response bodies or SSE. Slow legitimate uploads can fail within their byte budget. No response/write timeout is added.

Port 80 is declared explicitly and only redirects to HTTPS with 308, so both listener configurations receive the global read deadlines. Caddy's implicit HTTP redirect server is created too late to inherit `servers` options ([server-options documentation](https://caddyserver.com/docs/caddyfile/options#server-options)). Route body caps apply to the HTTPS app ingress; HTTP requests are redirected without forwarding to the app.

Ingress explicitly enables HTTP/1.1 and HTTP/2. Caddy 2.10 wires the read timeout into its Go HTTP server, but its HTTP/3 server only receives the idle timeout; HTTP/3 is therefore disabled. The compose file already exposes only TCP 80/443. This follows the [Caddy 2.10 server-options adapter](https://github.com/caddyserver/caddy/blob/v2.10.2/caddyconfig/httpcaddyfile/serveroptions.go) and [HTTP/3 server construction](https://github.com/caddyserver/caddy/blob/v2.10.2/modules/caddyhttp/server.go).

Streaming ingress does not pre-buffer the whole request: a bounded prefix can reach the app before an overflow or deadline error. A handler may start authentication while the upload is in progress. This is not a guarantee of zero upstream work. [Caddy's body limiter](https://github.com/caddyserver/caddy/blob/v2.10.2/modules/caddyhttp/requestbody/requestbody.go) bounds subsequent reads; application helpers remain necessary before parsing or mutation. Transport rejection/disconnection need not have the app's JSON error envelope or status.

## Application layer

`src/server/http.ts` exports `BODY_READ_TIMEOUT_MS = 10_000`. `capBody` rejects an oversized declared length before opening a reader, counts actual streamed bytes, and applies one deadline for the entire read starting when the helper opens the reader. It returns a buffered equivalent request only after a successful read. Overflow retains the caller's 413 code; timeout raises 408 `BODY_READ_TIMEOUT`; `parseBody` preserves both instead of converting them to `BAD_JSON`. The timeout code is translated in Arabic and English.

Timer/reader cleanup runs on success and failure. Cancellation is requested on read failure, overflow or timeout without awaiting an uncooperative stream's cancellation promise. This bounds helper completion; it does not claim to close a hosting provider's underlying client socket. Already-queued chunks are also checked against elapsed monotonic time.

`parseBody` defaults to 1 MiB. Email/beta use 16 KiB; `capAuthBody` uses 64 KiB before cloning or Better Auth parsing. Trusted-IP admission remains separate: only the proxy-overwritten `X-Real-IP` is used, at 60 requests/minute per public-body kind. Calls without a valid trusted IP retain byte/time caps but lack that IP admission. Some authenticated custom readers use `req.json()`/`req.text()` directly and rely on the ingress default; this change does not claim full direct-to-Next.js coverage.

### Route error responses

The helper's `HttpError` carries the status and stable code. A route that catches a body error must return that error's own `status` and `code`, never a fixed status or a generic `VALIDATION`/`BAD_JSON`. Only a 400 (invalid JSON or schema) may still be rewritten into a route-specific message, as the AI connection test route does.

| Status | Code | When |
|---|---|---|
| 408 | `BODY_READ_TIMEOUT` | The body did not finish arriving within `BODY_READ_TIMEOUT_MS`. |
| 413 | `BODY_TOO_LARGE` | Declared or streamed size exceeds the cap in `parseBody`, auth, platform and OAuth-app handlers. |
| 413 | `PAYLOAD_TOO_LARGE` | Same, for the public webhook and the billing webhook. |
| 413 | `FILE_TOO_LARGE`, `SOURCE_TOO_LARGE` | Same, for file and knowledge uploads. |

The envelope depends on the route, for example: `route()` returns `{ error: { code, message, details } }`; the public webhook returns the flat `{ error, code }`; `dispatchAuth` returns `{ code }`. Route-level regressions (billing webhook, public webhook, AI connection test, with no downstream work on refusal) live in `tests/unit/route-body-errors.test.ts`; the public JSON and auth routes are covered in `tests/unit/public-route-body-budget.test.ts`.

## Why no Next.js proxy was added

This checkout has no `src/proxy.ts` or middleware. The installed Next.js 16.3.6 guides were read at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` and `.../05-config/01-next-config-js/proxyClientMaxBodySize.md`. Proxy runs before routes in Node.js, but `proxyClientMaxBodySize` is an experimental cloning/buffering limit: an oversized body is truncated and processing continues, with no rejection. The installed `server/body-streams.js` also waits for the original stream to end during finalization. A Proxy header check or Promise timeout therefore cannot honestly promise an inbound socket deadline. The owned Caddy ingress enforces that boundary without adding another body clone.

## Hosting requirements and verification boundary

- Keep Next.js/web, worker, DB and internal endpoints private; route every external app request through this Caddy configuration. The compose file publishes only Caddy. Actual no-direct-web exposure and trusted-IP overwriting require deployment verification.
- A CDN, tunnel or managed host in front of Caddy owns the client connection until it forwards bytes. Configure and verify equivalent or tighter per-path byte caps and absolute upload/header deadlines there. A provider's larger generic body limit or idle-only timeout is insufficient. No provider configuration or exposure change was performed for this patch.
- A tunnel must target the governed ingress, not bypass it to `web:3000`. The current Caddy `X-Real-IP` uses its direct peer: a tunnel/CDN needs a separately verified trusted-peer/client-IP configuration; it is not automatically compatible with the direct-ingress IP admission policy.
- Unit tests exercise application deadlines/bytes and the actual Caddyfile route regexes, cap values and deadline contract. They do not execute the Caddy adapter, TLS or real sockets. Caddy is unavailable locally, and Docker/build/browser/DB checks were prohibited for this task.
- Before deployment, validate/adapt the file with the deployed Caddy 2.10 image, then test declared-oversize and chunked/absent-length overflow, stalled/slow-drip bodies, exact-limit requests and valid 5 MiB multipart uploads over HTTP/1.1 and HTTP/2. Confirm bounded rejection/connection closure and no successful downstream mutation on a rejected payload; record actual transport status and prove web is unreachable directly. Repeat through any approved tunnel/CDN. See the [private beta runbook](../implementation/PRIVATE_BETA_RUNBOOK.md).

Focused local commands and the current evidence are in [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) and [the PR #16 follow-up report](../../artifacts/phase-4/paid-pilot-round1/proxy-body-limits.md). These limits do not certify deployment or solve aggregate concurrency, worker parser isolation or storage quotas.
