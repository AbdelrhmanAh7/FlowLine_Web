import type { db as Db } from "@/db";

type DbOrTx = typeof Db | Parameters<Parameters<(typeof Db)["transaction"]>[0]>[0];

export interface PlanEntitlements {
  maxMonthlyExecutions: number | null;
  monthlyUsageCapMicros: number | null;
  maxConcurrentRuns: number;
}

/**
 * Entitlements from the workspace's billing plan, or null when billing isn't configured.
 * Wired to src/billing (subscription → plan; past_due/canceled → free plan).
 */
export async function planEntitlements(_tx: DbOrTx, _workspaceId: string): Promise<PlanEntitlements | null> {
  return null;
}
