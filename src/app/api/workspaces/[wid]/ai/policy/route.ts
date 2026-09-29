import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { policyInput, policyPatch, validatePolicy } from "@/ai/hub/policy";
import { requireUser, requireWorkspace } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { HttpError, jsonNoStore, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

/** Partial update: fields that are left out keep their current value. */
const body = policyPatch;

/**
 * AI execution policy (owner, ai.manage): MANUAL / FALLBACK (explicit ordered routes) / FREE_ONLY (verified zero
 * price, fails closed) / LOW_COST (approved pool within a ceiling), the unknown-cost rule under a spending cap, the
 * privacy rule, and the Copilot planning/repair routes. Every listed route must be a usable connection of THIS
 * workspace; execution re-checks each one (rotation, revocation, use_roles).
 */
export const PUT = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "ai.manage");
  const b = await parseBody(req, body);
  const current = workspace.aiPolicy ?? { mode: "MANUAL", allowUnknownCost: false };
  const merged = policyInput.safeParse({
    mode: current.mode,
    allowUnknownCost: current.allowUnknownCost,
    fallbackRoutes: current.fallbackRoutes ?? [],
    lowCostPool: current.lowCostPool ?? [],
    priceCeiling: current.priceCeiling ?? null,
    requireNoTraining: current.requireNoTraining ?? false,
    copilot: { planRoute: current.copilot?.planRoute ?? null, repairRoute: current.copilot?.repairRoute ?? null },
    ...b,
  });
  if (!merged.success) throw new HttpError(400, "VALIDATION", merged.error.issues[0]?.message ?? "Invalid policy");
  const policy = await validatePolicy(db, workspace, merged.data);
  await db.update(schema.workspace).set({ aiPolicy: policy, updatedAt: new Date() }).where(eq(schema.workspace.id, workspace.id));
  await audit(db, { workspaceId: workspace.id, actor: userActor(user), action: "settings.updated", targetType: "workspace", targetId: workspace.id, data: { aiPolicy: policy } });
  return jsonNoStore({ policy });
});
