/**
 * Billing domain types — the payment-provider boundary.
 *
 * The app never talks to a payment provider directly; it goes through a
 * `PaymentAdapter`. Everything here is provider-neutral: the Stripe adapter
 * (src/billing/stripe.ts) and the Paddle adapter (src/billing/paddle.ts)
 * translate to/from their provider's REST API and webhook scheme. Billing runs
 * in TEST/SANDBOX MODE only — adapters must refuse live keys.
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
  /** Some providers (Paddle) require an email to create a customer; others (Stripe) accept it optionally. */
  email?: string;
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

/**
 * The provider-neutral thing an event DOES. Adapters map their own event types onto
 * these actions; the service switches on `action`, never on provider-specific types.
 * `type` keeps the provider's own string for audit/dedupe detail.
 */
export type BillingEventAction =
  | "checkout_completed"
  | "subscription_upsert"
  | "subscription_deleted"
  | "payment_failed"
  | "payment_succeeded"
  | "refund"
  | "other";

/** A provider webhook event, normalized. `type` stays the provider's own string. */
export interface BillingWebhookEvent {
  id: string;
  provider: string;
  type: string;
  action: BillingEventAction;
  /** Provider-side creation time; used for ordering (older than last applied = stale). */
  created: Date;
  customerId: string | null;
  subscription?: NormalizedSubscription;
  checkoutSession?: { id: string; subscriptionId: string | null };
  /** A refund/credit the provider recorded (Paddle adjustment, Stripe refund). Audit-only: no subscription state change. */
  refund?: { id: string; transactionId: string | null; subscriptionId: string | null; status: string | null };
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
  /** The environment the adapter talks to — surfaced in the UI ("Test mode" / "Sandbox"). Never "live" in this phase. */
  readonly mode: "test" | "sandbox" | "live";
  /** The HTTP header carrying this provider's webhook signature (lowercase, as fetch normalizes it). */
  readonly webhookSignatureHeader: string;
  /** false when the provider has no usage-metering API (Paddle); reconciliation then records usage locally only. */
  readonly supportsUsageReporting: boolean;
  createCustomer(workspace: WorkspaceRef): Promise<{ id: string }>;
  createCheckoutSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }>;
  changeSubscriptionPrice(subscriptionId: string, priceId: string): Promise<void>;
  cancelSubscription(subscriptionId: string, opts: { atPeriodEnd: boolean }): Promise<void>;
  /** The provider's canonical subscription state, fetched live (used when webhook order is ambiguous). */
  retrieveSubscription(subscriptionId: string): Promise<NormalizedSubscription>;
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
