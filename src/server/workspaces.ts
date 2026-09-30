import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { isTimeZone } from "@/lib/timezones";
import { db, schema } from "@/db";
import type { CurrentUser } from "./access";
import { HttpError } from "./http";

export function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "workspace";
}

export async function createWorkspace(user: CurrentUser, name: string) {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 60) throw new HttpError(400, "VALIDATION", "Workspace name must be 2–60 characters");
  const base = slugify(clean);
  // Two concurrent creates can pick the same free slug; the unique index rejects one — retry it.
  for (let attempt = 0; ; attempt++) {
    try {
      return await insertWorkspace(user, clean, base);
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
      if (code !== "23505" || attempt >= 4) throw e;
    }
  }
}

async function insertWorkspace(user: CurrentUser, clean: string, base: string) {
  return db.transaction(async (tx) => {
    let slug = base;
    for (let i = 2; ; i++) {
      const [taken] = await tx.select({ id: schema.workspace.id }).from(schema.workspace).where(eq(schema.workspace.slug, slug));
      if (!taken) break;
      slug = `${base}-${i}`;
    }
    const [ws] = await tx.insert(schema.workspace).values({ name: clean, slug, createdBy: user.id }).returning();
    await tx.insert(schema.workspaceMember).values({ workspaceId: ws.id, userId: user.id, role: "owner" });
    await tx
      .insert(schema.userSettings)
      .values({ userId: user.id, lastWorkspaceId: ws.id })
      .onConflictDoUpdate({ target: schema.userSettings.userId, set: { lastWorkspaceId: ws.id } });
    return ws;
  });
}

export async function listWorkspaces(user: CurrentUser) {
  return db
    .select({ id: schema.workspace.id, name: schema.workspace.name, slug: schema.workspace.slug, role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceMember.workspaceId))
    .where(eq(schema.workspaceMember.userId, user.id))
    .orderBy(schema.workspace.createdAt);
}

export async function getUserSettings(userId: string) {
  const [row] = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId));
  return row ?? null;
}

export async function listMembers(workspaceId: string) {
  return db
    .select({ userId: schema.user.id, name: schema.user.name, email: schema.user.email, role: schema.workspaceMember.role, joinedAt: schema.workspaceMember.createdAt })
    .from(schema.workspaceMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
    .where(eq(schema.workspaceMember.workspaceId, workspaceId))
    .orderBy(schema.workspaceMember.createdAt);
}

/** Dashboard numbers — all computed from real rows; nothing is estimated. */
export async function workspaceOverview(workspaceId: string) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [flowCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.flow)
    .where(and(eq(schema.flow.workspaceId, workspaceId), isNull(schema.flow.deletedAt)));
  const [runs24] = await db
    .select({
      total: sql<number>`count(*)::int`,
      succeeded: sql<number>`count(*) filter (where ${schema.run.status} = 'succeeded')::int`,
      failed: sql<number>`count(*) filter (where ${schema.run.status} = 'failed')::int`,
      active: sql<number>`count(*) filter (where ${schema.run.status} in ('queued','running'))::int`,
      flowsRun: sql<number>`count(distinct ${schema.run.flowId})::int`,
    })
    .from(schema.run)
    .where(and(eq(schema.run.workspaceId, workspaceId), gte(schema.run.createdAt, since)));
  const finished = runs24.succeeded + runs24.failed;
  const recent = await db
    .select({
      id: schema.run.id,
      number: schema.run.number,
      status: schema.run.status,
      flowId: schema.run.flowId,
      flowName: schema.flow.name,
      createdAt: schema.run.createdAt,
      durationMs: schema.run.durationMs,
      error: schema.run.error,
      steps: sql<number>`(select count(*)::int from ${schema.runStep} s where s.run_id = "run"."id" and s.status <> 'skipped')`,
      stepsDone: sql<number>`(select count(*)::int from ${schema.runStep} s where s.run_id = "run"."id" and s.status in ('succeeded','reused'))`,
    })
    .from(schema.run)
    .innerJoin(schema.flow, eq(schema.flow.id, schema.run.flowId))
    .where(eq(schema.run.workspaceId, workspaceId))
    .orderBy(desc(schema.run.createdAt))
    .limit(6);
  const [{ approvals }] = await db
    .select({ approvals: sql<number>`count(*)::int` })
    .from(schema.approval)
    .where(and(eq(schema.approval.workspaceId, workspaceId), eq(schema.approval.status, "pending"), sql`${schema.approval.expiresAt} > now()`));
  // Agent requests are decided on the agent's run, not in Run history: list where each one waits (oldest first).
  const agentApprovals = await db
    .select({ agentId: schema.agentRun.agentId, agentRunId: schema.approval.agentRunId, agentName: schema.agent.name })
    .from(schema.approval)
    .innerJoin(schema.agentRun, eq(schema.agentRun.id, schema.approval.agentRunId))
    .innerJoin(schema.agent, eq(schema.agent.id, schema.agentRun.agentId))
    .where(and(eq(schema.approval.workspaceId, workspaceId), eq(schema.approval.status, "pending"), sql`${schema.approval.expiresAt} > now()`))
    .orderBy(schema.approval.requestedAt)
    .limit(20);
  const unhealthy = await db
    .select({ id: schema.connection.id, provider: schema.connection.provider, label: schema.connection.label, status: schema.connection.status })
    .from(schema.connection)
    .where(and(eq(schema.connection.workspaceId, workspaceId), sql`${schema.connection.status} <> 'active'`));
  const [{ paused }] = await db
    .select({ paused: sql<number>`count(*)::int` })
    .from(schema.flow)
    .where(and(eq(schema.flow.workspaceId, workspaceId), isNull(schema.flow.deletedAt), sql`${schema.flow.pausedReason} is not null`));
  return {
    pendingApprovals: approvals,
    pendingAgentApprovals: agentApprovals,
    unhealthyConnections: unhealthy,
    pausedFlows: paused,
    flows: flowCount.n,
    flowsRun24h: runs24.flowsRun,
    runs24h: runs24.total,
    successRate24h: finished > 0 ? runs24.succeeded / finished : null,
    failed24h: runs24.failed,
    activeRuns: runs24.active,
    recent,
  };
}

export interface WorkspaceLimitsPatch {
  /** Monthly budget in currency units (null clears the limit). */
  monthlyBudget?: number | null;
  maxConcurrentRuns?: number;
  maxQueuedRuns?: number;
  prices?: Record<string, { inputPerMTok?: number; outputPerMTok?: number; perCall?: number }>;
  maxMonthlyExecutions?: number | null;
  aiProvider?: "ollama" | "anthropic" | null;
  aiModel?: string | null;
}

export async function updateWorkspace(workspaceId: string, patch: { name?: string; timezone?: string } & WorkspaceLimitsPatch) {
  const set: Partial<typeof schema.workspace.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const clean = patch.name.trim();
    if (clean.length < 2 || clean.length > 60) throw new HttpError(400, "VALIDATION", "Workspace name must be 2–60 characters");
    set.name = clean;
  }
  if (patch.timezone !== undefined) {
    if (!isTimeZone(patch.timezone)) {
      throw new HttpError(400, "VALIDATION", "Unknown time zone");
    }
    set.timezone = patch.timezone;
  }
  if (patch.aiProvider !== undefined) {
    // Legacy pre-hub columns: they can only be CLEARED. Server-configured providers no longer exist (AI runs on
    // workspace connections: Settings → AI Providers), and a local runtime is never accepted.
    if (patch.aiProvider === "ollama") throw new HttpError(400, "AI_LOCAL_MIGRATION_REQUIRED", "Local AI (Ollama) is no longer supported. Connect a cloud provider in Settings → AI Providers.");
    if (patch.aiProvider !== null) throw new HttpError(400, "AI_PROVIDER_UNAVAILABLE", "Server-configured AI providers were replaced by AI connections. Connect a provider in Settings → AI Providers.");
    set.aiProvider = patch.aiProvider;
    set.aiModel = patch.aiProvider === null ? null : patch.aiModel?.trim() || null;
  }
  if (patch.maxMonthlyExecutions !== undefined) {
    if (patch.maxMonthlyExecutions !== null && (!Number.isInteger(patch.maxMonthlyExecutions) || patch.maxMonthlyExecutions < 1 || patch.maxMonthlyExecutions > 10_000_000)) {
      throw new HttpError(400, "VALIDATION", "Monthly executions must be 1–10,000,000");
    }
    set.maxMonthlyExecutions = patch.maxMonthlyExecutions;
  }
  if (patch.monthlyBudget !== undefined) {
    if (patch.monthlyBudget !== null && !(patch.monthlyBudget >= 0 && patch.monthlyBudget <= 1_000_000)) throw new HttpError(400, "VALIDATION", "Budget must be between 0 and 1,000,000");
    set.monthlyBudgetMicros = patch.monthlyBudget === null ? null : Math.round(patch.monthlyBudget * 1_000_000);
  }
  if (patch.maxConcurrentRuns !== undefined) {
    if (!Number.isInteger(patch.maxConcurrentRuns) || patch.maxConcurrentRuns < 1 || patch.maxConcurrentRuns > 20) throw new HttpError(400, "VALIDATION", "Concurrent runs must be 1–20");
    set.maxConcurrentRuns = patch.maxConcurrentRuns;
  }
  if (patch.maxQueuedRuns !== undefined) {
    if (!Number.isInteger(patch.maxQueuedRuns) || patch.maxQueuedRuns < 1 || patch.maxQueuedRuns > 1000) throw new HttpError(400, "VALIDATION", "Queued runs must be 1–1000");
    set.maxQueuedRuns = patch.maxQueuedRuns;
  }
  if (patch.prices !== undefined) {
    const entries = Object.entries(patch.prices);
    if (entries.length > 50) throw new HttpError(400, "VALIDATION", "At most 50 price entries");
    const out: Record<string, { inputPerMTokMicros?: number; outputPerMTokMicros?: number; perCallMicros?: number }> = {};
    for (const [k, v] of entries) {
      if (!/^(ai|action|http|run):[A-Za-z0-9_.:/*-]{1,80}$/.test(k)) throw new HttpError(400, "VALIDATION", `Invalid price key "${k}"`);
      const m = (n?: number) => (n === undefined ? undefined : Math.round(Math.max(0, Math.min(n, 10_000)) * 1_000_000));
      out[k] = { inputPerMTokMicros: m(v.inputPerMTok), outputPerMTokMicros: m(v.outputPerMTok), perCallMicros: m(v.perCall) };
    }
    set.prices = out;
  }
  const [ws] = await db.update(schema.workspace).set(set).where(eq(schema.workspace.id, workspaceId)).returning();
  return ws;
}
