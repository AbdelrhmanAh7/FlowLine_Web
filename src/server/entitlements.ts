import type { db as Db } from "@/db";

type DbOrTx = typeof Db | Parameters<Parameters<(typeof Db)["transaction"]>[0]>[0];

export interface PlanEntitlements {
  maxMonthlyExecutions: number | null;
  monthlyUsageCapMicros: number | null;
  maxConcurrentRuns: number;
}

/**
 * Entitlements from the workspace's billing plan (active/trialing subscription → its plan; otherwise the
 * configured free plan), or null when billing isn't configured. Loaded lazily to keep billing ↔ usage
 * imports acyclic.
 */
export async function planEntitlements(tx: DbOrTx, workspaceId: string): Promise<PlanEntitlements | null> {
  const { getEntitlements } = await import("@/billing/service");
  return getEntitlements(tx as typeof Db, workspaceId);
}
