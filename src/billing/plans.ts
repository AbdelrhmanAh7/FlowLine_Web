/**
 * Plans are CONFIGURATION ONLY. They are a validated, versioned platform setting (`billing.plans`: the plans and the
 * free plan id in force without an active subscription), edited in the platform admin panel and read per operation.
 * Prices are never hard-coded here; if the setting is missing or invalid, billing is simply "not configured" and
 * every billing surface says so. The environment is never read at runtime (it can only be imported once).
 */
import type { Db } from "@/db";
import type { BillingPlan } from "./types";

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface BillingPlansConfig {
  plans: BillingPlan[];
  freePlanId: string;
}

/** The current plans setting, or null when billing plans aren't configured (or no longer validate). */
export async function loadBillingPlans(dbOrTx?: DbOrTx): Promise<BillingPlansConfig | null> {
  const { getSetting } = await import("@/server/platform-settings");
  const row = await getSetting("billing.plans", dbOrTx);
  if (!row?.value) return null;
  return { plans: row.value.plans as BillingPlan[], freePlanId: row.value.freePlanId };
}

export function planById(cfg: BillingPlansConfig, id: string): BillingPlan | undefined {
  return cfg.plans.find((p) => p.id === id);
}

/** Resolves the plan whose providerPriceId matches a subscription's price; undefined if none. */
export function planByProviderPrice(cfg: BillingPlansConfig, priceId: string | null): BillingPlan | undefined {
  if (!priceId) return undefined;
  return cfg.plans.find((p) => p.providerPriceId === priceId);
}
