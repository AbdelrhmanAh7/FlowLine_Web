/**
 * Owner action configuration types and feature flags.
 *
 * These types define the configuration objects that will hold owner-provided credentials
 * and settings for the five sensitive owner actions tracked in issue #162.
 * All feature flags default to OFF — the owner must explicitly enable them.
 *
 * No real credentials or secrets are stored in this file. This is only the TYPE DEFINITIONS
 * and feature flag defaults. Actual credentials are stored encrypted in the database via
 * the admin panel (/admin) and never read from environment variables.
 */

import { z } from "zod";

/**
 * Feature flags for owner-controlled sensitive actions.
 * All default to false (disabled). The owner enables them via environment variables
 * after completing the corresponding setup steps.
 */
export interface OwnerFeatureFlags {
  /** Real provider and AI account setup (issue #162, item 1) */
  ownerRealProviderEnabled: boolean;
  /** Sandbox payments configuration (issue #162, item 2) */
  ownerSandboxPaymentsEnabled: boolean;
  /** Approved deployment with restore/rollback/alerts (issue #162, item 3) */
  ownerApprovedDeploymentEnabled: boolean;
  /** Pricing and terms finalization (issue #162, item 4) */
  ownerPricingTermsEnabled: boolean;
  /** Customer test coordination (issue #162, item 5) */
  ownerCustomerTestsEnabled: boolean;
}

/**
 * Default feature flags — all OFF.
 * The owner sets these to true via environment variables after completing setup.
 */
export const DEFAULT_OWNER_FEATURE_FLAGS: OwnerFeatureFlags = {
  ownerRealProviderEnabled: false,
  ownerSandboxPaymentsEnabled: false,
  ownerApprovedDeploymentEnabled: false,
  ownerPricingTermsEnabled: false,
  ownerCustomerTestsEnabled: false,
};

/**
 * Read feature flags from environment variables.
 * Environment variable names: FLOWLINE_OWNER_<FLAG_NAME> (e.g., FLOWLINE_OWNER_REAL_PROVIDER_ENABLED=true)
 */
export function readOwnerFeatureFlags(): OwnerFeatureFlags {
  return {
    ownerRealProviderEnabled: process.env.FLOWLINE_OWNER_REAL_PROVIDER_ENABLED === "true",
    ownerSandboxPaymentsEnabled: process.env.FLOWLINE_OWNER_SANDBOX_PAYMENTS_ENABLED === "true",
    ownerApprovedDeploymentEnabled: process.env.FLOWLINE_OWNER_APPROVED_DEPLOYMENT_ENABLED === "true",
    ownerPricingTermsEnabled: process.env.FLOWLINE_OWNER_PRICING_TERMS_ENABLED === "true",
    ownerCustomerTestsEnabled: process.env.FLOWLINE_OWNER_CUSTOMER_TESTS_ENABLED === "true",
  };
}

/**
 * Configuration schema for Real Provider and AI Account Setup (issue #162, item 1).
 * This defines the structure for real provider credentials that the owner will configure
 * via the admin panel. These are NOT read from environment variables.
 */
export const RealProviderConfigSchema = z.object({
  /** Provider identifier (e.g., "openai", "anthropic", "google") */
  provider: z.string().min(1),
  /** Human-readable provider name */
  name: z.string().min(1),
  /** Base URL for the provider's API */
  baseUrl: z.string().url(),
  /** Whether this provider is enabled for workspace connections */
  enabled: z.boolean().default(false),
  /** Contract verification status */
  contractVerified: z.boolean().default(false),
  /** Terms acceptance timestamp (ISO 8601) */
  termsAcceptedAt: z.string().datetime().optional(),
  /** Legal review reference */
  legalReviewRef: z.string().optional(),
});

export type RealProviderConfig = z.infer<typeof RealProviderConfigSchema>;

/**
 * Configuration schema for Sandbox Payments (issue #162, item 2).
 * Defines the payment provider configuration for sandbox/test mode.
 */
export const SandboxPaymentsConfigSchema = z.object({
  /** Payment provider: "stripe" | "paddle" */
  provider: z.enum(["stripe", "paddle"]),
  /** Sandbox/test environment identifier */
  environment: z.literal("sandbox"),
  /** Client-side publishable key (safe for browser) */
  clientToken: z.string().min(1),
  /** Webhook secret for verifying callbacks */
  webhookSecret: z.string().min(1),
  /** Whether sandbox payments are enabled */
  enabled: z.boolean().default(false),
  /** Payment provider account ID (for reference) */
  accountId: z.string().optional(),
  /** Legal/compliance review reference */
  complianceReviewRef: z.string().optional(),
});

export type SandboxPaymentsConfig = z.infer<typeof SandboxPaymentsConfigSchema>;

/**
 * Configuration schema for Approved Deployment (issue #162, item 3).
 * Defines the deployment approval, restore/rollback, and alerting configuration.
 */
export const ApprovedDeploymentConfigSchema = z.object({
  /** Deployment target environment */
  environment: z.enum(["staging", "production"]),
  /** Git SHA or tag that was approved for deployment */
  approvedRevision: z.string().min(1),
  /** Approval timestamp (ISO 8601) */
  approvedAt: z.string().datetime(),
  /** Owner who approved the deployment */
  approvedBy: z.string().min(1),
  /** Rollback configuration */
  rollback: z.object({
    /** Whether automatic rollback on health check failure is enabled */
    autoRollback: z.boolean().default(true),
    /** Maximum time to wait before triggering rollback (seconds) */
    rollbackTimeoutSeconds: z.number().int().positive().default(300),
    /** Previous known-good revision to roll back to */
    fallbackRevision: z.string().optional(),
  }),
  /** Restore configuration */
  restore: z.object({
    /** Whether point-in-time restore is configured */
    pointInTimeRestore: z.boolean().default(false),
    /** Backup retention days */
    backupRetentionDays: z.number().int().positive().default(30),
    /** Restore test schedule (cron expression) */
    restoreTestSchedule: z.string().optional(),
  }),
  /** Alerting configuration */
  alerts: z.object({
    /** Alert webhook URL (e.g., PagerDuty, Slack, email) */
    webhookUrl: z.string().url().optional(),
    /** Alert on deployment success */
    onSuccess: z.boolean().default(true),
    /** Alert on deployment failure */
    onFailure: z.boolean().default(true),
    /** Alert on automatic rollback */
    onRollback: z.boolean().default(true),
    /** Alert on health check degradation */
    onDegraded: z.boolean().default(true),
  }),
  /** Health check endpoints to monitor post-deployment */
  healthChecks: z.array(z.object({
    name: z.string().min(1),
    url: z.string().url(),
    expectedStatus: z.number().int().default(200),
    timeoutSeconds: z.number().int().positive().default(30),
  })).default([]),
});

export type ApprovedDeploymentConfig = z.infer<typeof ApprovedDeploymentConfigSchema>;

/**
 * Configuration schema for Pricing and Terms (issue #162, item 4).
 * Defines the pricing plans and terms of service configuration.
 */
export const PricingTermsConfigSchema = z.object({
  /** Currency for all prices (ISO 4217) */
  currency: z.string().length(3).default("USD"),
  /** Pricing plans */
  plans: z.array(z.object({
    /** Plan identifier (e.g., "free", "pro", "enterprise") */
    id: z.string().min(1),
    /** Human-readable plan name */
    name: z.string().min(1),
    /** Price in minor units (cents for USD) per billing interval */
    priceMinor: z.number().int().nonnegative(),
    /** Billing interval */
    interval: z.enum(["month", "year"]),
    /** Plan entitlements */
    entitlements: z.object({
      maxMonthlyExecutions: z.number().int().nullable().default(null),
      monthlyUsageCapMicros: z.number().int().nullable().default(null),
      maxConcurrentRuns: z.number().int().positive().default(1),
    }),
    /** Whether this plan is publicly visible */
    public: z.boolean().default(true),
    /** Trial days */
    trialDays: z.number().int().nonnegative().default(0),
  })).min(1),
  /** Terms of Service URL */
  termsUrl: z.string().url(),
  /** Privacy Policy URL */
  privacyUrl: z.string().url(),
  /** Legal review sign-off */
  legalSignOff: z.object({
    /** Whether legal has reviewed and approved */
    approved: z.boolean().default(false),
    /** Legal reviewer identifier */
    reviewer: z.string().optional(),
    /** Review timestamp (ISO 8601) */
    reviewedAt: z.string().datetime().optional(),
    /** Review reference/document ID */
    reference: z.string().optional(),
  }),
  /** Effective date for pricing (ISO 8601) */
  effectiveDate: z.string().datetime().optional(),
});

export type PricingTermsConfig = z.infer<typeof PricingTermsConfigSchema>;

/**
 * Configuration schema for Customer Test Coordination (issue #162, item 5).
 * Defines the customer test program configuration.
 */
export const CustomerTestsConfigSchema = z.object({
  /** Test program name */
  programName: z.string().min(1),
  /** Test program description */
  description: z.string().optional(),
  /** Start date (ISO 8601) */
  startDate: z.string().datetime(),
  /** End date (ISO 8601) */
  endDate: z.string().datetime().optional(),
  /** Maximum number of participating customers */
  maxCustomers: z.number().int().positive().default(10),
  /** Current enrolled customers */
  enrolledCustomers: z.array(z.object({
    /** Customer identifier */
    id: z.string().min(1),
    /** Customer name (for internal reference) */
    name: z.string().min(1),
    /** Customer email */
    email: z.string().email(),
    /** Workspace slug assigned to customer */
    workspaceSlug: z.string().min(1),
    /** Enrollment date (ISO 8601) */
    enrolledAt: z.string().datetime(),
    /** NDA signed timestamp (ISO 8601) */
    ndaSignedAt: z.string().datetime().optional(),
    /** Status */
    status: z.enum(["active", "paused", "completed", "withdrawn"]).default("active"),
  })).default([]),
  /** Feedback collection endpoint */
  feedbackUrl: z.string().url().optional(),
  /** Whether the test program is active */
  active: z.boolean().default(false),
  /** Legal/compliance clearance reference */
  complianceRef: z.string().optional(),
});

export type CustomerTestsConfig = z.infer<typeof CustomerTestsConfigSchema>;

/**
 * Combined owner action configuration (all five items).
 * This is the complete configuration that would be stored in the platform settings.
 */
export const OwnerActionsConfigSchema = z.object({
  realProviders: z.array(RealProviderConfigSchema).default([]),
  sandboxPayments: SandboxPaymentsConfigSchema.optional(),
  approvedDeployment: ApprovedDeploymentConfigSchema.optional(),
  pricingTerms: PricingTermsConfigSchema.optional(),
  customerTests: CustomerTestsConfigSchema.optional(),
  featureFlags: z.object({
    ownerRealProviderEnabled: z.boolean().default(false),
    ownerSandboxPaymentsEnabled: z.boolean().default(false),
    ownerApprovedDeploymentEnabled: z.boolean().default(false),
    ownerPricingTermsEnabled: z.boolean().default(false),
    ownerCustomerTestsEnabled: z.boolean().default(false),
  }).default(DEFAULT_OWNER_FEATURE_FLAGS),
});

export type OwnerActionsConfig = z.infer<typeof OwnerActionsConfigSchema>;

/**
 * Check if a specific owner action is enabled via feature flags.
 */
export function isOwnerActionEnabled(
  flags: OwnerFeatureFlags,
  action: keyof OwnerFeatureFlags
): boolean {
  return flags[action] === true;
}

/**
 * Get a human-readable reason why an owner action is disabled.
 * Used for UI `disabledReason` tooltips.
 */
export function getOwnerActionDisabledReason(action: keyof OwnerFeatureFlags): string {
  const reasons: Record<keyof OwnerFeatureFlags, string> = {
    ownerRealProviderEnabled: "Real provider setup pending — owner must configure provider accounts and accept terms",
    ownerSandboxPaymentsEnabled: "Sandbox payments pending — owner must configure payment provider accounts",
    ownerApprovedDeploymentEnabled: "Approved deployment pending — owner must approve deployment with rollback/alerts",
    ownerPricingTermsEnabled: "Pricing and terms pending — legal review and sign-off required",
    ownerCustomerTestsEnabled: "Customer tests pending — owner must coordinate customers and NDA clearance",
  };
  return reasons[action];
}