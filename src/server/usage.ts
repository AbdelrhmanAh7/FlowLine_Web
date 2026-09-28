import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { planEntitlements } from "./entitlements";
import { schema } from "@/db";
import type { PriceEntry } from "@/db/schema";

export class BudgetExceededError extends Error {
  code = "BUDGET_EXCEEDED";
  constructor(message: string) {
    super(message);
  }
}

export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export { priceFor } from "./prices";

export function aiCostMicros(p: PriceEntry | undefined, inputTokens: number, outputTokens: number) {
  if (!p) return { cost: 0, unpriced: true };
  const cost = Math.round(((p.inputPerMTokMicros ?? 0) * inputTokens + (p.outputPerMTokMicros ?? 0) * outputTokens) / 1_000_000) + (p.perCallMicros ?? 0);
  return { cost, unpriced: false };
}

export interface ReserveInput {
  workspaceId: string;
  runId: string | null;
  nodeId: string | null;
  kind: "ai" | "action" | "http" | "run" | "agent_step";
  idempotencyKey: string;
  agentRunId?: string;
  /** This reservation is a retry of an earlier attempt (reported separately; each attempt is its own event). */
  retry?: boolean;
  /** False for system work that is recorded but never charged. */
  billable?: boolean;
  estimatedMicros: number;
  provider?: string;
  model?: string;
  unpriced?: boolean;
}

/**
 * Reserves the estimated cost before a costed call. The workspace row is locked
 * FOR UPDATE, so concurrent runs racing the monthly budget serialize here and the
 * limit can't be overshot by interleaving. Re-reserving the same idempotency key
 * (a retried ledger write) is a no-op.
 */
export async function reserveUsage(db: Db, r: ReserveInput): Promise<{ reserved: boolean }> {
  return db.transaction(async (tx) => {
    const [ws] = await tx
      .select({ budget: schema.workspace.monthlyBudgetMicros })
      .from(schema.workspace)
      .where(eq(schema.workspace.id, r.workspaceId))
      .for("update");
    const [existing] = await tx.select({ id: schema.usageEvent.id }).from(schema.usageEvent).where(eq(schema.usageEvent.idempotencyKey, r.idempotencyKey));
    if (existing) return { reserved: false };
    // The stricter of the owner's monthly budget and the billing plan's usage cap applies.
    const ent = await planEntitlements(tx, r.workspaceId);
    const caps = [ws?.budget ?? null, ent?.monthlyUsageCapMicros ?? null].filter((c): c is number => c != null);
    const budget = caps.length ? Math.min(...caps) : null;
    if (budget != null) {
      const [{ spent }] = await tx
        .select({ spent: sql<number>`coalesce(sum(${schema.usageEvent.costMicros}), 0)::bigint` })
        .from(schema.usageEvent)
        .where(and(eq(schema.usageEvent.workspaceId, r.workspaceId), gte(schema.usageEvent.createdAt, monthStart()), inArray(schema.usageEvent.status, ["reserved", "settled"])));
      if (Number(spent) + r.estimatedMicros > budget) {
        throw new BudgetExceededError(`Monthly budget reached (${fmt(Number(spent))} of ${fmt(budget)} used; this step needs up to ${fmt(r.estimatedMicros)})`);
      }
    }
    await tx
      .insert(schema.usageEvent)
      .values({
        workspaceId: r.workspaceId,
        runId: r.runId,
        nodeId: r.nodeId,
        kind: r.kind,
        status: "reserved",
        idempotencyKey: r.idempotencyKey,
        provider: r.provider ?? null,
        model: r.model ?? null,
        costMicros: r.estimatedMicros,
        estimatedMicros: r.estimatedMicros,
        agentRunId: r.agentRunId ?? null,
        retry: r.retry ?? false,
        billable: r.billable ?? true,
        unpriced: r.unpriced ?? false,
      })
      .onConflictDoNothing({ target: schema.usageEvent.idempotencyKey });
    return { reserved: true };
  });
}

export async function settleUsage(db: Db, idempotencyKey: string, s: { costMicros: number; inputTokens?: number; outputTokens?: number; unpriced?: boolean; quantity?: number }) {
  await db
    .update(schema.usageEvent)
    .set({ status: "settled", costMicros: s.costMicros, inputTokens: s.inputTokens ?? null, outputTokens: s.outputTokens ?? null, unpriced: s.unpriced ?? false, quantity: s.quantity ?? 1, settledAt: new Date() })
    .where(and(eq(schema.usageEvent.idempotencyKey, idempotencyKey), eq(schema.usageEvent.status, "reserved")));
}

/** The call never happened (failed before sending) — free the reservation. */
export async function releaseUsage(db: Db, idempotencyKey: string) {
  await db
    .update(schema.usageEvent)
    .set({ status: "released", costMicros: 0, settledAt: new Date() })
    .where(and(eq(schema.usageEvent.idempotencyKey, idempotencyKey), eq(schema.usageEvent.status, "reserved")));
}

export async function usageSummary(db: Db, workspaceId: string) {
  const since = monthStart();
  const rows = await db
    .select({
      kind: schema.usageEvent.kind,
      provider: schema.usageEvent.provider,
      model: schema.usageEvent.model,
      events: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${schema.usageEvent.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.usageEvent.outputTokens}), 0)::int`,
      costMicros: sql<number>`coalesce(sum(${schema.usageEvent.costMicros}), 0)::bigint`,
      unpriced: sql<number>`count(*) filter (where ${schema.usageEvent.unpriced})::int`,
    })
    .from(schema.usageEvent)
    .where(and(eq(schema.usageEvent.workspaceId, workspaceId), gte(schema.usageEvent.createdAt, since), inArray(schema.usageEvent.status, ["reserved", "settled"])))
    .groupBy(schema.usageEvent.kind, schema.usageEvent.provider, schema.usageEvent.model);
  const [ws] = await db
    .select({ budget: schema.workspace.monthlyBudgetMicros, currency: schema.workspace.currency })
    .from(schema.workspace)
    .where(eq(schema.workspace.id, workspaceId));
  const total = rows.reduce((a, r) => a + Number(r.costMicros), 0);
  return { since, rows: rows.map((r) => ({ ...r, costMicros: Number(r.costMicros) })), totalMicros: total, budgetMicros: ws?.budget ?? null, currency: ws?.currency ?? "USD" };
}

function fmt(micros: number) {
  return `${(micros / 1_000_000).toFixed(4)}`;
}
