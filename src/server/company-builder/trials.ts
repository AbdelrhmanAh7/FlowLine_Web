import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CompanyBlueprint, Provenance, TrialVerdict, UserVerdict } from "@/company-builder/model";
import { getPack } from "@/company-builder/packs";
import type { FlowGraph } from "@/engine/types";
import { validateGraph } from "@/engine/validate";
import type { CurrentUser } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { HttpError, notFound } from "@/server/http";
import { enqueueRunEx } from "@/server/runs";
import { requireInstallation } from "./install";
import { reviewerAllowed } from "./reviewer";

/**
 * Sample trials: the installed draft flow runs through the EXISTING engine/worker (manual trigger, sample input), and
 * the verdict is computed from the run's persisted output by the pack's business checks. Three results are kept
 * apart: structurally valid (the graph validates), ran without errors (the run succeeded) and matched the requested
 * outcome (the business checks pass). Exit status alone never counts as success.
 */

export const TRIAL_KEY = /^[A-Za-z0-9_-]{8,64}$/;

async function taskContext(workspaceId: string, installationId: string, taskId: string) {
  const inst = await requireInstallation(workspaceId, installationId);
  const [bp] = await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.id, inst.blueprintId));
  const body = bp!.body as CompanyBlueprint;
  const task = body.tasks.find((t) => t.id === taskId);
  if (!task) throw notFound("Task not found");
  const [item] = await db
    .select()
    .from(schema.cbInstalledItem)
    .where(and(eq(schema.cbInstalledItem.installationId, inst.id), eq(schema.cbInstalledItem.taskId, taskId), eq(schema.cbInstalledItem.kind, "flow")));
  return { inst, blueprint: bp!, body, task, item: item ?? null };
}

export interface StartTrialInput {
  trialKey: string;
  /** Optional synthetic input (defaults to the pack's labelled sample). Must be a JSON object. */
  input?: Record<string, unknown>;
  /** Set only by the CLI text-trial path: the text came from the owner's CLI job (provenance real_cli). */
  provenance?: Provenance;
}

export async function startTrial(user: CurrentUser, workspaceId: string, installationId: string, taskId: string, input: StartTrialInput) {
  if (!TRIAL_KEY.test(input.trialKey)) throw new HttpError(400, "VALIDATION", "Invalid trial key");
  // FB2-04: client-supplied input must carry a request OBJECT; anything else is refused before anything is enqueued.
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (input.input !== undefined && (!isObject(input.input) || !isObject(input.input.request))) throw new HttpError(400, "VALIDATION", "A trial input needs a request object");
  const { inst, task, item } = await taskContext(workspaceId, installationId, taskId);
  if (inst.status !== "installed") throw new HttpError(409, "NOT_INSTALLED", "Create the drafts before trying them");
  if (task.kind !== "workflow" || !item) throw new HttpError(409, "TRIAL_NOT_AVAILABLE", "This task has no workflow to try");
  const pack = getPack(task.packId, task.packVersion);
  if (!pack) throw new HttpError(409, "TRIAL_NOT_AVAILABLE", "This task has no tested pack");

  // Same click id → same trial (refresh / double click never starts a second run).
  const [existing] = await db
    .select()
    .from(schema.cbTrial)
    .where(and(eq(schema.cbTrial.installationId, inst.id), eq(schema.cbTrial.taskId, taskId), eq(schema.cbTrial.trialKey, input.trialKey)));
  if (existing) return { trial: existing, duplicate: true };

  // A sample trial must never reach an account: if a person added steps outside the pack's local nodes (HTTP, AI,
  // integrations, code), the draft is no longer a sample-safe definition and the trial is refused (use the editor).
  const [flow] = await db.select({ graph: schema.flow.graph, deletedAt: schema.flow.deletedAt }).from(schema.flow).where(eq(schema.flow.id, item.refId));
  if (!flow || flow.deletedAt) throw new HttpError(409, "TRIAL_NOT_AVAILABLE", "The draft was deleted");
  if ((flow.graph as FlowGraph).nodes.some((n) => !pack.nodeTypes.includes(n.type))) throw new HttpError(409, "TRIAL_NOT_SAMPLE_SAFE", "This draft now has steps that could reach real accounts — run it from the editor instead");
  // A sample trial is ALWAYS labelled sample (records go under a "sample:" key), whatever the client sent.
  const given = input.input;
  const sample = given ? { ...given, request: { ...(given.request as Record<string, unknown>), sample: true } } : (pack.sample(task.params) as Record<string, unknown>);
  const { run } = await enqueueRunEx(user, item.refId, { input: sample, triggerKind: "manual", triggerRef: `cb-trial:${input.trialKey}` });
  const [trial] = await db
    .insert(schema.cbTrial)
    .values({ workspaceId, installationId: inst.id, taskId, flowId: item.refId, runId: run.id, trialKey: input.trialKey, provenance: input.provenance ?? "deterministic_calculation", createdBy: user.id })
    .onConflictDoNothing()
    .returning();
  if (!trial) {
    const [again] = await db.select().from(schema.cbTrial).where(and(eq(schema.cbTrial.installationId, inst.id), eq(schema.cbTrial.taskId, taskId), eq(schema.cbTrial.trialKey, input.trialKey)));
    return { trial: again!, duplicate: true };
  }
  return { trial, duplicate: false };
}

/** Computes (once the run is terminal) and stores the verdict. Safe to call repeatedly. */
export async function refreshTrial(workspaceId: string, trialId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(trialId)) throw notFound("Trial not found");
  const [trial] = await db.select().from(schema.cbTrial).where(and(eq(schema.cbTrial.id, trialId), eq(schema.cbTrial.workspaceId, workspaceId)));
  if (!trial) throw notFound("Trial not found");
  if (trial.status === "completed" || !trial.runId) return trial;
  const [run] = await db.select().from(schema.run).where(eq(schema.run.id, trial.runId));
  if (!run || !["succeeded", "failed", "cancelled", "waiting_approval"].includes(run.status)) return trial;
  const { task } = await taskContext(workspaceId, trial.installationId, trial.taskId);
  const pack = getPack(task.packId, task.packVersion)!;
  const [version] = await db.select({ graph: schema.flowVersion.graph }).from(schema.flowVersion).where(eq(schema.flowVersion.id, run.flowVersionId));
  const structurallyValid = validateGraph(version!.graph as FlowGraph).length === 0;
  const ranWithoutErrors = run.status === "succeeded";
  const output = (run.output ?? {}) as Record<string, unknown>;
  const hasOutput = pack.outputKeys.some((k) => output[k] !== undefined && output[k] !== null);
  const checks = ranWithoutErrors ? [{ id: "has_output", passed: hasOutput }, ...(hasOutput ? pack.evaluate(output, run.input, task.params) : [])] : [];
  const verdict: TrialVerdict = { structurallyValid, ranWithoutErrors, matchedOutcome: ranWithoutErrors && checks.length > 0 && checks.every((c) => c.passed), checks };
  const [updated] = await db.update(schema.cbTrial).set({ status: "completed", verdict, completedAt: new Date() }).where(and(eq(schema.cbTrial.id, trial.id), eq(schema.cbTrial.status, "running"))).returning();
  return updated ?? trial;
}

export async function latestTrials(installationId: string) {
  const rows = await db.select().from(schema.cbTrial).where(eq(schema.cbTrial.installationId, installationId)).orderBy(desc(schema.cbTrial.createdAt)).limit(100);
  const byTask = new Map<string, typeof rows[number]>();
  for (const r of rows) if (!byTask.has(r.taskId)) byTask.set(r.taskId, r);
  return byTask;
}

export async function trialOutput(trial: typeof schema.cbTrial.$inferSelect) {
  if (!trial.runId) return null;
  const [run] = await db.select({ output: schema.run.output, input: schema.run.input, status: schema.run.status, number: schema.run.number, flowVersionId: schema.run.flowVersionId }).from(schema.run).where(eq(schema.run.id, trial.runId));
  return run ?? null;
}

export const REJECT_REASONS = ["wrong_details", "invented_content", "missing_info", "wrong_tone", "something_else"] as const;

/**
 * The person's answer to "Does this result match what you wanted?" for a finished trial. Stored apart from the
 * objective checks: accepting never turns failed checks into a verified result (the lifecycle requires both), and a
 * later answer replaces the earlier one (history is kept in the audit log and experiment events).
 */
export async function recordUserVerdict(user: CurrentUser, workspaceId: string, trialId: string, verdict: UserVerdict, reason: (typeof REJECT_REASONS)[number] | null) {
  const trial = await refreshTrial(workspaceId, trialId);
  if (trial.status !== "completed") throw new HttpError(409, "TRIAL_NOT_FINISHED", "Wait for the result before judging it");
  if (verdict === "rejected" && !reason) throw new HttpError(400, "VALIDATION", "Tell us what's wrong with the result");
  // "Does this result match what you wanted?" is the named reviewer's judgement (as for activation approval).
  const { task } = await taskContext(workspaceId, trial.installationId, trial.taskId);
  if (!(await reviewerAllowed(workspaceId, user.id, task.reviewer))) throw new HttpError(403, "FORBIDDEN", task.reviewer === "owner" ? "The plan names the workspace owner as reviewer for this task" : "Only workspace owners and editors can judge results");
  const [updated] = await db
    .update(schema.cbTrial)
    .set({ userVerdict: verdict, userVerdictReason: verdict === "rejected" ? reason : null, userVerdictAt: new Date(), userVerdictBy: user.id })
    .where(and(eq(schema.cbTrial.id, trial.id), eq(schema.cbTrial.workspaceId, workspaceId)))
    .returning();
  await audit(db, { workspaceId, actor: userActor(user), action: "company_builder.result_judged", targetType: "cb_trial", targetId: trial.id, data: { taskId: trial.taskId, verdict, reason: verdict === "rejected" ? reason : null } });
  return updated!;
}
