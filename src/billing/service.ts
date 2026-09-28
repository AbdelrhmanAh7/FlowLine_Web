/**
 * Billing service — the only place billing state changes.
 *
 * Local truth lives in billing_account / billing_event / usage_report. Provider
 * calls happen BEFORE any local write, so a provider failure (502/timeout) never
 * leaves half-applied local state. Webhook application is one transaction:
 * dedupe by provider event id, ignore unknown customers and out-of-order events,
 * then apply + audit.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema, type Db } from "@/db";
import type { CurrentUser } from "@/server/access";
import { audit, userActor, type Actor } from "@/server/audit";
import { HttpError } from "@/server/http";
import { monthStart } from "@/server/usage";
import { checkoutPageUrl, settingsUrls } from "./urls";
import { PaddlePaymentAdapter } from "./paddle";
import { loadBillingPlans, planById, planByProviderPrice, type BillingPlansConfig } from "./plans";
import { StripePaymentAdapter } from "./stripe";
import { BillingProviderError, type BillingEventAction, type NormalizedSubscription, type PaymentAdapter, type PlanEntitlements } from "./types";

/** Meter event names reported to the provider during reconciliation. */
const METER_EVENTS = { executions: "flowline.executions", cost_micros: "flowline.cost_micros" } as const;
type Metric = keyof typeof METER_EVENTS;

let cachedAdapter: PaymentAdapter | null | undefined;

/**
 * The configured payment adapter, or null when no key is set. Never a live-mode adapter.
 * The provider is installation-level configuration: FLOWLINE_BILLING_PROVIDER
 * ("stripe", the default, or "paddle"), with the matching key/secret env vars.
 */
export function getAdapter(): PaymentAdapter | null {
  if (cachedAdapter !== undefined) return cachedAdapter;
  const provider = (process.env.FLOWLINE_BILLING_PROVIDER ?? "stripe").toLowerCase();
  if (provider === "stripe") {
    const key = process.env.FLOWLINE_BILLING_STRIPE_KEY;
    cachedAdapter = key ? new StripePaymentAdapter(key, process.env.FLOWLINE_BILLING_WEBHOOK_SECRET) : null;
  } else if (provider === "paddle") {
    const key = process.env.FLOWLINE_BILLING_PADDLE_KEY;
    const env = process.env.FLOWLINE_BILLING_PADDLE_ENV === "live" ? "live" : "sandbox";
    cachedAdapter = key
      ? new PaddlePaymentAdapter(key, process.env.FLOWLINE_BILLING_PADDLE_WEBHOOK_SECRET, { env, allowLive: process.env.FLOWLINE_BILLING_ALLOW_LIVE === "true" })
      : null;
  } else {
    throw new Error(`Unknown FLOWLINE_BILLING_PROVIDER "${provider}" (expected "stripe" or "paddle")`);
  }
  return cachedAdapter;
}

/** The webhook signature header of the configured provider (for the webhook route). */
export function webhookSignatureHeader(): string {
  return getAdapter()?.webhookSignatureHeader ?? "stripe-signature";
}

export function isBillingConfigured(): boolean {
  return getAdapter() !== null && loadBillingPlans() !== null;
}

function requirePlans(): BillingPlansConfig {
  const cfg = loadBillingPlans();
  if (!cfg) throw new HttpError(400, "BILLING_NOT_CONFIGURED", "Billing isn't configured for this installation");
  return cfg;
}

function requireAdapter(): PaymentAdapter {
  const adapter = getAdapter();
  if (!adapter) throw new HttpError(400, "BILLING_NOT_CONFIGURED", "Billing isn't configured for this installation");
  return adapter;
}

/** Maps provider failures onto HTTP errors: 5xx/timeout → 502 with a fixed, honest message. */
export function billingHttpError(e: unknown): HttpError {
  if (e instanceof BillingProviderError) {
    if (e.kind === "unavailable") return new HttpError(502, "BILLING_UNAVAILABLE", "Billing provider unavailable — nothing was changed");
    return new HttpError(400, "BILLING_PROVIDER_ERROR", e.message);
  }
  throw e;
}

async function getAccount(workspaceId: string) {
  const [account] = await db.select().from(schema.billingAccount).where(eq(schema.billingAccount.workspaceId, workspaceId));
  return account ?? null;
}

/** A database handle or a transaction on one. */
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Usage totals from the ledger since periodStart: settled, billable events only (never estimates). */
async function ledgerTotals(dbOrTx: DbOrTx, workspaceId: string, periodStart: Date) {
  const [row] = await dbOrTx
    .select({
      costMicros: sql<number>`coalesce(sum(${schema.usageEvent.costMicros}), 0)::bigint`,
      executions: sql<number>`count(*) filter (where ${schema.usageEvent.kind} = 'execution')::int`,
    })
    .from(schema.usageEvent)
    .where(and(eq(schema.usageEvent.workspaceId, workspaceId), gte(schema.usageEvent.createdAt, periodStart), eq(schema.usageEvent.status, "settled"), eq(schema.usageEvent.billable, true)));
  return { costMicros: Number(row?.costMicros ?? 0), executions: Number(row?.executions ?? 0) };
}

/**
 * The entitlements currently in force: the subscribed plan while the subscription is
 * active/trialing, otherwise the configured free plan. null when billing isn't configured.
 */
export async function getEntitlements(dbOrTx: Db, workspaceId: string): Promise<PlanEntitlements | null> {
  const cfg = loadBillingPlans();
  if (!cfg) return null;
  const [account] = await dbOrTx.select().from(schema.billingAccount).where(eq(schema.billingAccount.workspaceId, workspaceId));
  const inForce = account && (account.status === "active" || account.status === "trialing") ? account.planId : null;
  const plan = (inForce && planById(cfg, inForce)) || planById(cfg, cfg.freePlanId);
  return plan?.entitlements ?? null;
}

/** Full billing picture for the settings UI. */
export async function getBillingState(workspaceId: string) {
  const cfg = loadBillingPlans();
  const adapter = getAdapter();
  const account = await getAccount(workspaceId);
  const periodStart = monthStart();
  const usage = await ledgerTotals(db, workspaceId, periodStart);
  const entitlements = await getEntitlements(db, workspaceId);
  const planInForce = account && (account.status === "active" || account.status === "trialing") ? account.planId : cfg?.freePlanId;
  return {
    configured: isBillingConfigured(),
    /** Which provider and environment payments run against — the UI shows these verbatim. */
    provider: adapter?.provider ?? null,
    providerMode: adapter?.mode ?? null,
    plans: cfg?.plans ?? [],
    freePlanId: cfg?.freePlanId ?? null,
    account: account
      ? {
          provider: account.provider,
          customerId: account.customerId,
          subscriptionId: account.subscriptionId,
          planId: account.planId,
          status: account.status,
          cancelAtPeriodEnd: account.cancelAtPeriodEnd,
          currentPeriodEnd: account.currentPeriodEnd,
          trialEnd: account.trialEnd,
        }
      : null,
    planInForce: planInForce ?? null,
    entitlements,
    usage: { periodStart, costMicros: usage.costMicros, executions: usage.executions },
  };
}

/** Starts a checkout for a workspace without an active subscription. Creates the customer on first use. */
export async function startCheckout(user: CurrentUser, workspaceId: string, planId: string): Promise<{ url: string }> {
  const cfg = requirePlans();
  const adapter = requireAdapter();
  const plan = planById(cfg, planId);
  if (!plan) throw new HttpError(400, "UNKNOWN_PLAN", `Unknown plan "${planId}"`);
  if (plan.id === cfg.freePlanId) throw new HttpError(400, "UNKNOWN_PLAN", "The free plan has no checkout");

  const [ws] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  if (!ws) throw new HttpError(404, "NOT_FOUND", "Workspace not found");

  let account = await getAccount(workspaceId);
  if (account?.subscriptionId && (account.status === "active" || account.status === "trialing")) {
    throw new HttpError(400, "ALREADY_SUBSCRIBED", "This workspace already has a subscription — change the plan instead");
  }
  if (!account) {
    const customer = await adapter.createCustomer({ id: ws.id, name: ws.name, slug: ws.slug, email: user.email }).catch((e) => {
      throw billingHttpError(e);
    });
    await db
      .insert(schema.billingAccount)
      .values({ workspaceId, provider: adapter.provider, customerId: customer.id, status: "none" })
      .onConflictDoNothing();
    account = await getAccount(workspaceId);
    if (!account) throw new HttpError(500, "INTERNAL", "Couldn't store the billing account");
  }

  const { successUrl, cancelUrl } = settingsUrls(ws.slug);
  const session = await adapter
    .createCheckoutSession({ customerId: account.customerId, priceId: plan.providerPriceId, trialDays: plan.trialDays, successUrl, cancelUrl, checkoutPageUrl: checkoutPageUrl(ws.slug) })
    .catch((e) => {
      throw billingHttpError(e);
    });
  await audit(db, {
    workspaceId,
    actor: userActor(user),
    action: "billing.checkout_started",
    targetType: "plan",
    targetId: plan.id,
    data: { planId: plan.id, sessionId: session.id },
  });
  return { url: session.url };
}

/** Upgrade/downgrade: a subscription price change at the provider; the webhook applies it locally. */
export async function changePlan(user: CurrentUser, workspaceId: string, planId: string): Promise<void> {
  const cfg = requirePlans();
  const adapter = requireAdapter();
  const plan = planById(cfg, planId);
  if (!plan) throw new HttpError(400, "UNKNOWN_PLAN", `Unknown plan "${planId}"`);
  const account = await getAccount(workspaceId);
  if (!account?.subscriptionId || (account.status !== "active" && account.status !== "trialing")) {
    throw new HttpError(400, "NO_SUBSCRIPTION", "No active subscription to change — start a checkout first");
  }
  if (account.planId === plan.id) throw new HttpError(400, "SAME_PLAN", `Already on ${plan.name}`);
  await adapter.changeSubscriptionPrice(account.subscriptionId, plan.providerPriceId).catch((e) => {
    throw billingHttpError(e);
  });
  await audit(db, {
    workspaceId,
    actor: userActor(user),
    action: "billing.plan_changed",
    targetType: "plan",
    targetId: plan.id,
    data: { fromPlanId: account.planId, toPlanId: plan.id },
  });
}

export async function cancel(user: CurrentUser, workspaceId: string, atPeriodEnd: boolean): Promise<void> {
  requirePlans();
  const adapter = requireAdapter();
  const account = await getAccount(workspaceId);
  if (!account?.subscriptionId) throw new HttpError(400, "NO_SUBSCRIPTION", "No subscription to cancel");
  await adapter.cancelSubscription(account.subscriptionId, { atPeriodEnd }).catch((e) => {
    throw billingHttpError(e);
  });
  await audit(db, { workspaceId, actor: userActor(user), action: "billing.cancelled", targetType: "subscription", targetId: account.subscriptionId, data: { atPeriodEnd } });
}

const WEBHOOK_ACTOR: Actor = { kind: "system", label: "billing webhook" };

export type WebhookOutcome = "applied" | "applied_canonical" | "ignored_stale" | "ignored_unknown_customer" | "ignored_type" | "failed";

/** Actions that set the local subscription state; a same-instant tie is resolved against the provider. */
const SUBSCRIPTION_STATE_ACTIONS: ReadonlySet<BillingEventAction> = new Set(["subscription_upsert", "subscription_deleted", "payment_failed", "payment_succeeded"]);

/**
 * Verifies and applies one provider webhook event in a single transaction.
 * Duplicate event ids (PK conflict) are acknowledged without re-applying — except
 * events whose previous processing failed, which a redelivery reprocesses.
 */
export async function applyWebhookEvent(rawBody: string, signatureHeader: string | null): Promise<{ duplicate: boolean; outcome?: WebhookOutcome }> {
  const adapter = requireAdapter();
  const event = adapter.verifyWebhook(rawBody, signatureHeader, new Date());
  const cfg = loadBillingPlans();

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.billingEvent)
      .values({ id: event.id, provider: event.provider, type: event.type, createdAt: event.created, outcome: "applied" })
      .onConflictDoNothing()
      .returning({ id: schema.billingEvent.id });
    if (inserted.length === 0) {
      // A redelivery of an event that previously failed (e.g. the provider was
      // unreachable for a same-second canonical fetch) is reprocessed, not acked.
      const [existing] = await tx.select({ outcome: schema.billingEvent.outcome }).from(schema.billingEvent).where(eq(schema.billingEvent.id, event.id));
      if (existing?.outcome !== "failed") return { duplicate: true };
      await tx.delete(schema.billingEvent).where(eq(schema.billingEvent.id, event.id));
      await tx.insert(schema.billingEvent).values({ id: event.id, provider: event.provider, type: event.type, createdAt: event.created, outcome: "applied" });
    }

    const finish = async (outcome: WebhookOutcome, workspaceId: string | null, detail?: string) => {
      await tx.update(schema.billingEvent).set({ outcome, workspaceId, detail: detail ?? null }).where(eq(schema.billingEvent.id, event.id));
      return { duplicate: false, outcome };
    };

    const [account] = event.customerId
      ? // Row lock: concurrent deliveries for one account apply one at a time, so the out-of-order check holds.
        await tx.select().from(schema.billingAccount).where(eq(schema.billingAccount.customerId, event.customerId)).for("update")
      : [];
    if (!account) return finish("ignored_unknown_customer", null, event.customerId ? `customer ${event.customerId}` : "no customer on event");
    if (account.lastEventAt && event.created.getTime() < account.lastEventAt.getTime()) {
      return finish("ignored_stale", account.workspaceId, `event ${event.created.toISOString()} older than last applied ${account.lastEventAt.toISOString()}`);
    }

    const appliedBase = { lastEventAt: event.created, updatedAt: new Date() };

    // Provider timestamps can tie (Stripe has 1-second resolution). A different event
    // with the same `created` instant has an ambiguous order. Policy: the provider's
    // state is canonical — fetch it and apply that instead of the event payload. If the
    // provider can't be reached, don't guess: leave state unchanged and fail the event
    // so a redelivery (reprocessed via the failed-event carve-out above) or a reconcile
    // can fix it.
    if (account.lastEventAt && event.created.getTime() === account.lastEventAt.getTime() && SUBSCRIPTION_STATE_ACTIONS.has(event.action)) {
      const subscriptionId = event.subscription?.id ?? account.subscriptionId;
      if (subscriptionId) {
        let canonical: NormalizedSubscription;
        try {
          canonical = await adapter.retrieveSubscription(subscriptionId);
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          return finish("failed", account.workspaceId, `ambiguous same-second ordering and the canonical fetch failed: ${reason}`);
        }
        const plan = cfg ? planByProviderPrice(cfg, canonical.priceId) : undefined;
        await tx
          .update(schema.billingAccount)
          .set({
            ...appliedBase,
            subscriptionId: canonical.id,
            status: canonical.status,
            planId: plan?.id ?? null,
            currentPeriodEnd: canonical.currentPeriodEnd,
            cancelAtPeriodEnd: canonical.cancelAtPeriodEnd,
            trialEnd: canonical.trialEnd,
          })
          .where(eq(schema.billingAccount.workspaceId, account.workspaceId));
        await audit(tx, {
          workspaceId: account.workspaceId,
          actor: WEBHOOK_ACTOR,
          // Keep the event's own audit meaning (a payment failure stays a payment failure); only the state is canonical.
          action: event.action === "payment_failed" ? "billing.payment_failed" : "billing.subscription_updated",
          targetType: "subscription",
          targetId: canonical.id,
          data: { type: event.type, status: canonical.status, planId: plan?.id ?? null, canonical: true },
        });
        return finish("applied_canonical", account.workspaceId, `same created second as the last applied event; applied provider state (${canonical.status}) instead of the payload`);
      }
    }

    switch (event.action) {
      case "checkout_completed": {
        if (!event.checkoutSession?.subscriptionId) return finish("failed", account.workspaceId, "completed checkout without a subscription");
        await tx.update(schema.billingAccount).set({ ...appliedBase, subscriptionId: event.checkoutSession.subscriptionId }).where(eq(schema.billingAccount.workspaceId, account.workspaceId));
        await audit(tx, {
          workspaceId: account.workspaceId,
          actor: WEBHOOK_ACTOR,
          action: "billing.subscription_updated",
          targetType: "subscription",
          targetId: event.checkoutSession.subscriptionId,
          data: { type: event.type, linked: true },
        });
        return finish("applied", account.workspaceId);
      }
      case "subscription_upsert": {
        const sub = event.subscription;
        if (!sub) return finish("failed", account.workspaceId, "subscription event without a subscription object");
        const plan = cfg ? planByProviderPrice(cfg, sub.priceId) : undefined;
        await tx
          .update(schema.billingAccount)
          .set({
            ...appliedBase,
            subscriptionId: sub.id,
            status: sub.status,
            planId: plan?.id ?? null,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            trialEnd: sub.trialEnd,
          })
          .where(eq(schema.billingAccount.workspaceId, account.workspaceId));
        await audit(tx, {
          workspaceId: account.workspaceId,
          actor: WEBHOOK_ACTOR,
          action: "billing.subscription_updated",
          targetType: "subscription",
          targetId: sub.id,
          data: { type: event.type, status: sub.status, planId: plan?.id ?? null },
        });
        return finish("applied", account.workspaceId);
      }
      case "subscription_deleted": {
        await tx
          .update(schema.billingAccount)
          .set({ ...appliedBase, status: "canceled", cancelAtPeriodEnd: false })
          .where(eq(schema.billingAccount.workspaceId, account.workspaceId));
        await audit(tx, {
          workspaceId: account.workspaceId,
          actor: WEBHOOK_ACTOR,
          action: "billing.subscription_updated",
          targetType: "subscription",
          targetId: account.subscriptionId ?? undefined,
          data: { type: event.type, status: "canceled" },
        });
        return finish("applied", account.workspaceId);
      }
      case "payment_failed": {
        await tx.update(schema.billingAccount).set({ ...appliedBase, status: "past_due" }).where(eq(schema.billingAccount.workspaceId, account.workspaceId));
        await audit(tx, { workspaceId: account.workspaceId, actor: WEBHOOK_ACTOR, action: "billing.payment_failed", targetType: "subscription", targetId: account.subscriptionId ?? undefined, data: { type: event.type } });
        return finish("applied", account.workspaceId);
      }
      case "payment_succeeded": {
        await tx.update(schema.billingAccount).set({ ...appliedBase, status: "active" }).where(eq(schema.billingAccount.workspaceId, account.workspaceId));
        await audit(tx, {
          workspaceId: account.workspaceId,
          actor: WEBHOOK_ACTOR,
          action: "billing.subscription_updated",
          targetType: "subscription",
          targetId: account.subscriptionId ?? undefined,
          data: { type: event.type, status: "active" },
        });
        return finish("applied", account.workspaceId);
      }
      case "refund": {
        // A refund/credit changes no subscription state; it is recorded for audit only.
        await audit(tx, {
          workspaceId: account.workspaceId,
          actor: WEBHOOK_ACTOR,
          action: "billing.refunded",
          targetType: "subscription",
          targetId: event.refund?.subscriptionId ?? account.subscriptionId ?? undefined,
          data: { type: event.type, refundId: event.refund?.id ?? null, transactionId: event.refund?.transactionId ?? null, refundStatus: event.refund?.status ?? null },
        });
        return finish("applied", account.workspaceId);
      }
      default:
        return finish("ignored_type", account.workspaceId);
    }
  });
}

export interface ReconcileResult {
  configured: boolean;
  periodStart: Date;
  reported: { metric: Metric; quantity: number }[];
  skipped: { metric: Metric; quantity: number; reason: string }[];
}

/**
 * Reports ledger totals to the provider as monotonic deltas: each run reports only the
 * usage accrued since the previously reported rows for the same workspace + period +
 * metric. The idempotency key embeds the current ledger total
 * (usage:<ws>:<period>:<metric>:<ledgerTotal>), so a retry after a crash replays the
 * same identifier and is idempotent at the provider. A row lock on billing_account
 * serialises concurrent reconciles for a workspace (the unique key stays as a
 * backstop), and a provider failure rolls the transaction back, leaving no row, so a
 * retry can succeed later.
 */
export async function reconcileUsage(workspaceId: string, periodStart: Date = monthStart()): Promise<ReconcileResult> {
  const result: ReconcileResult = { configured: isBillingConfigured(), periodStart, reported: [], skipped: [] };
  if (!result.configured) return result;
  const adapter = requireAdapter();

  // The provider has no usage-metering API (Paddle): usage stays in the local ledger.
  // Nothing is sent and nothing is marked "reported" — that would be fake reporting.
  if (!adapter.supportsUsageReporting) {
    for (const metric of Object.keys(METER_EVENTS) as Metric[]) {
      result.skipped.push({ metric, quantity: 0, reason: `${adapter.provider} has no usage-metering API; usage is recorded in the local ledger only` });
    }
    return result;
  }

  // One transaction PER METRIC (each under the account row lock): a provider failure on one metric never rolls
  // back the local record of another metric the provider already accepted.
  for (const metric of Object.keys(METER_EVENTS) as Metric[]) {
    const done = await db.transaction(async (tx) => {
      const [account] = await tx.select().from(schema.billingAccount).where(eq(schema.billingAccount.workspaceId, workspaceId)).for("update");
      if (!account) return false;
      const totals = await ledgerTotals(tx, workspaceId, periodStart);
      const ledgerTotal = metric === "executions" ? totals.executions : totals.costMicros;
      const [reportedRow] = await tx
        .select({ total: sql<number>`coalesce(sum(${schema.usageReport.quantity}), 0)::bigint` })
        .from(schema.usageReport)
        .where(
          and(
            eq(schema.usageReport.workspaceId, workspaceId),
            eq(schema.usageReport.periodStart, periodStart),
            eq(schema.usageReport.metric, metric),
            eq(schema.usageReport.status, "reported"),
          ),
        );
      const reportedSoFar = Number(reportedRow?.total ?? 0);
      const delta = ledgerTotal - reportedSoFar;
      if (delta <= 0) {
        result.skipped.push({
          metric,
          quantity: reportedSoFar,
          reason: delta === 0 ? "no new usage since the last report" : `ledger total ${ledgerTotal} is below the reported total ${reportedSoFar} — nothing to report`,
        });
        return true;
      }
      const idempotencyKey = `usage:${workspaceId}:${periodStart.toISOString()}:${metric}:${ledgerTotal}`;
      await adapter.reportUsage({ customerId: account.customerId, eventName: METER_EVENTS[metric], value: delta, identifier: idempotencyKey }).catch((e) => {
        throw billingHttpError(e);
      });
      await tx
        .insert(schema.usageReport)
        .values({ workspaceId, periodStart, metric, quantity: delta, ledgerTotal, idempotencyKey, status: "reported" })
        .onConflictDoNothing({ target: schema.usageReport.idempotencyKey });
      result.reported.push({ metric, quantity: delta });
      return true;
    });
    if (!done) return result;
  }
  return result;
}
