import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { HttpError } from "@/server/http";
import { unpublishFlow } from "@/server/publish";

/**
 * Entitlement for activating Company Builder tasks. Two independent sources, never mixed up:
 *  - an explicit DEVELOPMENT trial (dev/test builds only, granted by the workspace owner, labelled as such), and
 *  - the EXISTING billing status (read-only here: `active` / `trialing` from the billing abstraction).
 * Billing status, installation status and task activation stay separate: a payment never activates a task, and
 * saved credentials never do either. When no entitlement remains, reconciliation pauses active tasks.
 */

export const DEV_TRIAL_DAYS = 14;

export function devTrialAllowed(env: NodeJS.ProcessEnv = process.env) {
  const e = env.FLOWLINE_ENV ?? "development";
  return (e === "development" || e === "test") && !env.FLOWLINE_BETA_MODE;
}

export async function billingStatus(workspaceId: string) {
  const [acct] = await db.select({ status: schema.billingAccount.status, planId: schema.billingAccount.planId }).from(schema.billingAccount).where(eq(schema.billingAccount.workspaceId, workspaceId));
  return acct ?? { status: "none", planId: null };
}

export async function effectiveEntitlement(workspaceId: string): Promise<{ source: "dev_trial" | "billing"; expiresAt: Date | null } | null> {
  const [e] = await db.select().from(schema.cbEntitlement).where(eq(schema.cbEntitlement.workspaceId, workspaceId));
  if (e && e.status === "active" && e.expiresAt > new Date() && devTrialAllowed()) return { source: "dev_trial", expiresAt: e.expiresAt };
  const b = await billingStatus(workspaceId);
  if (b.status === "active" || b.status === "trialing") return { source: "billing", expiresAt: null };
  return null;
}

export async function grantDevTrial(user: CurrentUser, workspaceId: string) {
  if (!devTrialAllowed()) throw new HttpError(403, "DEV_TRIAL_NOT_ALLOWED", "Development trials are only available in development builds");
  const expiresAt = new Date(Date.now() + DEV_TRIAL_DAYS * 86400_000);
  await db
    .insert(schema.cbEntitlement)
    .values({ workspaceId, status: "active", grantedBy: user.id, expiresAt })
    .onConflictDoUpdate({ target: schema.cbEntitlement.workspaceId, set: { status: "active", grantedBy: user.id, grantedAt: new Date(), expiresAt, revision: 1 } });
  await audit(db, { workspaceId, actor: userActor(user), action: "company_builder.entitlement_changed", data: { source: "dev_trial", status: "active" } });
}

export async function cancelDevTrial(user: CurrentUser, workspaceId: string) {
  await db.update(schema.cbEntitlement).set({ status: "cancelled" }).where(eq(schema.cbEntitlement.workspaceId, workspaceId));
  await audit(db, { workspaceId, actor: userActor(user), action: "company_builder.entitlement_changed", data: { source: "dev_trial", status: "cancelled" } });
  return reconcileEntitlement(workspaceId);
}

/** Pauses every active task when no entitlement remains (idempotent; safe to call on any read). */
export async function reconcileEntitlement(workspaceId: string) {
  if (await effectiveEntitlement(workspaceId)) return { paused: 0 };
  const active = await db.select().from(schema.cbActivation).where(and(eq(schema.cbActivation.workspaceId, workspaceId), eq(schema.cbActivation.state, "active")));
  for (const a of active) {
    const [item] = await db.select().from(schema.cbInstalledItem).where(and(eq(schema.cbInstalledItem.installationId, a.installationId), eq(schema.cbInstalledItem.taskId, a.taskId), eq(schema.cbInstalledItem.kind, "flow")));
    if (item) await unpublishFlow(item.refId);
    await db.update(schema.cbActivation).set({ state: "paused", reason: "entitlement_lapsed", updatedAt: new Date() }).where(and(eq(schema.cbActivation.id, a.id), eq(schema.cbActivation.state, "active")));
  }
  return { paused: active.length };
}

/** Worker tick: reconciles every workspace that has an active Company Builder task. Returns the number paused. */
export async function reconcileActiveEntitlements() {
  const rows = await db.selectDistinct({ ws: schema.cbActivation.workspaceId }).from(schema.cbActivation).where(eq(schema.cbActivation.state, "active"));
  let paused = 0;
  for (const r of rows) paused += (await reconcileEntitlement(r.ws)).paused;
  return paused;
}
