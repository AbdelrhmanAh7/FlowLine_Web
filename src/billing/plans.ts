/**
 * Plans are CONFIGURATION ONLY. They come from FLOWLINE_BILLING_PLANS (JSON) and
 * FLOWLINE_BILLING_FREE_PLAN (the plan id in force without an active subscription).
 * Prices are never hard-coded here; if the env is missing or invalid, billing is
 * simply "not configured" and every billing surface says so.
 */
import { z } from "zod";
import type { BillingPlan } from "./types";

const planSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  providerPriceId: z.string().min(1),
  displayPrice: z.object({ amountMinor: z.number().int().nonnegative(), currency: z.string().min(1), interval: z.string().min(1) }).optional(),
  trialDays: z.number().int().positive().optional(),
  entitlements: z.object({
    maxMonthlyExecutions: z.number().int().positive().nullable(),
    monthlyUsageCapMicros: z.number().int().nonnegative().nullable(),
    maxConcurrentRuns: z.number().int().positive(),
  }),
});

export interface BillingPlansConfig {
  plans: BillingPlan[];
  freePlanId: string;
}

/**
 * Reads plan configuration from the environment. Returns null when billing is not
 * configured (env missing) or misconfigured (invalid JSON/schema, unknown free plan).
 */
export function loadBillingPlans(): BillingPlansConfig | null {
  const raw = process.env.FLOWLINE_BILLING_PLANS;
  const freePlanId = process.env.FLOWLINE_BILLING_FREE_PLAN;
  if (!raw || !freePlanId) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = z.array(planSchema).safeParse(json);
  if (!parsed.success || parsed.data.length === 0) return null;
  if (!parsed.data.some((p) => p.id === freePlanId)) return null;
  const ids = new Set(parsed.data.map((p) => p.id));
  if (ids.size !== parsed.data.length) return null;
  return { plans: parsed.data, freePlanId };
}

export function planById(cfg: BillingPlansConfig, id: string): BillingPlan | undefined {
  return cfg.plans.find((p) => p.id === id);
}

/** Resolves the plan whose providerPriceId matches a subscription's price; undefined if none. */
export function planByProviderPrice(cfg: BillingPlansConfig, priceId: string | null): BillingPlan | undefined {
  if (!priceId) return undefined;
  return cfg.plans.find((p) => p.providerPriceId === priceId);
}
