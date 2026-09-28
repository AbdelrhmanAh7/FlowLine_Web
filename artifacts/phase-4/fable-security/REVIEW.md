# Phase 4 security review — email flows, beta gate, Paddle, telemetry/ops, OAuth/SSO

- Reviewed SHA: `64ef10c` (branch `phase-4`)
- Reviewer: Fable 5.1 (independent, read-only)
- Date: 2026-09-28
- Method: end-to-end reading of the code paths listed in the brief, including the installed `better-auth@1.7.6`
  internals they depend on (sign-up, rate limiter IP resolution, OAuth account linking). No servers started, no
  tests run, no source edited. Only findings that could be traced through the real code are kept.

Severity scale: P0 critical / P1 high / P2 medium / P3 low.

## Summary

| # | Sev | Area | Finding |
|---|-----|------|---------|
| 1 | P2 | Email rate limit | Per-IP email limit keys on client-controlled `X-Real-IP` (Caddy never sets or strips it) — the only global cap on outbound email is bypassable |
| 2 | P2 | Billing webhook | Unauthenticated `/api/billing/webhook` buffers the whole body before checking size; chunked requests bypass the 256 KB cap (memory DoS) |
| 3 | P2 | Beta gate (honesty) | Uninvited email sign-up is swallowed into a fake "check your email" success by better-auth's generic-duplicate path; UI has no beta-code field, so `BETA_REFUSAL` is unreachable |
| 4 | P3 | Email flows | `requestToken` puts the provider HTTP call inside the 500 ms timing floor — existing vs unknown email distinguishable by latency |
| 5 | P3 | Email flows | Per-email limit (3/h) lets anyone lock a victim out of password reset / verification for an hour |
| 6 | P3 | Account deletion | Deleting a sole-member workspace drops `billing_account` by cascade without cancelling the provider subscription |
| 7 | P3 | Password reset | Consuming one reset token leaves other unexpired reset tokens for the same user valid |

Nothing at P0/P1. The token design (32 random bytes, SHA-256 at rest, single use under `FOR UPDATE`, purpose-scoped,
30 min / 24 h expiry), the delete flow (session + token user binding, sole-owner transfer rule), `safePath`, the Paddle
signature/replay/idempotency logic, customer→workspace binding, the live-key guard, the ops token comparison, telemetry
prop allowlisting and retention predicates all checked out. Details of what was verified are at the end.

---

## Findings

### 1. P2 — Per-IP email rate limit trusts a spoofable `X-Real-IP`

**Where:** `src/server/email/flows.ts:17-19` (`clientIp`), used by `checkEmailRate` at `:22-34`; proxy config
`deploy/beta/Caddyfile:20-22`.

```ts
function clientIp(request?: Request) {
  return request?.headers.get("x-real-ip") ?? request?.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
}
```

`X-Real-IP` is read first. The beta Caddyfile only does `header_up X-Request-Id`; Caddy's reverse proxy manages
`X-Forwarded-For/Proto/Host` but never sets or removes `X-Real-IP`, so whatever the client sends reaches the app
verbatim. The `ip` dimension (15/h) is therefore attacker-chosen; only the `email` dimension (3/h per address)
remains.

**Exploit:** unauthenticated `POST /api/email {action:"forgot"|"resend", email:<any>}` with a fresh random
`X-Real-IP` per request sends up to 3 emails per hour to *every* address the attacker lists, with no global cap.
The same helper caps `deleteRequest` and workspace invites (`members.ts:24`). Impact today is bounded by
`FLOWLINE_EMAIL_ALLOWED_RECIPIENTS` (recipients outside it fail in `sendEmail`), but each refused send still
inserts + deletes an `email_token` row and hits the DB limiter twice, and once the allowlist is lifted this is an
open relay for reset/verification spam and Resend quota burn. The per-email 3/h also cannot be raised safely while
the IP cap is fake.

**Fix:** stop reading `x-real-ip`; use the last hop of `x-forwarded-for` only (Caddy sets it to the direct client
for untrusted peers), or better, have Caddy set it explicitly (`header_up X-Real-IP {remote_host}`) and read only
that. Consider also a global per-hour send budget in `email_rate_limit` (key `"global"`) as a backstop.

### 2. P2 — Billing webhook reads an unbounded body before enforcing the size cap

**Where:** `src/app/api/billing/webhook/route.ts:14-16`.

```ts
if (Number(req.headers.get("content-length") ?? 0) > 256 * 1024) throw new HttpError(413, ...);
const rawBody = await req.text();          // full buffer first
if (rawBody.length > 256 * 1024) throw ...  // then check
```

The endpoint is public (no session; authenticity only via signature, which is checked *after* the body is read).
A request without `Content-Length` (chunked transfer encoding, which Caddy forwards) skips the header check and
`req.text()` buffers the entire stream in memory before the length check runs. The inbound webhook receiver got
this right (`src/app/api/hooks/[token]/route.ts:32` uses `capBody`, which aborts while streaming); this route did
not.

**Exploit:** a handful of concurrent chunked POSTs of a few hundred MB each to `/api/billing/webhook` exhaust the
single beta web container's memory without any credential.

**Fix:** `const rawBody = await (await capBody(req, 256 * 1024, new HttpError(413, ...))).text();` — same helper,
same limit. (The `/api/email` and other JSON routes go through `parseBody` → `req.json()` with no cap either; the
webhook is the unauthenticated one that matters, but a default cap in `parseBody` would close the class.)

### 3. P2 — Beta refusal is masked as success; no way to enter a beta code in the UI

**Where:** `src/lib/auth.ts:60-63` (hook throws `APIError("FORBIDDEN", …BETA_INVITE_REQUIRED)`),
`node_modules/better-auth/dist/api/routes/sign-up.mjs:155` and `:224`
(`if (e.statusCode === 403 && shouldReturnGenericDuplicateResponse) return buildGenericDuplicateResponse()`),
`src/app/(auth)/auth-form.tsx:39-47` (no `betaCode` sent; success → `/verify-email?pending=1`).

Because `requireEmailVerification: true` sets `shouldReturnGenericDuplicateResponse`, better-auth converts *any*
403 from the create hook into the synthetic "user created, verify your email" response. An uninvited person on the
public sign-up page therefore sees "we sent you a verification email" (no email is sent, no account exists) and
`BETA_REFUSAL` ("…or enter a beta access code") is never shown. Separately, the sign-up form sends only
`{email, password, name}`; beta codes minted by `scripts/beta/create-code.mts` can only be redeemed by crafting the
API call. The integration test acknowledges the generic response and only asserts on DB state, so this is not
caught.

This is not an access bypass (the gate holds; verified by reading `createWithHooks` — the hook runs before the
insert and its throw aborts creation), but it violates the project's "no fake success" rule and makes the invite
mechanism confusing for real beta users.

**Fix:** in `auth-form.tsx`, add an optional "beta access code" field passed as `betaCode` when `FLOWLINE_BETA_MODE`
is `invite_only` (expose the mode via `/api/auth-config`), and either (a) check `allowSignUp` up front from a small
pre-flight route so the refusal can be displayed, or (b) return a distinguishable status from the hook (e.g. throw a
non-403 `APIError`, such as `UNPROCESSABLE_ENTITY`, which better-auth rethrows as-is) so the client can show
`BETA_REFUSAL`.

### 4. P3 — Timing side channel in `requestToken` (forgot / resend)

**Where:** `src/server/email/flows.ts:62-82`.

The 500 ms floor is measured from `started`, but for an existing (eligible) user the branch also performs the token
insert *and* the synchronous provider HTTP call (`sendTemplate` → `safeFetch` to Resend/Postmark, timeout 8 s). Any
provider latency above ~400 ms pushes the response past the floor, whereas an unknown email returns at exactly
500 ms. Repeated measurements distinguish registered emails despite the `sent_if_eligible` body.

**Fix:** move delivery off the request path (`void sendTemplate(...).catch(cleanup)` after the row is committed, or
an outbox drained by the worker), and pad from a fixed budget that only covers DB work.

### 5. P3 — Anyone can lock a victim out of reset / verification

**Where:** `src/server/email/flows.ts:23` (`["email", email.toLowerCase(), 3]`), applied before the user lookup.

The per-email counter increments on every request regardless of whether the address exists or the caller is the
owner. Three unauthenticated `forgot` calls for `victim@x` return 429 for the victim's own reset/resend attempts for
the next hour, and the same for `deleteRequest` (a signed-in user's own address can be pre-exhausted by a stranger).

**Fix:** keep the 3/h as a *send* limit but decouple it from the caller: e.g. count sends (not requests) and keep
the 60 s resend throttle as the anti-spam control, or raise the per-email cap and rely on a trustworthy IP cap
(finding 1).

### 6. P3 — Account deletion orphans provider subscriptions

**Where:** `src/server/email/flows.ts:123` (`tx.delete(schema.workspace)` for sole-member workspaces),
`src/db/schema.ts:857-862` (`billing_account.workspace_id … onDelete: "cascade"`).

The local `billing_account` (with `customer_id`/`subscription_id`) is removed by cascade, but nothing calls
`adapter.cancelSubscription` first. The provider keeps billing; subsequent webhooks for that customer land as
`ignored_unknown_customer` so nobody is alerted. Sandbox-only today (no live keys), so financial impact is nil until
live billing is approved — but this needs to be in place before that approval.

**Fix:** before deleting a sole workspace, if it has a `billing_account` with an active/trialing subscription,
cancel at the provider (`cancel(..., { atPeriodEnd: false })`) or return a new `billing_active` state that makes the
user cancel first, mirroring `transfer_required`.

### 7. P3 — Reset does not invalidate sibling reset tokens

**Where:** `src/server/email/flows.ts:128-139`.

A successful reset consumes only the presented token; other unconsumed `reset` tokens for the same user (up to 30 min
old — several can exist because the 60 s throttle only applies to `requestToken`, not to better-auth's
`sendResetPassword` path or repeated calls a minute apart) stay valid. If an older reset email is later read by
someone else with mailbox access, it still works after the legitimate user has already reset. Sessions *are*
revoked, which limits the blast radius.

**Fix:** in the `reset` branch, `update email_token set consumed_at = now() where user_id = $1 and purpose = 'reset'
and consumed_at is null` (same for `verify` on verification).

---

## Verified and not reportable (for the record)

- **Token entropy/hashing/single use/expiry:** `randomToken(32)` (base64url of 32 random bytes), stored as
  SHA-256; `tokenState` shape check `^[A-Za-z0-9_-]{40,100}$`; consumption under `SELECT … FOR UPDATE` inside a
  transaction re-checking `consumedAt`/`expiresAt`/purpose; failed delivery deletes the row. Better-auth's own
  `/verify-email`, `/send-verification-email`, `/request-password-reset`, `/reset-password`, `/delete-user*` are
  404'd in `src/app/api/auth/[...all]/route.ts`, so no second token scheme is reachable.
- **Open redirect:** `safePath` rejects non-`/`, `//`, backslashes and control characters; client mirrors the check;
  `next` on `/app` is only interpreted as `invite:<token>` or `canvas`; SSO/OAuth callbacks redirect to fixed
  `FLOWLINE_PUBLIC_URL` paths; social `callbackURL` is validated by better-auth's `originCheck` against `baseURL`.
- **Account deletion:** requires a session, token bound to `currentUserId`, 30 min expiry; sole-owner workspaces with
  other members → `transfer_required`; sole-member workspaces deleted with audit rows written to shared ones.
- **Recipient allowlist:** enforced in `sendEmail` for every path (flows, notices, invites); outbox adapter refused in
  production.
- **Logs/telemetry:** tokens appear only in the email body; better-auth logger is routed through `redactString`;
  `cleanProps` allowlists 14 scalar keys, and every `track` call site passes enums/ids only (`goal` is a zod enum).
- **Beta gate:** `createWithHooks` runs the before hook for email, Google/GitHub and better-auth's OAuth user
  creation; SSO calls `allowSignUp` before insert; code use is an atomic conditional `UPDATE … RETURNING`
  (race-safe, covered by the integration test); hash is case-normalised; admin list lowercased; invite check ignores
  revoked/accepted/expired. Code space is ~41 bits behind better-auth's 10/min per-IP sign-up limit, whose IP comes
  from a single-valued `X-Forwarded-For` (Caddy overwrites it for untrusted peers). Better-auth 1.7.6 defaults
  `requireLocalEmailVerified: true`, so an unverified pre-registered account cannot be silently linked by a later
  Google/GitHub sign-in (pre-hijack chain does not apply).
- **Paddle:** `ts;h1` HMAC over `${ts}:${rawBody}` with `timingSafeEqual` and length check, ±300 s window, multiple
  `h1` accepted for rotation; events deduped by `event_id` primary key with failed-event reprocessing; account looked
  up by unique `customer_id` under row lock, so a signed event can only touch its own workspace; stale/out-of-order
  guard; live keys refused unless both `FLOWLINE_BILLING_ALLOW_LIVE=true` and `..._ENV=live`; success URL is built
  from `FLOWLINE_PUBLIC_URL` + slug (`[a-z0-9-]{1,32}`), never from request input.
- **Ops/Caddy:** `/api/ops/*`, `/api/test/*`, `/api/debug/*` answered 404 at the proxy; the ops route additionally
  requires a ≥24-char bearer compared with `timingSafeEqual` and returns 404 otherwise; response is aggregates only.
- **Rate limit / retention:** `checkRate` keys are user/API-key/copilot ids (hashed), never headers; retention
  deletes only finished runs by status + age, expired auth artefacts, and old telemetry/audit — no billing or
  ledger rows.
- **OAuth connection callback:** state single-use under `FOR UPDATE`, bound to the initiating user id, 10 min
  expiry, PKCE verifier encrypted at rest; `redirectAfter` restricted to `/w/` prefix and not used by the callback.
- **SSO:** state bound to an httpOnly cookie, consumed once; subject-based linking only; email-only match refused
  (409) unless the signed-in initiator is that user.
