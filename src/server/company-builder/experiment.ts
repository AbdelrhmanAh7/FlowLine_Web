import { and, asc, desc, eq, inArray, isNull, notLike, or } from "drizzle-orm";
import type { z } from "zod";
import { db, schema } from "@/db";
import { clientEventBody, computeMetrics, effortBody } from "@/company-builder/experiment-metrics";
import type { CompanyBlueprint, TrialVerdict } from "@/company-builder/model";
import type { CurrentUser } from "@/server/access";
import { notFound } from "@/server/http";
import { requireSession, stateOf } from "./sessions";

/**
 * Experiment mode (FLOWLINE_CB_EXPERIMENT=on). Measures one interview from records Flowline already keeps (answers,
 * plan versions, trials, runs, CLI jobs) plus three small event kinds the product can't infer: active time and help
 * opened (client), and owner-logged support / external-onboarding minutes. Nothing sensitive is stored: event data is
 * a number or an enum id. Metric definitions are in docs/company-builder/COMPETITIVE_TEST_PROTOCOL.md §Metrics.
 * The 30% setup-time / 25% cost targets are RESEARCH targets, never product claims.
 */

export { clientEventBody, effortBody };

/** The client sends a slice every 30 s; anything faster is ignored. */
export const ACTIVE_SLICE_MIN_GAP_S = 25;

export const experimentEnabled = () => process.env.FLOWLINE_CB_EXPERIMENT === "on";

export function assertExperimentEnabled() {
  if (!experimentEnabled()) throw notFound("Not found");
}

export async function recordClientEvent(user: CurrentUser, workspaceId: string, sessionId: string, e: z.infer<typeof clientEventBody>) {
  assertExperimentEnabled();
  await requireSession(workspaceId, sessionId);
  if (e.kind === "active_time") {
    // At most one active-time slice per person per ACTIVE_SLICE_MIN_GAP_S: repeated calls can't inflate the metric.
    const [last] = await db
      .select({ at: schema.cbExperimentEvent.at })
      .from(schema.cbExperimentEvent)
      .where(and(eq(schema.cbExperimentEvent.sessionId, sessionId), eq(schema.cbExperimentEvent.kind, "active_time"), eq(schema.cbExperimentEvent.userId, user.id)))
      .orderBy(desc(schema.cbExperimentEvent.at))
      .limit(1);
    if (last && Date.now() - last.at.getTime() < ACTIVE_SLICE_MIN_GAP_S * 1000) return { stored: false };
  }
  const data = e.kind === "active_time" ? { seconds: e.seconds } : { topic: e.topic };
  await db.insert(schema.cbExperimentEvent).values({ workspaceId, sessionId, kind: e.kind, data, userId: user.id });
  return { stored: true };
}

export async function recordEffort(user: CurrentUser, workspaceId: string, sessionId: string, e: z.infer<typeof effortBody>) {
  assertExperimentEnabled();
  await requireSession(workspaceId, sessionId);
  await db.insert(schema.cbExperimentEvent).values({ workspaceId, sessionId, kind: e.kind === "support" ? "support_minutes" : "external_delay_minutes", data: { minutes: e.minutes }, userId: user.id });
}

export async function experimentMetrics(workspaceId: string, sessionId: string) {
  assertExperimentEnabled();
  const row = await requireSession(workspaceId, sessionId);
  const plans = await db.select({ id: schema.cbBlueprint.id, createdAt: schema.cbBlueprint.createdAt, body: schema.cbBlueprint.body }).from(schema.cbBlueprint).where(eq(schema.cbBlueprint.sessionId, sessionId)).orderBy(asc(schema.cbBlueprint.createdAt));
  const insts = plans.length ? await db.select({ id: schema.cbInstallation.id }).from(schema.cbInstallation).where(inArray(schema.cbInstallation.blueprintId, plans.map((p) => p.id))) : [];
  const trials = insts.length ? await db.select().from(schema.cbTrial).where(inArray(schema.cbTrial.installationId, insts.map((x) => x.id))) : [];
  const flows = insts.length ? await db.select({ refId: schema.cbInstalledItem.refId }).from(schema.cbInstalledItem).where(and(inArray(schema.cbInstalledItem.installationId, insts.map((x) => x.id)), eq(schema.cbInstalledItem.kind, "flow"))) : [];
  const laterRuns = flows.length ? await db.select({ at: schema.run.createdAt }).from(schema.run).where(and(inArray(schema.run.flowId, flows.map((f) => f.refId)), or(isNull(schema.run.triggerRef), notLike(schema.run.triggerRef, "cb-trial:%")))) : [];
  const events = await db.select({ kind: schema.cbExperimentEvent.kind, data: schema.cbExperimentEvent.data, at: schema.cbExperimentEvent.at }).from(schema.cbExperimentEvent).where(eq(schema.cbExperimentEvent.sessionId, sessionId));
  const jobs = await db.select({ reported: schema.cbCliJob.reported }).from(schema.cbCliJob).where(eq(schema.cbCliJob.sessionId, sessionId));
  return computeMetrics({
    sessionCreatedAt: row.createdAt,
    answers: stateOf(row).answers,
    plans: plans.map((p) => ({ createdAt: p.createdAt, body: p.body as CompanyBlueprint })),
    trials: trials.map((t) => ({ createdAt: t.createdAt, completedAt: t.completedAt, verdict: t.verdict as TrialVerdict | null, userVerdict: t.userVerdict, userVerdictAt: t.userVerdictAt })),
    events: events.map((e) => ({ kind: e.kind, data: e.data as Record<string, unknown>, at: e.at })),
    cliReportedUsd: jobs.map((j) => Number((j.reported as { totalCostUsd?: number } | null)?.totalCostUsd)).filter((n) => Number.isFinite(n) && n > 0),
    laterRuns: laterRuns.map((r) => r.at),
    now: new Date(),
  });
}
