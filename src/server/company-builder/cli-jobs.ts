import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { applyProposal, blueprintProposalSchema, buildBlueprintEnvelope, envelopeSchema, sanitiseText, textTrialResultSchema, type CliKind, type Envelope } from "@/company-builder/cli/envelope";
import type { CompanyBlueprint } from "@/company-builder/model";
import type { CurrentUser } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { HttpError, notFound } from "@/server/http";
import { latestBlueprint, storeBlueprint } from "./blueprints";
import { requireSession, stateOf } from "./sessions";

/**
 * Owner CLI prototype jobs. Web routes (behind assertPrototypeAccess) can only ENQUEUE, CANCEL, LIST, EXPORT and
 * IMPORT; a job is executed only by the operator-started controller on the founder's machine. The job starts in
 * `waiting_operator` and never runs from a webhook, schedule, billing event or customer input. Results reach the
 * database only after Flowline validation, as a new blueprint version that needs review.
 */

export const JOB_STATUSES = ["waiting_operator", "generating", "validating", "review_required", "completed", "cancelled", "failed", "blocked_auth", "blocked_quota", "blocked_permission"] as const;
const TERMINAL = ["review_required", "completed", "cancelled", "failed", "blocked_auth", "blocked_quota", "blocked_permission"];

export const REQUEST_KEY = /^[A-Za-z0-9_-]{8,64}$/;

export async function enqueueJob(user: CurrentUser, workspaceId: string, input: { sessionId: string; cli: CliKind; kind: "blueprint" | "text_trial"; requestKey: string; text?: string }) {
  if (!REQUEST_KEY.test(input.requestKey)) throw new HttpError(400, "VALIDATION", "Invalid request key");
  const session = await requireSession(workspaceId, input.sessionId);
  const jobId = randomUUID();
  let envelope: Envelope;
  if (input.kind === "blueprint") {
    const base = await latestBlueprint(session.id);
    if (!base) throw new HttpError(409, "PLAN_FIRST", "Preview the plan first; the CLI only refines it");
    envelope = buildBlueprintEnvelope(jobId, input.cli, stateOf(session).facts, base.body as CompanyBlueprint);
  } else {
    const text = sanitiseText(input.text, 2000);
    if (!text) throw new HttpError(422, "VALIDATION", "Enter a synthetic request to process");
    envelope = envelopeSchema.parse({ v: 1, kind: "text_trial", jobId, cli: input.cli, taskId: "customer-follow-up", text });
  }
  // Refresh/retry with the same request key returns the same job (never a duplicate).
  await db
    .insert(schema.cbCliJob)
    .values({ id: jobId, workspaceId, sessionId: session.id, kind: input.kind, cli: input.cli, requestKey: input.requestKey, envelope, createdBy: user.id })
    .onConflictDoNothing({ target: [schema.cbCliJob.workspaceId, schema.cbCliJob.requestKey] });
  const [job] = await db.select().from(schema.cbCliJob).where(and(eq(schema.cbCliJob.workspaceId, workspaceId), eq(schema.cbCliJob.requestKey, input.requestKey)));
  await audit(db, { workspaceId, actor: userActor(user), action: "company_builder.cli_job", targetType: "cb_cli_job", targetId: job!.id, data: { event: "enqueued", cli: input.cli, kind: input.kind } });
  return job!;
}

export async function requireJob(workspaceId: string, jobId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw notFound("Job not found");
  const [job] = await db.select().from(schema.cbCliJob).where(and(eq(schema.cbCliJob.id, jobId), eq(schema.cbCliJob.workspaceId, workspaceId)));
  if (!job) throw notFound("Job not found");
  return job;
}

export async function cancelJob(user: CurrentUser, workspaceId: string, jobId: string) {
  const job = await requireJob(workspaceId, jobId);
  if (TERMINAL.includes(job.status)) return job;
  // A waiting job is cancelled at once (only if still waiting); a running one is flagged and the controller kills its
  // process group. Conditional updates: a job that finished meanwhile keeps its real outcome.
  const [waiting] = await db
    .update(schema.cbCliJob)
    .set({ status: "cancelled", cancelRequestedAt: new Date(), finishedAt: new Date() })
    .where(and(eq(schema.cbCliJob.id, job.id), eq(schema.cbCliJob.status, "waiting_operator")))
    .returning();
  const [row] = waiting ? [waiting] : await db.update(schema.cbCliJob).set({ cancelRequestedAt: new Date() }).where(and(eq(schema.cbCliJob.id, job.id), inArray(schema.cbCliJob.status, ["generating", "validating"]))).returning();
  await audit(db, { workspaceId, actor: userActor(user), action: "company_builder.cli_job", targetType: "cb_cli_job", targetId: job.id, data: { event: "cancel_requested" } });
  return row ?? (await requireJob(workspaceId, jobId));
}

export async function listJobs(workspaceId: string, sessionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw notFound("Session not found");
  return db
    .select({ id: schema.cbCliJob.id, kind: schema.cbCliJob.kind, cli: schema.cbCliJob.cli, status: schema.cbCliJob.status, error: schema.cbCliJob.error, attempts: schema.cbCliJob.attempts, repairAttempts: schema.cbCliJob.repairAttempts, reported: schema.cbCliJob.reported, resultBlueprintId: schema.cbCliJob.resultBlueprintId, result: schema.cbCliJob.result, createdAt: schema.cbCliJob.createdAt, finishedAt: schema.cbCliJob.finishedAt })
    .from(schema.cbCliJob)
    .where(and(eq(schema.cbCliJob.workspaceId, workspaceId), eq(schema.cbCliJob.sessionId, sessionId)))
    .orderBy(desc(schema.cbCliJob.createdAt))
    .limit(20);
}

/* ───────────── Validation of CLI output (shared by the controller and the import path) ───────────── */

export type ValidationOutcome = { ok: true; value: unknown } | { ok: false; problem: string };

export function validateJobOutput(envelope: Envelope, raw: unknown): ValidationOutcome {
  const schemaFor = envelope.kind === "blueprint" ? blueprintProposalSchema : textTrialResultSchema;
  const parsed = schemaFor.safeParse(raw);
  if (!parsed.success) return { ok: false, problem: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`).join("; ") };
  return { ok: true, value: parsed.data };
}

/** Applies a validated result: blueprint proposals become a new blueprint version (review required). */
export async function applyJobResult(founder: CurrentUser, job: typeof schema.cbCliJob.$inferSelect, value: unknown, generator: CompanyBlueprint["generator"]) {
  const envelope = job.envelope as Envelope;
  if (envelope.kind === "text_trial") {
    await db.update(schema.cbCliJob).set({ status: "completed", result: value as object, finishedAt: new Date(), error: null }).where(eq(schema.cbCliJob.id, job.id));
    return null;
  }
  const base = await latestBlueprint(job.sessionId!);
  if (!base) throw new HttpError(409, "PLAN_FIRST", "No base plan");
  const { blueprint, ignored } = applyProposal(base.body as CompanyBlueprint, blueprintProposalSchema.parse(value), generator);
  const { row } = await storeBlueprint(founder, job.workspaceId, job.sessionId!, blueprint, generator);
  await db.update(schema.cbCliJob).set({ status: "review_required", result: { ignoredTaskIds: ignored }, resultBlueprintId: row.id, finishedAt: new Date(), error: null }).where(eq(schema.cbCliJob.id, job.id));
  return row;
}

/* ───────────── Operator export / import (laptop-only CLIs, Pi limitation) ───────────── */

/** The exact envelope the laptop script needs (no secrets; the laptop's own CLI login is used there). */
export async function exportJob(workspaceId: string, jobId: string) {
  const job = await requireJob(workspaceId, jobId);
  if (job.status !== "waiting_operator") throw new HttpError(409, "NOT_EXPORTABLE", `This job is ${job.status}`);
  return { format: "flowline-cb-envelope", version: 1, envelope: job.envelope as Envelope };
}

/**
 * Imports a manifest produced on the laptop (`scripts/company-builder/laptop-generate.mjs`). It is data, validated
 * exactly like controller output; its CLI provenance is a CLAIM (recorded as imported, not verified here).
 */
export async function importJobResult(founder: CurrentUser, workspaceId: string, jobId: string, manifest: unknown) {
  const job = await requireJob(workspaceId, jobId);
  if (job.status !== "waiting_operator") throw new HttpError(409, "NOT_IMPORTABLE", `This job is ${job.status}`);
  const m = manifest as { format?: unknown; jobId?: unknown; output?: unknown; reported?: unknown } | null;
  if (!m || m.format !== "flowline-cb-result" || m.jobId !== job.id) throw new HttpError(422, "MANIFEST_INVALID", "This file isn't a result for this job");
  const envelope = job.envelope as Envelope;
  const check = validateJobOutput(envelope, m.output);
  if (!check.ok) {
    await db.update(schema.cbCliJob).set({ status: "failed", error: { code: "OUTPUT_INVALID" }, finishedAt: new Date() }).where(and(eq(schema.cbCliJob.id, job.id), eq(schema.cbCliJob.status, "waiting_operator")));
    throw new HttpError(422, "OUTPUT_INVALID", "The imported result failed validation", { problem: check.problem });
  }
  const reported = m.reported && typeof m.reported === "object" ? Object.fromEntries(Object.entries(m.reported as Record<string, unknown>).filter(([k, v]) => ["totalCostUsd", "inputTokens", "outputTokens", "models", "durationMs", "cliVersion"].includes(k) && (typeof v === "number" || typeof v === "string" || Array.isArray(v))).slice(0, 6)) : {};
  // Claim the job atomically (a controller can't process it at the same time; a second import gets 409).
  const [claimed] = await db
    .update(schema.cbCliJob)
    .set({ status: "validating", reported: { ...reported, source: "imported_claim" } })
    .where(and(eq(schema.cbCliJob.id, job.id), eq(schema.cbCliJob.status, "waiting_operator")))
    .returning();
  if (!claimed) throw new HttpError(409, "NOT_IMPORTABLE", "This job is no longer waiting");
  try {
    return await applyJobResult(founder, claimed, check.value, "cli_import");
  } catch (e) {
    await db.update(schema.cbCliJob).set({ status: "failed", error: { code: "OUTPUT_INVALID" }, finishedAt: new Date() }).where(eq(schema.cbCliJob.id, job.id));
    throw e;
  }
}

/* ───────────── Controller claim / recovery ───────────── */

export async function claimJob(workspaceId: string, controllerId: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      select id from cb_cli_job where workspace_id = ${workspaceId} and status = 'waiting_operator' and cancel_requested_at is null
      order by created_at limit 1 for update skip locked`);
    const id = rows.rows[0]?.id;
    if (!id) return null;
    const [job] = await tx.update(schema.cbCliJob).set({ status: "generating", lockedBy: controllerId, heartbeatAt: new Date(), startedAt: new Date(), attempts: sql`${schema.cbCliJob.attempts} + 1` }).where(eq(schema.cbCliJob.id, id)).returning();
    return job!;
  });
}

/** A controller that died mid-job leaves it "generating": it is failed as INTERRUPTED (never re-run silently). */
export async function recoverStaleJobs(staleMs = 120_000) {
  const cutoff = new Date(Date.now() - staleMs);
  return db
    .update(schema.cbCliJob)
    .set({ status: "failed", error: { code: "INTERRUPTED" }, finishedAt: new Date(), lockedBy: null })
    .where(and(inArray(schema.cbCliJob.status, ["generating", "validating"]), or(lt(schema.cbCliJob.heartbeatAt, cutoff), sql`${schema.cbCliJob.heartbeatAt} is null`)))
    .returning({ id: schema.cbCliJob.id });
}
