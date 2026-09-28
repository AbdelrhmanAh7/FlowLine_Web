# Billing provider for Flowline's own subscriptions — Paddle vs Lemon Squeezy

Status: decision note for Phase 4. **Decision: Paddle Billing (sandbox first).** Lemon Squeezy is the fallback.
Nothing here implies a live Paddle account: account approval is a separate, manual step and is NOT assumed.

Flowline sells SaaS subscriptions from Egypt and needs a Merchant of Record (MoR) — a
provider that resells the product, handles global sales tax/VAT, and pays out to an
Egypt-based business. Stripe is not an option for the seller side (no Egyptian Stripe
accounts) but stays as a *customer workflow integration* (`src/integrations/providers/stripe.ts`)
and as an alternative billing adapter.

## Comparison (what matters for an Egypt-based SaaS)

| Criterion | Paddle Billing | Lemon Squeezy |
| --- | --- | --- |
| Merchant of Record | Yes — Paddle resells, handles tax/VAT, compliance, chargebacks ([intro](https://www.paddle.com/help/start/intro-to-paddle/which-payment-methods-do-you-support)) | Yes — same MoR model ([docs](https://docs.lemonsqueezy.com/help)) |
| Egypt seller eligibility | **Verified**: `EG Egypt` appears in Paddle's supported country list ([API reference country enum](https://developer.paddle.com/api-reference/subscriptions/update-subscription); also [supported countries](https://developer.paddle.com/concepts/sell/supported-countries-locales)). Account approval still required — not guaranteed. | **Verified**: Egypt is in the bank-payout country list ([LS supported countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries)) |
| Payouts to Egypt | Bank transfer (wire) and Payoneer; monthly payout cycle ([Paddle payouts help](https://www.paddle.com/help/manage/get-paid/is-there-a-fee-taken-for-payouts), [when and how](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid)) | Bank payout (Egypt listed) or PayPal ([LS supported countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries)) |
| SaaS/subscription support | First-class: subscriptions, trials, proration, pause/resume, dunning (`subscription.past_due`) | Subscriptions supported; pausing and proration semantics are thinner (mark: partially verified — from LS docs, not exercised) |
| Sandbox / test mode | Full sandbox environment with its own API base (`sandbox-api.paddle.com`) and sandbox API keys (`pdl_sdbx_…`) ([authentication](https://developer.paddle.com/api-reference/about/authentication)) | "Test mode" store mode rather than a separate environment (unverified details) |
| API | REST, JSON, `{data, meta}` envelopes, Bearer API key, granular key permissions ([authentication](https://developer.paddle.com/api-reference/about/authentication)) | REST, JSON:API-shaped, Bearer key |
| Webhooks | `Paddle-Signature: ts=…;h1=…`, HMAC-SHA256 over `ts:rawBody`, event envelope `{event_id, event_type, occurred_at, data}`; out-of-order delivery expected — order by `occurred_at` ([signature verification](https://developer.paddle.com/webhooks/signature-verification), [delivery](https://developer.paddle.com/webhooks/respond-to-webhooks)) | `X-Signature` HMAC-SHA256 over raw body (no timestamp — weaker replay protection; verified from LS docs, not exercised) |
| Usage-based/metered billing | **None** — no meter API equivalent to Stripe meters (verified by absence in the API reference; third parties confirm: [phare.io](https://phare.io/blog/what-paddle-doesnt-tell-you-about-implementing-metered-billing/)) | None either |
| Corporate context | Independent MoR, long-standing | Acquired by Stripe (2024); future direction tied to Stripe (context, not a product fact) |

## Why Paddle

1. Egypt is a verified supported seller country with wire/Payoneer payouts.
2. A real sandbox with sandbox-scoped keys lets us certify the full lifecycle before
   requesting a live account.
3. The subscription model (statuses, `scheduled_change`, proration modes, pause/resume)
   maps cleanly onto Flowline's existing provider-neutral billing model.

Fallback: if Paddle account approval fails, Lemon Squeezy is also Egypt-eligible and MoR;
its adapter would implement the same `PaymentAdapter` interface.

## Paddle facts used by the adapter — verified vs assumed

Verified (developer.paddle.com and the official `paddle-node-sdk`, checked 2026-09-28):

- Auth: `Authorization: Bearer <api key>`; key formats `pdl_sdbx_apikey_…` / `pdl_live_apikey_…` ([authentication](https://developer.paddle.com/api-reference/about/authentication)).
- Customers: `POST /customers` requires `email`; `custom_data` supported.
- Transactions: `POST /transactions` with `items: [{price_id, quantity}]`, `customer_id`, `checkout: {url}`. **There is no Paddle-hosted checkout page.** A transaction's `checkout.url` is a page on *our* approved domain — the URL passed as `checkout.url` (must be an approved website) or else the account's default payment link — with `?_ptxn=<transaction id>` appended ([pass a transaction to checkout](https://developer.paddle.com/build/transactions/pass-transaction-checkout), [default payment link](https://developer.paddle.com/build/transactions/default-payment-link)). That page must load Paddle.js (`https://cdn.paddle.com/paddle/v2/paddle.js`), call `Paddle.Environment.set("sandbox")` before `Paddle.Initialize({ token })` in sandbox ([Environment.set](https://developer.paddle.com/paddlejs/methods/paddle-environment-set)), and open the checkout. Paddle.js opens a checkout for `_ptxn` automatically, but an explicit `Paddle.Checkout.open({ transactionId, settings })` "takes priority" ([Checkout.open](https://developer.paddle.com/paddlejs/methods/paddle-checkout-open)); Flowline opens it explicitly so it can pass `settings.successUrl` and `locale`. The token for Paddle.js is a client-side token (`test_…` / `live_…`), which Paddle documents as safe for frontend code; API keys must never reach Paddle.js.
- Flowline's checkout page: `/billing/checkout?ws=<slug>&_ptxn=txn_…` (`src/app/billing/checkout`, logic in `src/billing/checkout-page.ts`). The adapter sends `checkout.url = <FLOWLINE_PUBLIC_URL>/billing/checkout?ws=<slug>`. The page requires a signed-in member of the workspace (non-members get 404) with billing rights, validates `_ptxn` (`/^txn_[a-z0-9]+$/i`), builds the success URL (`/w/<slug>/settings?billing=success`) server-side — never from the query — and shows honest states: not configured (no client token), invalid transaction, Paddle.js failed to load (retry), closed (reopen), and a "Sandbox — no real payment" note. A `live_` client token is refused unless `FLOWLINE_BILLING_ALLOW_LIVE=true` and `FLOWLINE_BILLING_PADDLE_ENV=live`. In tests only (`FLOWLINE_ENV=test`), `FLOWLINE_TEST_PADDLE_JS_URL` can point at the fake provider's stand-in Paddle.js (`/paddle/checkout/paddle.js`); otherwise the CDN is always used.
- Subscriptions: entity has `status` (`active|canceled|past_due|paused|trialing`), `items[].price.id`, `current_billing_period` (null when paused/canceled), `scheduled_change.action` (`cancel|pause|resume`), `items[].trial_dates`. Update via `PATCH /subscriptions/{id}` with `proration_billing_mode` ∈ `prorated_immediately|prorated_next_billing_period|full_immediately|full_next_billing_period|do_not_bill` (adapter uses `prorated_immediately`). Cancel via `POST /subscriptions/{id}/cancel` with `effective_from` ∈ `next_billing_period|immediately`. Pause/resume endpoints exist (`/pause`, `/resume`).
- Adjustments: `POST /adjustments` (`action: "refund"`) — entity carries `transaction_id`, `customer_id`, `subscription_id`; sandbox auto-approves refunds (live holds most for review).
- Webhooks: envelope `{event_id, event_type, occurred_at, data}`; `Paddle-Signature: ts=…;h1=…` = HMAC-SHA256(secret, `ts:rawBody`); multiple `h1` possible during secret rotation; delivery can be out of order — order by `occurred_at`. Paddle's SDK default replay tolerance is 5s; Flowline deliberately uses 300s (matches the Stripe adapter; replays inside the window are deduped by event id).
- Events: `transaction.completed` (checkout/renewal; `origin` distinguishes `web` from `subscription_recurring`), `subscription.created|updated|activated|trialing|past_due|paused|resumed|canceled`, `adjustment.created|updated` ([webhooks overview](https://developer.paddle.com/webhooks/overview)).
- No metered-usage API → `reconcileUsage` is a documented no-op with Paddle (skipped with reason; nothing is sent or marked reported).

Assumed / not verified against a real sandbox account (no Paddle account exists yet):

- Exact error `code` values (the adapter surfaces `detail`/`code` text only).
- That a first subscription transaction always has `subscription_id` set on `transaction.completed` (documented behavior; a null case would fail the event honestly and retry).
- Live-key behavior of `FLOWLINE_BILLING_ALLOW_LIVE=true` (nobody sets it in this phase).
- The real Paddle.js overlay on our page has not been exercised against a sandbox account: the flow is verified against the docs and the fake's stand-in only. Whether Paddle.js requires `pwCustomer` (only used by Paddle Retain, live-only) and exactly which `checkout.*` events fire on close/complete are taken from the docs, not observed.

## Operating notes

- Env: `FLOWLINE_BILLING_PROVIDER=paddle`, `FLOWLINE_BILLING_PADDLE_KEY` (sandbox `pdl_sdbx_…`),
  `FLOWLINE_BILLING_PADDLE_WEBHOOK_SECRET` (`pdl_ntfset_…` from the notification destination),
  `FLOWLINE_BILLING_PADDLE_ENV=sandbox`, `FLOWLINE_BILLING_PADDLE_CLIENT_TOKEN` (public client-side
  token, sandbox `test_…`). Plans stay in `FLOWLINE_BILLING_PLANS` with `pri_…` price ids.
- Owner setup in the Paddle **sandbox** dashboard (sandbox-vendors.paddle.com) before checkout works:
  1. **API key** (Developer tools > Authentication): `pdl_sdbx_apikey_…` with permissions for customers,
     transactions, subscriptions (read/write) and adjustments → `FLOWLINE_BILLING_PADDLE_KEY`.
  2. **Client-side token** (Developer tools > Authentication > Client-side tokens): `test_…` →
     `FLOWLINE_BILLING_PADDLE_CLIENT_TOKEN`.
  3. **Website approval / default payment link** (Checkout > Checkout settings, and Website approval):
     add the beta domain (the `FLOWLINE_PUBLIC_URL` origin) as an approved website and set the default
     payment link to `<FLOWLINE_PUBLIC_URL>/billing/checkout`. Paddle documents that sandbox accepts
     `https://localhost/` without approval; the beta domain must be accepted for `checkout.url` to be
     honoured — otherwise Paddle rejects the transaction or uses the default payment link.
  4. **Notification destination** (Developer tools > Notifications): URL
     `<FLOWLINE_PUBLIC_URL>/api/billing/webhook`, events `transaction.completed`,
     `transaction.payment_failed`, `subscription.*`, `adjustment.*`; its secret key (`pdl_ntfset_…`) →
     `FLOWLINE_BILLING_PADDLE_WEBHOOK_SECRET`.
  5. **Products and prices** (Catalog): one recurring price per paid plan (trial on the price if the plan
     has one); put the `pri_…` ids in `FLOWLINE_BILLING_PLANS`.
- Trials are configured on the **price** in Paddle's catalog (`trial_period`); plan `trialDays`
  is plan metadata/display only and must match the catalog.
- Paddle has no cancel-redirect parameter on transactions; closing the Paddle.js overlay leaves the buyer on our checkout page, which offers "Reopen checkout" and a link back to Plan & billing.
- Refunds are created by ops at Paddle (dashboard/API); Flowline records `adjustment.*` events for audit only.
