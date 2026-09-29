import { z } from "zod";
import type { Db } from "@/db";
import type * as schema from "@/db/schema";
import type { AiPolicy, AiRouteRef } from "@/db/schema";
import { HttpError } from "@/server/http";
import { isRouteRef, routeFor } from "./routing";
import { HubError } from "./types";

type Workspace = typeof schema.workspace.$inferSelect;

const routeRef = z.object({ connectionId: z.string().uuid(), modelId: z.string().min(1).max(200) }).strict();

const fields = {
  mode: z.enum(["MANUAL", "FALLBACK", "FREE_ONLY", "LOW_COST"]),
  allowUnknownCost: z.boolean(),
  fallbackRoutes: z.array(routeRef).max(5),
  lowCostPool: z.array(routeRef).max(10),
  priceCeiling: z.object({ inputPerMTokMicros: z.number().int().min(0).max(1e12), outputPerMTokMicros: z.number().int().min(0).max(1e12) }).strict().nullable(),
  requireNoTraining: z.boolean(),
  copilot: z.object({ planRoute: routeRef.nullable(), repairRoute: routeRef.nullable() }).strict(),
};
/** Owner-editable policy (ai.manage). Lists are bounded; every listed route is checked at save AND at execution. */
export const policyInput = z.object(fields).strict();
/** A partial update: fields left out keep their current value (no defaults are applied here). */
export const policyPatch = z.object(fields).partial().strict();
export type PolicyInput = z.infer<typeof policyInput>;

async function check(db: Db, workspace: Workspace, ref: AiRouteRef, what: string) {
  try {
    await routeFor(db, workspace, ref, "policy");
  } catch (e) {
    if (e instanceof HubError) throw new HttpError(400, e.code, `${what}: ${e.message}`);
    throw e;
  }
}

/** Validates a policy against this workspace's connections and returns the normalised value to store. */
export async function validatePolicy(db: Db, workspace: Workspace, input: PolicyInput): Promise<AiPolicy> {
  if (input.mode === "LOW_COST" && !input.priceCeiling) throw new HttpError(400, "VALIDATION", "Low-cost routing needs a price ceiling");
  if (input.mode === "FALLBACK" && input.fallbackRoutes.length === 0) throw new HttpError(400, "VALIDATION", "Fallback routing needs at least one fallback route");
  for (const [i, r] of input.fallbackRoutes.entries()) await check(db, workspace, r, `Fallback route ${i + 1}`);
  for (const [i, r] of input.lowCostPool.entries()) await check(db, workspace, r, `Low-cost route ${i + 1}`);
  if (input.copilot.planRoute) await check(db, workspace, input.copilot.planRoute, "Copilot planning route");
  if (input.copilot.repairRoute) await check(db, workspace, input.copilot.repairRoute, "Copilot repair route");
  const uniq = (rs: AiRouteRef[]) => rs.filter((r, i) => isRouteRef(r) && rs.findIndex((x) => x.connectionId === r.connectionId && x.modelId === r.modelId) === i);
  return {
    mode: input.mode,
    allowUnknownCost: input.allowUnknownCost,
    fallbackRoutes: uniq(input.fallbackRoutes),
    lowCostPool: uniq(input.lowCostPool),
    priceCeiling: input.priceCeiling,
    requireNoTraining: input.requireNoTraining,
    copilot: { planRoute: input.copilot.planRoute, repairRoute: input.copilot.repairRoute },
  };
}
