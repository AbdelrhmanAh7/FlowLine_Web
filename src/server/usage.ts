import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
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

/** An agent run's own cost limit would be passed by this reservation (checked with the ledger, under the lock). */
export class AgentCostLimitError extends Error {
  code = "AGENT_COST_LIMIT";
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
  /**
   * The agent run's hard cost limit (CXH-04). Checked in the same locked transaction against everything the agent
   * run already holds in the ledger — settled charges AND outstanding reservations, of every kind (model attempts,
   * retries, fallbacks, tool steps) — so retries and fallback routes can't pass it.
   */
  agentCapMicros?: number | null;
  /**
   * An unknown-price model call ("ai", unpriced) under an agent cap is refused here too (defence in depth for CXH-04)
   * unless the agent explicitly accepted unknown-price calls outside its limit.
   */
  unknownCostOutsideCap?: boolean;
  /** The execution lease making this reservation (run / agent run `locked_by`), see usage_event.holder (CXH-17). */
  holder?: string | null;
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
    if (r.agentCapMicros != null && r.agentRunId) {
      if (r.kind === "ai" && r.unpriced && !r.unknownCostOutsideCap) {
        throw new AgentCostLimitError("The price of this AI call is unknown and the agent has a cost limit, so nothing was sent (an unknown cost can't be shown to stay within the limit).");
      }
      const held = await agentRunSpentMicros(tx as unknown as Db, r.workspaceId, r.agentRunId);
      if (held + r.estimatedMicros > r.agentCapMicros) {
        throw new AgentCostLimitError(`The agent's cost limit would be passed (${fmt(held)} of ${fmt(r.agentCapMicros)} used or reserved; the next call needs up to ${fmt(r.estimatedMicros)}). Nothing was sent.`);
      }
    }
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
        holder: r.holder ?? null,
      })
      .onConflictDoNothing({ target: schema.usageEvent.idempotencyKey });
    return { reserved: true };
  });
}

/** Everything an agent run holds in the ledger: settled charges plus outstanding reservations (all kinds). */
export async function agentRunSpentMicros(db: Db, workspaceId: string, agentRunId: string): Promise<number> {
  const [{ spent }] = await db
    .select({ spent: sql<number>`coalesce(sum(${schema.usageEvent.costMicros}), 0)::bigint` })
    .from(schema.usageEvent)
    .where(and(eq(schema.usageEvent.workspaceId, workspaceId), eq(schema.usageEvent.agentRunId, agentRunId), inArray(schema.usageEvent.status, ["reserved", "settled"])));
  return Number(spent);
}

export interface Settlement {
  costMicros: number;
  inputTokens?: number;
  outputTokens?: number;
  unpriced?: boolean;
  quantity?: number;
}

/** Settles an open reservation. Returns false when there was none (already settled / released). */
export async function settleUsage(db: Db, idempotencyKey: string, s: Settlement): Promise<boolean> {
  const rows = await db
    .update(schema.usageEvent)
    .set({ status: "settled", costMicros: s.costMicros, inputTokens: s.inputTokens ?? null, outputTokens: s.outputTokens ?? null, unpriced: s.unpriced ?? false, quantity: s.quantity ?? 1, settledAt: new Date() })
    .where(and(eq(schema.usageEvent.idempotencyKey, idempotencyKey), eq(schema.usageEvent.status, "reserved")))
    .returning({ id: schema.usageEvent.id });
  return rows.length > 0;
}

/**
 * A late result for an attempt that recovery had already settled as ABANDONED (at its reservation, as a possible
 * charge): the ledger takes the attempt's real outcome instead (CXH-17). Only rows settled by abandonment are touched.
 */
export async function reconcileAbandonedUsage(db: Db, idempotencyKey: string, s: Settlement): Promise<boolean> {
  const rows = await db
    .update(schema.usageEvent)
    .set({ costMicros: s.costMicros, inputTokens: s.inputTokens ?? null, outputTokens: s.outputTokens ?? null, unpriced: s.unpriced ?? false, quantity: s.quantity ?? 1, settledAt: new Date() })
    .where(and(eq(schema.usageEvent.idempotencyKey, idempotencyKey), eq(schema.usageEvent.status, "settled"), isNotNull(schema.usageEvent.abandonedAt)))
    .returning({ id: schema.usageEvent.id });
  return rows.length > 0;
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
