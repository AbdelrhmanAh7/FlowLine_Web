/**
 * Billing domain types — the payment-provider boundary.
 *
 * The app never talks to a payment provider directly; it goes through a
 * `PaymentAdapter`. Everything here is provider-neutral: the Stripe adapter
 * (src/billing/stripe.ts) translates to/from Stripe's REST API and webhook
 * scheme. Billing runs in TEST MODE only — adapters must refuse live keys.
 */

/** What a plan entitles a workspace to. null = unlimited. */
export interface PlanEntitlements {
  maxMonthlyExecutions: number | null;
  monthlyUsageCapMicros: number | null;
  maxConcurrentRuns: number;
}

/** A plan is configuration only (FLOWLINE_BILLING_PLANS); prices are never hard-coded. */
export interface BillingPlan {
  id: string;
  name: string;
  providerPriceId: string;
  displayPrice?: { amountMinor: number; currency: string; interval: string };
  trialDays?: number;
  entitlements: PlanEntitlements;
}

export interface WorkspaceRef {
  id: string;
  name: string;
  slug: string;
}

/** Normalized subscription snapshot carried by webhook events. */
export interface NormalizedSubscription {
  id: string;
  status: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: Date | null;
}

/** A provider webhook event, normalized. `type` stays the provider's own string. */
export interface BillingWebhookEvent {
  id: string;
  provider: string;
  type: string;
  /** Provider-side creation time; used for ordering (older than last applied = stale). */
  created: Date;
  customerId: string | null;
  subscription?: NormalizedSubscription;
  checkoutSession?: { id: string; subscriptionId: string | null };
}

export interface CheckoutSessionInput {
  customerId: string;
  priceId: string;
  trialDays?: number;
  successUrl: string;
  cancelUrl: string;
}

export interface UsageReportInput {
  customerId: string;
  eventName: string;
  value: number;
  /** Idempotency key: re-reporting the same identifier must not double-count. */
  identifier: string;
}

export interface PaymentAdapter {
  readonly provider: string;
  createCustomer(workspace: WorkspaceRef): Promise<{ id: string }>;
  createCheckoutSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }>;
  changeSubscriptionPrice(subscriptionId: string, priceId: string): Promise<void>;
  cancelSubscription(subscriptionId: string, opts: { atPeriodEnd: boolean }): Promise<void>;
  reportUsage(input: UsageReportInput): Promise<void>;
  /** Verifies the webhook signature (and replay window) and parses the event, or throws WebhookVerificationError. */
  verifyWebhook(rawBody: string, signatureHeader: string | null, now: Date): BillingWebhookEvent;
}

/** Provider-side failure. `unavailable` (5xx/timeout/network) maps to a 502; `client` to a 400. */
export class BillingProviderError extends Error {
  constructor(
    public kind: "unavailable" | "client",
    message: string,
  ) {
    super(message);
  }
  get status() {
    return this.kind === "unavailable" ? 502 : 400;
  }
}

/** Webhook signature missing, wrong, or outside the replay tolerance. Routes answer 401. */
export class WebhookVerificationError extends Error {}
