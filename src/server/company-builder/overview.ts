import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isRouteRef } from "@/ai/hub/routing";
import { taskStatus } from "@/company-builder/lifecycle";
import type { CompanyBlueprint, TrialVerdict } from "@/company-builder/model";
import { getPack } from "@/company-builder/packs";
import { latestBlueprint, listBlueprints } from "./blueprints";
import { billingStatus, devTrialAllowed, effectiveEntitlement, reconcileEntitlement } from "./entitlement";
import { installedItems } from "./install";
import { listReviewItems, sampleOutbox } from "./reviews";
import { requireSession, sessionView } from "./sessions";
import { latestTrials, refreshTrial, trialOutput } from "./trials";

/** Everything the Company Builder page shows for one interview, computed on the server (the UI holds no rules). */
export async function sessionOverview(workspaceId: string, sessionId: string, cursor: string | null) {
  const row = await requireSession(workspaceId, sessionId);
  await reconcileEntitlement(workspaceId);
  const bp = await latestBlueprint(sessionId);
  const versions = await listBlueprints(sessionId);
  // The installation shown: the latest plan's, else the most recent INSTALLED one of this interview (a newer plan
  // version — e.g. a CLI proposal awaiting review — never hides tasks that are installed or active).
  const [latestInst] = bp ? await db.select().from(schema.cbInstallation).where(eq(schema.cbInstallation.blueprintId, bp.id)).orderBy(desc(schema.cbInstallation.createdAt)).limit(1) : [];
  const [liveInst] = latestInst
    ? []
    : await db
        .select({ inst: schema.cbInstallation })
        .from(schema.cbInstallation)
        .innerJoin(schema.cbBlueprint, eq(schema.cbBlueprint.id, schema.cbInstallation.blueprintId))
        .where(and(eq(schema.cbBlueprint.sessionId, sessionId), eq(schema.cbInstallation.status, "installed")))
        .orderBy(desc(schema.cbInstallation.createdAt))
        .limit(1);
  const inst = latestInst ?? liveInst?.inst;
  const [instBp] = inst && inst.blueprintId !== bp?.id ? await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.id, inst.blueprintId)) : [];
  const items = inst ? await installedItems(inst.id) : [];
  const flowIds = items.filter((i) => i.kind === "flow").map((i) => i.refId);
  const agentIds = items.filter((i) => i.kind === "agent").map((i) => i.refId);
  const flows = flowIds.length ? await db.select({ id: schema.flow.id, name: schema.flow.name, revision: schema.flow.revision, deletedAt: schema.flow.deletedAt, publishedVersionId: schema.flow.publishedVersionId }).from(schema.flow).where(inArray(schema.flow.id, flowIds)) : [];
  const agents = agentIds.length ? await db.select({ id: schema.agent.id, name: schema.agent.name, deletedAt: schema.agent.deletedAt }).from(schema.agent).where(inArray(schema.agent.id, agentIds)) : [];
  const trials = inst ? await latestTrials(inst.id) : new Map();
  for (const [k, tr] of trials) if (tr.status === "running") trials.set(k, await refreshTrial(workspaceId, tr.id));
  const activations = inst ? await db.select().from(schema.cbActivation).where(eq(schema.cbActivation.installationId, inst.id)) : [];
  const ent = await effectiveEntitlement(workspaceId);
  const [devTrial] = await db.select().from(schema.cbEntitlement).where(eq(schema.cbEntitlement.workspaceId, workspaceId));
  const reviews = (await listReviewItems(workspaceId)).filter((r) => !inst || r.installationId === inst.id);
  const body = bp ? (bp.body as CompanyBlueprint) : null;
  const taskBody = instBp ? (instBp.body as CompanyBlueprint) : body;
  // The AI connection status is the workspace's CURRENT default route (the plan only recorded it as needed).
  const [ws] = await db.select({ route: schema.workspace.aiDefaultRoute }).from(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  const aiReady = isRouteRef(ws?.route);

  const tasks = await Promise.all(
    (taskBody?.tasks ?? []).map(async (planned) => {
      const task = { ...planned, connections: planned.connections.map((c) => (c.provider === "ai" ? { ...c, status: aiReady ? ("connected" as const) : ("missing" as const) } : c)) };
      const own = items.filter((i) => i.taskId === task.id);
      const flowItem = own.find((i) => i.kind === "flow");
      const agentItem = own.find((i) => i.kind === "agent");
      const flow = flowItem ? flows.find((f) => f.id === flowItem.refId) : undefined;
      const agent = agentItem ? agents.find((a) => a.id === agentItem.refId) : undefined;
      const trial = trials.get(task.id) ?? null;
      const verdict = (trial?.verdict ?? null) as TrialVerdict | null;
      const act = activations.find((a) => a.taskId === task.id);
      const installed = inst?.status === "installed" && Boolean(flowItem || agentItem);
      const status = taskStatus({ task, installed, verdict, activation: (act?.state as "active" | "paused" | "approval_required" | "failed" | undefined) ?? null });
      const run = trial ? await trialOutput(trial) : null;
      const pack = getPack(task.packId, task.packVersion);
      return {
        task,
        status,
        capabilities: pack?.capabilities ?? [],
        flow: flow && !flow.deletedAt ? { id: flow.id, name: flow.name, edited: flowItem?.baseRevision != null && flow.revision > flowItem.baseRevision, published: Boolean(flow.publishedVersionId), origin: flowItem!.origin } : null,
        agent: agent && !agent.deletedAt ? { id: agent.id, name: agent.name, origin: agentItem!.origin } : null,
        trial: trial ? { id: trial.id, status: trial.status, provenance: trial.provenance, verdict, runId: trial.runId, runNumber: run?.number ?? null, runStatus: run?.status ?? null, output: trial.status === "completed" ? (run?.output ?? null) : null } : null,
        activation: act ? { state: act.state, reason: act.reason } : null,
      };
    }),
  );

  return {
    session: sessionView(row, cursor),
    blueprint: bp ? { id: bp.id, version: bp.version, status: bp.status, generator: bp.generator, diff: bp.diff, body, createdAt: bp.createdAt } : null,
    versions,
    installation: inst ? { id: inst.id, status: inst.status, error: inst.error, blueprintId: inst.blueprintId, blueprintVersion: instBp?.version ?? bp?.version ?? null } : null,
    tasks,
    reviews,
    outbox: await sampleOutbox(workspaceId),
    entitlement: { effective: ent, devTrial: devTrial ? { status: devTrial.status, expiresAt: devTrial.expiresAt } : null, devTrialAllowed: devTrialAllowed(), billing: await billingStatus(workspaceId) },
  };
}

export async function workspaceSessions(workspaceId: string) {
  return db
    .select({ id: schema.cbSession.id, status: schema.cbSession.status, updatedAt: schema.cbSession.updatedAt, profileVersion: schema.cbSession.profileVersion })
    .from(schema.cbSession)
    .where(and(eq(schema.cbSession.workspaceId, workspaceId)))
    .orderBy(desc(schema.cbSession.updatedAt))
    .limit(20);
}
