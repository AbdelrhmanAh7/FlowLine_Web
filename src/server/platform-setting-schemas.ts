import { z } from "zod";
import type { SettingKey } from "./platform-purposes";

/** Validation of the platform settings (pure: no DB), shared by the settings service and the unit tests. */
const planSchema = z.object({
  id: z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/i),
  name: z.string().min(1).max(80),
  providerPriceId: z.string().min(1).max(120),
  displayPrice: z.object({ amountMinor: z.number().int().nonnegative(), currency: z.string().min(3).max(3), interval: z.string().min(1).max(20) }).optional(),
  trialDays: z.number().int().positive().max(365).optional(),
  entitlements: z.object({
    maxMonthlyExecutions: z.number().int().positive().nullable(),
    monthlyUsageCapMicros: z.number().int().nonnegative().nullable(),
    maxConcurrentRuns: z.number().int().positive(),
  }),
});

const plansSchema = z
  .object({ plans: z.array(planSchema).min(1).max(20), freePlanId: z.string().min(1) })
  .refine((v) => v.plans.some((p) => p.id === v.freePlanId), { message: "The free plan must be one of the plans" })
  .refine((v) => new Set(v.plans.map((p) => p.id)).size === v.plans.length, { message: "Plan ids must be unique" });

const recipientRule = z.string().trim().toLowerCase().min(3).max(254).regex(/^(\*\.|\.|@)?[a-z0-9._%+-]*@?[a-z0-9.-]+\.[a-z]{2,}$/i);

export const SETTING_SCHEMAS = {
  "email.provider": z.enum(["resend", "postmark"]).nullable(),
  "email.allowed_recipients": z.array(recipientRule).max(200),
  "billing.provider": z.enum(["stripe", "paddle"]).nullable(),
  "billing.plans": plansSchema.nullable(),
} satisfies Record<SettingKey, z.ZodType>;

