import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AgentToolSpec } from "@/db/schema";
import { isRouteRef } from "@/ai/hub/routing";
import type { CompanyBlueprint, TaskPlan } from "@/company-builder/model";
import { compileTask } from "@/company-builder/validate";
import type { Locale } from "@/i18n/config";
import { createTranslator, type Translator } from "@/i18n/translate";
import type { MessageKey } from "@/i18n/types";
import type { CurrentUser } from "@/server/access";
import { DEFAULT_LIMITS } from "@/server/agents";
import { audit, userActor } from "@/server/audit";
import { canonicalJson, sha256Hex } from "@/server/crypto";
import { testFeaturesEnabled } from "@/server/faults";
import { HttpError, notFound } from "@/server/http";
import { insertRetainedFile } from "@/server/retained-files";
import { admitKnowledgeIndex } from "@/server/knowledge-admission";
import { requireBlueprint } from "./blueprints";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * InstallationJob: creates REAL draft flows / knowledge / agents for one approved blueprint version.
 *
 * Idempotent and resumable: the install key is unique per workspace + blueprint version; every created item is
 * committed in the same transaction as its step record (cb_installed_item, unique per installation+task+kind), under a
 * per-installation advisory lock. A refresh, double click or crash mid-way therefore never duplicates a flow/agent:
 * re-running skips what exists and continues with the rest. Unchanged tasks from an earlier blueprint version of the
 * same interview are REUSED (never recreated); changed tasks get a new draft and the earlier one — possibly edited by
 * a person — is left untouched. Nothing here schedules, publishes, charges or runs anything.
 */

export interface InstallOptions {
  locale: Locale;
  /** TEST ONLY (FLOWLINE_ENV=test): throw after creating this many items, to simulate a crash mid-installation. */
  crashAfterItems?: number;
}

const tKey = (t: Translator, key: string, fallback: string) => (t.has(key) ? t(key as MessageKey) : fallback);

export function installKey(workspaceId: string, blueprintId: string) {
  return `${workspaceId}:${blueprintId}`;
}

async function lockInstallation(tx: Tx, installationId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cb-install:${installationId}`}))`);
}

async function existingItem(tx: Tx, installationId: string, taskId: string, kind: string) {
  const [row] = await tx
    .select()
    .from(schema.cbInstalledItem)
    .where(and(eq(schema.cbInstalledItem.installationId, installationId), eq(schema.cbInstalledItem.taskId, taskId), eq(schema.cbInstalledItem.kind, kind)));
  return row ?? null;
}

/** An item with the same definition created by an EARLIER installation of the same interview, still present. */
async function reusableItem(tx: Tx, sessionId: string, installationId: string, taskId: string, kind: string, hash: string) {
  const rows = await tx
    .select({ item: schema.cbInstalledItem })
    .from(schema.cbInstalledItem)
    .innerJoin(schema.cbInstallation, eq(schema.cbInstallation.id, schema.cbInstalledItem.installationId))
    .innerJoin(schema.cbBlueprint, eq(schema.cbBlueprint.id, schema.cbInstallation.blueprintId))
    .where(and(eq(schema.cbBlueprint.sessionId, sessionId), ne(schema.cbInstalledItem.installationId, installationId), eq(schema.cbInstalledItem.taskId, taskId), eq(schema.cbInstalledItem.kind, kind), eq(schema.cbInstalledItem.definitionHash, hash)))
    .orderBy(desc(schema.cbInstalledItem.createdAt))
    .limit(5);
  for (const { item } of rows) {
    if (kind === "flow") {
      const [f] = await tx.select({ id: schema.flow.id }).from(schema.flow).where(and(eq(schema.flow.id, item.refId), isNull(schema.flow.deletedAt)));
      if (f) return item;
    } else if (kind === "agent") {
      const [a] = await tx.select({ id: schema.agent.id }).from(schema.agent).where(and(eq(schema.agent.id, item.refId), isNull(schema.agent.deletedAt)));
      if (a) return item;
    } else {
      const [k] = await tx.select({ id: schema.knowledgeSource.id }).from(schema.knowledgeSource).where(and(eq(schema.knowledgeSource.id, item.refId), isNull(schema.knowledgeSource.deletedAt)));
      if (k) return item;
    }
  }
  return null;
}

function flowName(t: Translator, task: TaskPlan, bp: CompanyBlueprint) {
  const base = tKey(t, `companyBuilder.task.${task.id}.name`, task.id);
  return (bp.clientName ? `${base} — ${bp.clientName}` : base).slice(0, 80);
}

export async function install(user: CurrentUser, workspaceId: string, blueprintId: string, opts: InstallOptions) {
  const bpRow = await requireBlueprint(workspaceId, blueprintId);
  if (bpRow.status !== "approved") throw new HttpError(409, "BLUEPRINT_NOT_APPROVED", "Review and approve the plan before creating drafts");
  const bp = bpRow.body as CompanyBlueprint;
  const key = installKey(workspaceId, blueprintId);
  await db.insert(schema.cbInstallation).values({ workspaceId, blueprintId, installKey: key, createdBy: user.id }).onConflictDoNothing({ target: schema.cbInstallation.installKey });
  const [inst] = await db.select().from(schema.cbInstallation).where(eq(schema.cbInstallation.installKey, key));
  if (inst!.status === "installed") return { installation: inst!, created: 0, reused: 0 };
  if (inst!.status === "cancelled") throw new HttpError(409, "INSTALLATION_CANCELLED", "This installation was cancelled");
  if (inst!.status === "failed") {
    const [restarted] = await db
      .update(schema.cbInstallation)
      .set({ status: "installing", error: null, updatedAt: new Date() })
      .where(and(eq(schema.cbInstallation.id, inst!.id), eq(schema.cbInstallation.status, "failed")))
      .returning();
    if (!restarted) {
      const [current] = await db.select().from(schema.cbInstallation).where(eq(schema.cbInstallation.id, inst!.id));
      if (current?.status === "cancelled") throw new HttpError(409, "INSTALLATION_CANCELLED", "This installation was cancelled");
      if (current?.status === "installed") return { installation: current, created: 0, reused: 0 };
    }
  }

  const t = createTranslator(opts.locale);
  let created = 0;
  let reused = 0;
  const crash = testFeaturesEnabled() ? opts.crashAfterItems : undefined;
  const step = async (task: TaskPlan, kind: "flow" | "agent" | "knowledge", hash: string, make: (tx: Tx) => Promise<{ refId: string; baseRevision: number | null }>) => {
    const outcome = await db.transaction(async (tx) => {
      await lockInstallation(tx, inst!.id);
      const [cur] = await tx.select({ status: schema.cbInstallation.status }).from(schema.cbInstallation).where(eq(schema.cbInstallation.id, inst!.id));
      if (cur?.status === "cancelled") throw new HttpError(409, "INSTALLATION_CANCELLED", "This installation was cancelled");
      const done = await existingItem(tx, inst!.id, task.id, kind);
      if (done) return { item: done, fresh: false };
      const prior = await reusableItem(tx, bp.sessionId, inst!.id, task.id, kind, hash);
      const made = prior ? { refId: prior.refId, baseRevision: prior.baseRevision } : await make(tx);
      const [item] = await tx
        .insert(schema.cbInstalledItem)
        .values({ installationId: inst!.id, workspaceId, taskId: task.id, kind, refId: made.refId, packId: task.packId, packVersion: task.packVersion, definitionHash: hash, baseRevision: made.baseRevision, origin: prior ? "reused" : "created" })
        .returning();
      return { item: item!, fresh: true, reusedPrior: Boolean(prior) };
    });
    if (outcome.fresh) {
      if (outcome.reusedPrior) reused++;
      else created++;
      if (crash != null && created + reused >= crash) throw new Error("TEST_CRASH_DURING_INSTALL");
    }
    return outcome.item;
  };

  try {
    for (const task of bp.tasks.filter((x) => x.availability === "operational")) {
      if (task.kind === "workflow") {
        const { graph, issues } = compileTask(task, (nodeId) => tKey(t, `companyBuilder.node.${task.packId}.${nodeId}`, nodeId).slice(0, 80));
        if (!graph) throw new HttpError(422, "TASK_COMPILE_FAILED", "A task failed validation", issues);
        const hash = sha256Hex(canonicalJson({ graph, pack: `${task.packId}@${task.packVersion}` }));
        await step(task, "flow", hash, async (tx) => {
          const [f] = await tx
            .insert(schema.flow)
            .values({ workspaceId, name: flowName(t, task, bp), graph, templateId: `cb:${task.packId}@${task.packVersion}`, createdBy: user.id, updatedBy: user.id })
            .returning({ id: schema.flow.id, revision: schema.flow.revision });
          return { refId: f!.id, baseRevision: f!.revision };
        });
      } else {
        // Bounded agent: knowledge_search over ITS OWN approved knowledge only (role-scoped ACL), no workflow tools.
        const info = String(task.params.approvedInfo ?? "").trim();
        const knowledge = await step(task, "knowledge", sha256Hex(`knowledge:${info}`), async (tx) => {
          const bytes = Buffer.from(info, "utf8");
          await admitKnowledgeIndex(tx, workspaceId);
          const name = tKey(t, "companyBuilder.knowledgeName", "Approved customer answers").slice(0, 120);
          const file = await insertRetainedFile(tx, { workspaceId, name, mime: "text/plain", data: bytes, createdBy: user.id });
          const [src] = await tx.insert(schema.knowledgeSource).values({ workspaceId, name, kind: "text", fileId: file!.id, mime: "text/plain", size: bytes.length, status: "pending", createdBy: user.id }).returning({ id: schema.knowledgeSource.id });
          await tx.execute(sql`select pg_notify('flowline_runs', 'knowledge')`);
          return { refId: src!.id, baseRevision: null };
        });
        const instructions = tKey(t, "companyBuilder.agentInstructions", "Answer only from the approved knowledge. If it does not cover the question, say a person will reply.");
        const tools: AgentToolSpec[] = [{ tool: "knowledge_search", permission: "allow" }];
        const hash = sha256Hex(canonicalJson({ instructions, tools, knowledge: knowledge.refId }));
        await step(task, "agent", hash, async (tx) => {
          const [ws] = await tx.select({ route: schema.workspace.aiDefaultRoute }).from(schema.workspace).where(eq(schema.workspace.id, workspaceId));
          const [a] = await tx
            .insert(schema.agent)
            .values({ workspaceId, name: flowName(t, task, bp), description: tKey(t, `companyBuilder.task.${task.id}.does`, "").slice(0, 500), createdBy: user.id })
            .returning({ id: schema.agent.id });
          const [v] = await tx
            .insert(schema.agentVersion)
            .values({ agentId: a!.id, version: 1, instructions, route: isRouteRef(ws?.route) ? ws.route : null, tools, knowledgeSourceIds: [knowledge.refId], limits: { ...DEFAULT_LIMITS, maxSteps: 4, maxToolCalls: 3 }, createdBy: user.id })
            .returning({ id: schema.agentVersion.id });
          await tx.update(schema.agent).set({ currentVersionId: v!.id }).where(eq(schema.agent.id, a!.id));
          await audit(tx, { workspaceId, actor: userActor(user), action: "agent.version_created", targetType: "agent", targetId: a!.id, data: { version: 1, tools, source: "company_builder" } });
          return { refId: a!.id, baseRevision: null };
        });
      }
    }
  } catch (e) {
    const code = e instanceof HttpError ? e.code : "INSTALL_FAILED";
    await db.update(schema.cbInstallation).set({ status: code === "INSTALLATION_CANCELLED" ? "cancelled" : "failed", error: { code }, updatedAt: new Date() }).where(and(eq(schema.cbInstallation.id, inst!.id), inArray(schema.cbInstallation.status, ["installing", "failed"])));
    throw e;
  }
  const done = await db.transaction(async (tx) => {
    await lockInstallation(tx, inst!.id);
    const [row] = await tx
      .update(schema.cbInstallation)
      .set({ status: "installed", updatedAt: new Date(), finishedAt: new Date() })
      .where(and(eq(schema.cbInstallation.id, inst!.id), eq(schema.cbInstallation.status, "installing")))
      .returning();
    if (!row) {
      const [current] = await tx.select().from(schema.cbInstallation).where(eq(schema.cbInstallation.id, inst!.id));
      if (current?.status === "cancelled") throw new HttpError(409, "INSTALLATION_CANCELLED", "This installation was cancelled");
      return current;
    }
    return row;
  });
  if (!done) throw new HttpError(409, "INSTALLATION_FINISHED", "The installation is no longer running");
  await audit(db, { workspaceId, actor: userActor(user), action: "company_builder.installed", targetType: "cb_installation", targetId: inst!.id, data: { blueprintVersion: bpRow.version, created, reused } });
  return { installation: done ?? inst!, created, reused };
}

/** Cancels an installation that is still running: already-created drafts stay (listed), nothing else is created. */
export async function cancelInstallation(workspaceId: string, installationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(installationId)) throw notFound("Installation not found");
  const row = await db.transaction(async (tx) => {
    await lockInstallation(tx, installationId);
    const [cancelled] = await tx
      .update(schema.cbInstallation)
      .set({ status: "cancelled", updatedAt: new Date(), finishedAt: new Date() })
      .where(and(eq(schema.cbInstallation.id, installationId), eq(schema.cbInstallation.workspaceId, workspaceId), inArray(schema.cbInstallation.status, ["installing", "failed"])))
      .returning();
    return cancelled;
  });
  if (!row) {
    const [exists] = await db.select({ status: schema.cbInstallation.status }).from(schema.cbInstallation).where(and(eq(schema.cbInstallation.id, installationId), eq(schema.cbInstallation.workspaceId, workspaceId)));
    if (!exists) throw notFound("Installation not found");
    throw new HttpError(409, "INSTALLATION_FINISHED", `This installation is already ${exists.status}`);
  }
  return row;
}

export async function requireInstallation(workspaceId: string, installationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(installationId)) throw notFound("Installation not found");
  const [row] = await db.select().from(schema.cbInstallation).where(and(eq(schema.cbInstallation.id, installationId), eq(schema.cbInstallation.workspaceId, workspaceId)));
  if (!row) throw notFound("Installation not found");
  return row;
}

export async function installedItems(installationId: string) {
  return db.select().from(schema.cbInstalledItem).where(eq(schema.cbInstalledItem.installationId, installationId));
}
