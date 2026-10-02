import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CompanyBlueprint, TaskPlan } from "@/company-builder/model";
import type { FlowGraph } from "@/engine/types";
import { isUuid, type CurrentUser } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { canonicalJson, sha256Hex } from "@/server/crypto";
import { consumeFault } from "@/server/faults";
import { HttpError, notFound } from "@/server/http";
import { publishFlow, unpublishFlow } from "@/server/publish";
import { effectiveEntitlement } from "./entitlement";
import { reviewerAllowed } from "./reviewer";
import { refreshTrial, trialOutput } from "./trials";

/**
 * Review inbox. Each item shows its source, the proposed action/content, the connection, the recipient/record, the
 * reviewer and the task version, and is BOUND (sha256 of all of them) at request time. At execution the binding is
 * recomputed from the current state; any change (arguments, identity, version, membership, newer plan) invalidates the
 * item instead of executing it. The authorised test action writes to a local sample outbox (mocked integration) —
 * never an external account.
 */

export const REVIEW_TTL_MS = 24 * 3600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hash of what a flow does (nodes + edges; layout ignored) — used to bind activation to the trial-verified graph. */
export function graphHash(g: FlowGraph) {
  return sha256Hex(canonicalJson({ nodes: g.nodes.map((n) => ({ id: n.id, type: n.type, config: n.data.config })), edges: g.edges.map((e) => ({ s: e.source, t: e.target, h: e.sourceHandle ?? null })) }));
}
type ReviewRow = typeof schema.cbReviewItem.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const SAMPLE_CONNECTION = { provider: "sample_outbox", mocked: true };

export class UncertainOutcomeError extends HttpError {
  constructor() {
    super(409, "OUTCOME_UNCERTAIN", "We couldn't confirm the action. We'll verify before retrying.");
  }
}

/** The proposed test action for a task's trial output (null = nothing to send, e.g. a hand-off to a person). */
export function proposalFor(task: TaskPlan, output: Record<string, unknown>): { proposed: Record<string, unknown>; recipient: string } | null {
  if (task.packId === "customer-follow-up" || task.packId === "customer-triage") {
    const r = output.reply_draft as { to?: string; subject?: string; body?: string; consequential?: string | null } | undefined;
    if (!r?.body) return null;
    // A refund/cancellation draft is labelled so the reviewer sees that approving sends ONLY the text (no refund action).
    return { proposed: { kind: "email_reply", to: r.to ?? null, subject: r.subject ?? null, body: r.body, ...(r.consequential ? { consequential: r.consequential } : {}) }, recipient: String(r.to ?? "") };
  }
  if (task.packId === "invoice-organiser") {
    const r = (output.ledger_draft ?? output.discrepancy_review) as { ledger_rows?: unknown[]; totals_by_currency?: unknown[] } | undefined;
    if (!r?.ledger_rows?.length) return null;
    return { proposed: { kind: "ledger_rows", rows: r.ledger_rows, totals_by_currency: r.totals_by_currency ?? [] }, recipient: "sample_ledger" };
  }
  if (task.packId === "content-brief") {
    const r = output.content_draft as { copy_options?: string[]; call_to_action?: string } | undefined;
    if (!r?.copy_options?.length) return null;
    return { proposed: { kind: "content_copy", copy_options: r.copy_options, call_to_action: r.call_to_action ?? null }, recipient: "sample_content_queue" };
  }
  return null;
}

interface BindingParts {
  workspaceId: string;
  installationId: string;
  taskId: string;
  kind: string;
  blueprintId: string;
  blueprintVersion: number;
  taskVersion: string;
  source: unknown;
  proposed: unknown;
  recipient: string | null;
  connection: unknown;
  reviewerRole: string;
}

export function reviewBinding(p: BindingParts) {
  return sha256Hex(canonicalJson(p));
}

async function taskOf(installationId: string, taskId: string) {
  const [inst] = await db.select().from(schema.cbInstallation).where(eq(schema.cbInstallation.id, installationId));
  if (!inst) throw notFound("Installation not found");
  const [bp] = await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.id, inst.blueprintId));
  const task = (bp!.body as CompanyBlueprint).tasks.find((t) => t.id === taskId);
  if (!task) throw notFound("Task not found");
  return { inst, bp: bp!, task };
}

/** Current binding parts for an item, recomputed from the database (never from the stored item). */
async function currentParts(item: Pick<ReviewRow, "workspaceId" | "installationId" | "taskId" | "kind" | "trialId">): Promise<BindingParts | { stale: string }> {
  const { inst, bp, task } = await taskOf(item.installationId, item.taskId);
  if (inst.status !== "installed") return { stale: "installation_not_active" };
  // A newer plan version for the same interview makes older approvals stale.
  const [newest] = await db.select({ id: schema.cbBlueprint.id }).from(schema.cbBlueprint).where(eq(schema.cbBlueprint.sessionId, bp.sessionId)).orderBy(desc(schema.cbBlueprint.version)).limit(1);
  if (newest?.id !== bp.id) return { stale: "plan_changed" };
  const [flowItem] = await db.select().from(schema.cbInstalledItem).where(and(eq(schema.cbInstalledItem.installationId, inst.id), eq(schema.cbInstalledItem.taskId, task.id), eq(schema.cbInstalledItem.kind, "flow")));
  const [flow] = flowItem ? await db.select({ id: schema.flow.id, revision: schema.flow.revision, deletedAt: schema.flow.deletedAt }).from(schema.flow).where(eq(schema.flow.id, flowItem.refId)) : [];
  if (!flow || flow.deletedAt) return { stale: "flow_missing" };
  const taskVersion = `${task.packId}@${task.packVersion}`;
  if (item.kind === "send_sample") {
    const [trial] = item.trialId ? await db.select().from(schema.cbTrial).where(eq(schema.cbTrial.id, item.trialId)) : [];
    if (!trial) return { stale: "trial_missing" };
    const run = await trialOutput(trial);
    if (!run || run.status !== "succeeded") return { stale: "trial_not_succeeded" };
    const p = proposalFor(task, (run.output ?? {}) as Record<string, unknown>);
    if (!p) return { stale: "nothing_to_send" };
    return { workspaceId: item.workspaceId, installationId: inst.id, taskId: task.id, kind: item.kind, blueprintId: bp.id, blueprintVersion: bp.version, taskVersion, source: { trialId: trial.id, runId: trial.runId, flowVersionId: run.flowVersionId, runNumber: run.number }, proposed: p.proposed, recipient: p.recipient, connection: SAMPLE_CONNECTION, reviewerRole: task.reviewer };
  }
  // Activation is bound to the graph the latest MATCHED sample trial verified, which must still be the current draft,
  // and only a manual trigger may be activated (prototype activation never enables unattended operation).
  const [full] = await db.select({ graph: schema.flow.graph }).from(schema.flow).where(eq(schema.flow.id, flow.id));
  const current = full!.graph as FlowGraph;
  if (current.nodes.some((n) => n.type === "trigger.webhook" || n.type === "trigger.schedule")) return { stale: "not_manual_trigger" };
  const [trial] = await db.select().from(schema.cbTrial).where(and(eq(schema.cbTrial.installationId, inst.id), eq(schema.cbTrial.taskId, task.id))).orderBy(desc(schema.cbTrial.createdAt)).limit(1);
  if (!(trial?.verdict as { matchedOutcome?: boolean } | null)?.matchedOutcome) return { stale: "sample_not_verified" };
  // Objective checks are not enough: the person must also have said the result is what they wanted.
  if (trial!.userVerdict !== "accepted") return { stale: "result_not_accepted" };
  const run = await trialOutput(trial!);
  const [verified] = run ? await db.select({ graph: schema.flowVersion.graph }).from(schema.flowVersion).where(eq(schema.flowVersion.id, run.flowVersionId)) : [];
  if (!verified || graphHash(verified.graph as FlowGraph) !== graphHash(current)) return { stale: "draft_changed_since_trial" };
  return { workspaceId: item.workspaceId, installationId: inst.id, taskId: task.id, kind: item.kind, blueprintId: bp.id, blueprintVersion: bp.version, taskVersion, source: { flowId: flow.id, flowRevision: flow.revision, trialId: trial!.id, graphHash: graphHash(current) }, proposed: { action: "activate_task", taskId: task.id }, recipient: null, connection: null, reviewerRole: task.reviewer };
}

async function openItem(user: CurrentUser, parts: BindingParts, trialId: string | null) {
  const bindingHash = reviewBinding(parts);
  const same = and(eq(schema.cbReviewItem.installationId, parts.installationId), eq(schema.cbReviewItem.taskId, parts.taskId), eq(schema.cbReviewItem.kind, parts.kind), eq(schema.cbReviewItem.bindingHash, bindingHash));
  // Side-effect dedupe: the same test action (identical binding) that was already sent, is being sent, or whose outcome
  // is uncertain is returned as it is — it is never opened for approval (and sent) a second time.
  if (parts.kind === "send_sample") {
    const [done] = await db.select().from(schema.cbReviewItem).where(and(same, inArray(schema.cbReviewItem.status, ["approved", "executed", "uncertain"]))).orderBy(desc(schema.cbReviewItem.createdAt)).limit(1);
    if (done) return done;
  }
  // An expired pending item is retired so a new request can be opened (only ONE pending item per binding).
  const retired = await db.update(schema.cbReviewItem).set({ status: "invalidated", note: "expired" }).where(and(same, eq(schema.cbReviewItem.status, "pending"), sql`${schema.cbReviewItem.expiresAt} < now()`)).returning();
  for (const it of retired) if (it.kind === "activation") await setActivation(db, it, "failed", "review_expired", user.id, { ownedOnly: true });
  await db
    .insert(schema.cbReviewItem)
    .values({
      workspaceId: parts.workspaceId,
      installationId: parts.installationId,
      taskId: parts.taskId,
      kind: parts.kind,
      trialId,
      blueprintVersion: parts.blueprintVersion,
      taskVersion: parts.taskVersion,
      source: parts.source as object,
      proposed: parts.proposed as object,
      recipient: parts.recipient,
      connection: parts.connection as object | null,
      reviewerRole: parts.reviewerRole,
      bindingHash,
      requestedBy: user.id,
      expiresAt: new Date(Date.now() + REVIEW_TTL_MS),
    })
    .onConflictDoNothing();
  const [pending] = await db.select().from(schema.cbReviewItem).where(and(same, eq(schema.cbReviewItem.status, "pending")));
  if (pending) return pending;
  // Same content already decided (e.g. the test action was sent): return that decision instead of re-sending.
  const [latest] = await db.select().from(schema.cbReviewItem).where(same).orderBy(desc(schema.cbReviewItem.createdAt)).limit(1);
  return latest!;
}

/** Proposes the authorised TEST action for a completed trial (idempotent: same content → same item). */
export async function requestSampleAction(user: CurrentUser, workspaceId: string, trialId: string) {
  const trial = await refreshTrial(workspaceId, trialId);
  if (trial.status !== "completed") throw new HttpError(409, "TRIAL_RUNNING", "The trial hasn't finished yet");
  const parts = await currentParts({ workspaceId, installationId: trial.installationId, taskId: trial.taskId, kind: "send_sample", trialId: trial.id });
  if ("stale" in parts) throw new HttpError(409, "NOTHING_TO_REVIEW", "This trial has nothing to send for review", { reason: parts.stale });
  return openItem(user, parts, trial.id);
}


/**
 * Approve / reject. Approval re-checks the reviewer's CURRENT membership and the binding, then executes immediately
 * (sample action → sample outbox; activation → publish the draft's manual-trigger version). Never a blind retry.
 */
export async function decideReview(user: CurrentUser, workspaceId: string, itemId: string, decision: "approve" | "reject", note?: string) {
  if (!UUID.test(itemId)) throw notFound("Review item not found");
  const item = await db.transaction(async (tx) => {
    const [it] = await tx.select().from(schema.cbReviewItem).where(and(eq(schema.cbReviewItem.id, itemId), eq(schema.cbReviewItem.workspaceId, workspaceId))).for("update");
    if (!it) throw notFound("Review item not found");
    if (it.status !== "pending") throw new HttpError(409, "ALREADY_DECIDED", `This item is already ${it.status}`);
    if (!(await reviewerAllowed(workspaceId, user.id, it.reviewerRole))) throw new HttpError(403, "FORBIDDEN", it.reviewerRole === "owner" ? "The plan names the workspace owner as reviewer for this task" : "Only workspace owners and editors can decide reviews");
    if (it.expiresAt < new Date()) {
      await tx.update(schema.cbReviewItem).set({ status: "invalidated", note: "expired" }).where(eq(schema.cbReviewItem.id, it.id));
      // FB2-09: an expired activation request releases the activation record it owns (never an active one).
      if (it.kind === "activation") await setActivation(tx, it, "failed", "review_expired", user.id, { ownedOnly: true });
      return { ...it, status: "invalidated", note: "expired" };
    }
    if (decision === "reject") {
      const [r] = await tx.update(schema.cbReviewItem).set({ status: "rejected", decidedBy: user.id, decidedAt: new Date(), note: note?.slice(0, 500) ?? null }).where(eq(schema.cbReviewItem.id, it.id)).returning();
      if (it.kind === "activation") await setActivation(tx, it, "paused", "activation_rejected", user.id, { ownedOnly: true });
      return r!;
    }
    const parts = await currentParts(it);
    const requesterGone = it.requestedBy ? !(await db.select({ u: schema.workspaceMember.userId }).from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, it.requestedBy)))).length : true;
    if (requesterGone || "stale" in parts || reviewBinding(parts) !== it.bindingHash) {
      const reason = requesterGone ? "requester_not_member" : "stale" in parts ? parts.stale : "binding_changed";
      await tx.update(schema.cbReviewItem).set({ status: "invalidated", note: reason }).where(eq(schema.cbReviewItem.id, it.id));
      if (it.kind === "activation") await setActivation(tx, it, "failed", reason, user.id, { ownedOnly: true });
      return { ...it, status: "invalidated", note: reason };
    }
    const [r] = await tx.update(schema.cbReviewItem).set({ status: "approved", decidedBy: user.id, decidedAt: new Date(), note: note?.slice(0, 500) ?? null }).where(eq(schema.cbReviewItem.id, it.id)).returning();
    return r!;
  });
  await audit(db, { workspaceId, actor: userActor(user), action: "company_builder.review_decided", targetType: "cb_review_item", targetId: itemId, data: { decision, status: item.status, kind: item.kind } });
  if (item.status === "invalidated") throw new HttpError(409, "REVIEW_INVALIDATED", "This review no longer matches the current task — request a new review", { reason: item.note });
  if (item.status !== "approved") return item;
  try {
    return await execute(user, item);
  } catch (e) {
    // Activation owns a wider transaction that rolls publication, activation bookkeeping, audit, and final review
    // update back together. Keep its pre-execution approved decision intact when that transaction fails.
    if (!(e instanceof UncertainOutcomeError) && item.kind !== "activation") {
      await db.update(schema.cbReviewItem).set({ status: "invalidated", note: e instanceof HttpError ? e.code : "EXECUTION_FAILED" }).where(and(eq(schema.cbReviewItem.id, item.id), eq(schema.cbReviewItem.status, "approved")));
    }
    throw e;
  }
}

async function execute(user: CurrentUser, item: ReviewRow) {
  if (item.kind === "activation") return activate(user, item);
  await db.insert(schema.cbSampleOutbox).values({ workspaceId: item.workspaceId, reviewItemId: item.id, payload: { proposed: item.proposed, recipient: item.recipient } }).onConflictDoNothing();
  // TEST ONLY: the write happened but the response is "lost" — the outcome is uncertain until verified.
  if (consumeFault(user.id, "cb_action_lost")) {
    await db.update(schema.cbReviewItem).set({ status: "uncertain" }).where(eq(schema.cbReviewItem.id, item.id));
    throw new UncertainOutcomeError();
  }
  const [done] = await db.update(schema.cbReviewItem).set({ status: "executed", executedAt: new Date() }).where(eq(schema.cbReviewItem.id, item.id)).returning();
  return done!;
}

/** Uncertain outcome: VERIFY first (did the outbox record it?); only a verified absence allows one more attempt. */
export async function verifyUncertain(user: CurrentUser, workspaceId: string, itemId: string) {
  if (!UUID.test(itemId)) throw notFound("Review item not found");
  const [it] = await db.select().from(schema.cbReviewItem).where(and(eq(schema.cbReviewItem.id, itemId), eq(schema.cbReviewItem.workspaceId, workspaceId)));
  if (!it) throw notFound("Review item not found");
  if (it.kind !== "send_sample" || (it.status !== "uncertain" && it.status !== "approved")) throw new HttpError(409, "NOT_UNCERTAIN", `This item is ${it.status}`);
  if (!(await reviewerAllowed(workspaceId, user.id, it.reviewerRole))) throw new HttpError(403, "FORBIDDEN", "Only the reviewer can verify this action");
  const [sent] = await db.select({ id: schema.cbSampleOutbox.id }).from(schema.cbSampleOutbox).where(eq(schema.cbSampleOutbox.reviewItemId, it.id));
  if (sent) {
    const [done] = await db.update(schema.cbReviewItem).set({ status: "executed", executedAt: new Date(), note: "verified_after_uncertain" }).where(eq(schema.cbReviewItem.id, it.id)).returning();
    return { item: done!, verified: "already_applied" as const };
  }
  // Verified NOT applied: one more attempt, only if the binding still holds.
  const parts = await currentParts(it);
  if ("stale" in parts || reviewBinding(parts) !== it.bindingHash) {
    await db.update(schema.cbReviewItem).set({ status: "invalidated", note: "stale" in parts ? parts.stale : "binding_changed" }).where(eq(schema.cbReviewItem.id, it.id));
    throw new HttpError(409, "REVIEW_INVALIDATED", "This review no longer matches the current task — request a new review");
  }
  const [back] = await db.update(schema.cbReviewItem).set({ status: "approved" }).where(eq(schema.cbReviewItem.id, it.id)).returning();
  return { item: await execute(user, back!), verified: "not_applied_retried" as const };
}

/* ───────────── Activation ───────────── */

async function setActivation(tx: Tx | typeof db, it: Pick<ReviewRow, "workspaceId" | "installationId" | "taskId" | "id" | "bindingHash">, state: "approval_required" | "active" | "paused" | "failed", reason: string | null, userId: string, opts: { ownedOnly?: boolean } = {}) {
  await tx
    .insert(schema.cbActivation)
    .values({ workspaceId: it.workspaceId, installationId: it.installationId, taskId: it.taskId, state, reason, bindingHash: it.bindingHash, reviewItemId: it.id, decidedBy: userId })
    .onConflictDoUpdate({
      target: [schema.cbActivation.installationId, schema.cbActivation.taskId],
      set: { state, reason, bindingHash: it.bindingHash, reviewItemId: it.id, decidedBy: userId, updatedAt: new Date() },
      // Only an actual activation/pause changes an ACTIVE task; a rejected or stale re-request leaves it as it is.
      // FB2-02: a decision on a request that no longer owns the activation record (a newer request was opened or
      // approved since) never changes it.
      setWhere: opts.ownedOnly
        ? and(ne(schema.cbActivation.state, "active"), eq(schema.cbActivation.reviewItemId, it.id))
        : state === "active" || state === "paused"
          ? undefined
          : ne(schema.cbActivation.state, "active"),
    });
}

/** Requests activation of ONE verified task. Needs a matched sample trial AND an entitlement (trial or billing). */
export async function requestActivation(user: CurrentUser, workspaceId: string, installationId: string, taskId: string) {
  const ent = await effectiveEntitlement(workspaceId);
  if (!ent) throw new HttpError(402, "ENTITLEMENT_REQUIRED", "Activation needs a development trial or an active subscription");
  if (!UUID.test(installationId)) throw notFound("Installation not found");
  const [owned] = await db.select({ id: schema.cbInstallation.id }).from(schema.cbInstallation).where(and(eq(schema.cbInstallation.id, installationId), eq(schema.cbInstallation.workspaceId, workspaceId)));
  if (!owned) throw notFound("Installation not found");
  const [current] = await db.select({ state: schema.cbActivation.state }).from(schema.cbActivation).where(and(eq(schema.cbActivation.installationId, installationId), eq(schema.cbActivation.taskId, taskId)));
  if (current?.state === "active") throw new HttpError(409, "ALREADY_ACTIVE", "This task is already active — pause it first to change it");
  const { task } = await taskOf(installationId, taskId);
  if (task.reviewer === "unknown" || task.trigger.status === "unsupported") throw new HttpError(409, "REQUIRES_SETUP", "This task still needs setup before activation");
  const parts = await currentParts({ workspaceId, installationId, taskId, kind: "activation", trialId: null });
  if ("stale" in parts) {
    if (parts.stale === "result_not_accepted") throw new HttpError(409, "RESULT_NOT_ACCEPTED", "Tell us the sample result matches what you wanted before activating");
    if (parts.stale === "sample_not_verified" || parts.stale === "draft_changed_since_trial") throw new HttpError(409, "SAMPLE_NOT_VERIFIED", "Run a sample trial of the current draft that matches the expected result first", { reason: parts.stale });
    throw new HttpError(409, "NOT_ACTIVATABLE", "This task can't be activated now", { reason: parts.stale });
  }
  const item = await openItem(user, parts, null);
  if (item.status === "pending") await setActivation(db, item, "approval_required", null, user.id);
  return item;
}

async function activate(user: CurrentUser, item: ReviewRow) {
  const ent = await effectiveEntitlement(item.workspaceId);
  if (!ent) {
    await setActivation(db, item, "paused", "entitlement_missing", user.id);
    throw new HttpError(402, "ENTITLEMENT_REQUIRED", "Activation needs a development trial or an active subscription");
  }
  const source = item.source as { flowId: string; graphHash: string };
  // Publication, the activation record, superseding older requests, the audit entry and the review's final state are ONE
  // transaction: a failure anywhere rolls the publication back, so a published flow never exists without its activation.
  const outcome = await db.transaction(async (tx) => {
    // Publishing pins the reviewed draft as the version runs use (manual trigger only — checked in the binding).
    const published = await publishFlow(user, source.flowId, tx);
    const [pv] = await tx.select({ graph: schema.flowVersion.graph }).from(schema.flowVersion).where(eq(schema.flowVersion.id, published.versionId));
    const g = pv!.graph as FlowGraph;
    if (graphHash(g) !== source.graphHash || published.trigger !== "trigger.manual") {
      // The draft changed between approval and publication: withdraw it; nothing unreviewed stays published. The review
      // item is invalidated in the SAME transaction (an "approved" activation that never ran would be unresolvable: no
      // decision or verification path exists for it) — the stored status always matches what the caller is told.
      await unpublishFlow(source.flowId, tx);
      await setActivation(tx, item, "paused", "draft_changed_during_activation", user.id); // explicit: nothing is published
      await tx.update(schema.cbReviewItem).set({ status: "invalidated", note: "draft_changed_during_activation" }).where(and(eq(schema.cbReviewItem.id, item.id), eq(schema.cbReviewItem.status, "approved")));
      return null;
    }
    if (consumeFault(user.id, "cb_activation_bookkeeping")) throw new Error("injected activation bookkeeping failure"); // TEST ONLY
    await setActivation(tx, item, "active", null, user.id);
    // Older pending activation requests for this task can't apply any more: mark them superseded (history kept).
    await tx
      .update(schema.cbReviewItem)
      .set({ status: "invalidated", note: "superseded" })
      .where(and(eq(schema.cbReviewItem.installationId, item.installationId), eq(schema.cbReviewItem.taskId, item.taskId), eq(schema.cbReviewItem.kind, "activation"), eq(schema.cbReviewItem.status, "pending"), ne(schema.cbReviewItem.id, item.id)));
    await audit(tx, { workspaceId: item.workspaceId, actor: userActor(user), action: "company_builder.activation_changed", targetType: "cb_task", targetId: item.taskId, data: { state: "active", source: ent.source } });
    const [done] = await tx.update(schema.cbReviewItem).set({ status: "executed", executedAt: new Date() }).where(eq(schema.cbReviewItem.id, item.id)).returning();
    return done!;
  });
  if (!outcome) throw new HttpError(409, "REVIEW_INVALIDATED", "The draft changed while it was being activated — request a new review", { reason: "draft_changed_during_activation" });
  return outcome;
}

export async function pauseTask(user: CurrentUser, workspaceId: string, installationId: string, taskId: string, reason = "paused_by_owner") {
  if (!isUuid(installationId)) throw notFound("Task is not active");
  const [act] = await db.select().from(schema.cbActivation).where(and(eq(schema.cbActivation.installationId, installationId), eq(schema.cbActivation.taskId, taskId), eq(schema.cbActivation.workspaceId, workspaceId)));
  if (!act) throw notFound("Task is not active");
  const [flowItem] = await db.select().from(schema.cbInstalledItem).where(and(eq(schema.cbInstalledItem.installationId, installationId), eq(schema.cbInstalledItem.taskId, taskId), eq(schema.cbInstalledItem.kind, "flow")));
  if (flowItem) await unpublishFlow(flowItem.refId);
  await db.update(schema.cbActivation).set({ state: "paused", reason, updatedAt: new Date() }).where(eq(schema.cbActivation.id, act.id));
  await audit(db, { workspaceId, actor: userActor(user), action: "company_builder.activation_changed", targetType: "cb_task", targetId: taskId, data: { state: "paused", reason } });
}

export async function listReviewItems(workspaceId: string, status?: string) {
  const rows = await db
    .select()
    .from(schema.cbReviewItem)
    .where(status ? and(eq(schema.cbReviewItem.workspaceId, workspaceId), eq(schema.cbReviewItem.status, status)) : eq(schema.cbReviewItem.workspaceId, workspaceId))
    .orderBy(desc(schema.cbReviewItem.createdAt))
    .limit(100);
  const now = Date.now();
  return rows.map((r) => ({ ...r, expired: r.status === "pending" && r.expiresAt.getTime() < now }));
}

export async function sampleOutbox(workspaceId: string) {
  return db.select().from(schema.cbSampleOutbox).where(eq(schema.cbSampleOutbox.workspaceId, workspaceId)).orderBy(desc(schema.cbSampleOutbox.createdAt)).limit(50);
}

export async function pendingReviewCount(workspaceId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.cbReviewItem).where(and(eq(schema.cbReviewItem.workspaceId, workspaceId), eq(schema.cbReviewItem.status, "pending"), sql`${schema.cbReviewItem.expiresAt} >= now()`));
  return r?.n ?? 0;
}
