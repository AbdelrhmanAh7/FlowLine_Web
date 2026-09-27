import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { schema } from "@/db";
import { canonicalJson, sha256Hex } from "./crypto";
import { logEvent } from "./events";
import { HttpError, notFound } from "./http";
import { redact } from "./redact";

export const APPROVAL_TTL_MS = 24 * 3600_000;

export type ApprovalKind = "approval" | "review";

export interface GateRequest {
  workspaceId: string;
  runId: string;
  flowVersionId: string;
  nodeId: string;
  kind: ApprovalKind;
  actionId: string;
  args: unknown;
  connectionId: string | null;
  secrets?: string[];
}

/**
 * Hash of everything the decision is bound to. Changing any of it — different
 * run, revision, node, action, arguments or connection — invalidates the approval.
 */
export function bindingHash(r: Pick<GateRequest, "runId" | "flowVersionId" | "nodeId" | "actionId" | "args" | "connectionId" | "kind">) {
  return sha256Hex(canonicalJson({ run: r.runId, version: r.flowVersionId, node: r.nodeId, action: r.actionId, args: r.args, connection: r.connectionId, kind: r.kind }));
}

export type GateResult =
  | { status: "approved"; approvalId: string; resolution: string | null }
  | { status: "pending"; approvalId: string }
  | { status: "rejected"; approvalId: string; note: string | null };

/**
 * Checks (or opens) the human gate for one execution of an action. A decision is
 * valid only if it matches the binding hash exactly, hasn't expired, and the
 * approver still has editor rights in the workspace at execution time.
 */
export async function checkGate(db: Db, r: GateRequest): Promise<GateResult> {
  const hash = bindingHash(r);
  const rows = await db
    .select()
    .from(schema.approval)
    .where(and(eq(schema.approval.runId, r.runId), eq(schema.approval.nodeId, r.nodeId), eq(schema.approval.kind, r.kind)))
    .orderBy(desc(schema.approval.requestedAt));
  const now = new Date();
  for (const a of rows) {
    if (a.status === "superseded" || a.status === "expired") continue;
    if (a.argsHash !== hash) {
      // Arguments/revision/connection changed since the request — never reuse.
      await db.update(schema.approval).set({ status: "superseded", note: "Arguments or binding changed" }).where(and(eq(schema.approval.id, a.id), inArray(schema.approval.status, ["pending", "approved"])));
      continue;
    }
    if (a.expiresAt < now && (a.status === "pending" || a.status === "approved")) {
      await db.update(schema.approval).set({ status: "expired" }).where(eq(schema.approval.id, a.id));
      continue;
    }
    if (a.status === "pending") return { status: "pending", approvalId: a.id };
    if (a.status === "rejected") return { status: "rejected", approvalId: a.id, note: a.note };
    if (a.status === "approved") {
      const stillAllowed = a.decidedBy ? await isEditor(db, r.workspaceId, a.decidedBy) : false;
      if (!stillAllowed) {
        await db.update(schema.approval).set({ status: "superseded", note: "Approver no longer has editor access" }).where(eq(schema.approval.id, a.id));
        continue;
      }
      return { status: "approved", approvalId: a.id, resolution: a.resolution };
    }
  }
  const [created] = await db
    .insert(schema.approval)
    .values({
      workspaceId: r.workspaceId,
      runId: r.runId,
      flowVersionId: r.flowVersionId,
      nodeId: r.nodeId,
      kind: r.kind,
      actionId: r.actionId,
      argsHash: hash,
      argsPreview: redact(r.args ?? null, r.secrets ?? []) as object,
      connectionId: r.connectionId,
      expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
    })
    .returning();
  await logEvent(db, { runId: r.runId, workspaceId: r.workspaceId, type: "approval_requested", nodeId: r.nodeId, data: { approvalId: created!.id, kind: r.kind, action: r.actionId } });
  return { status: "pending", approvalId: created!.id };
}

async function isEditor(db: Db, workspaceId: string, userId: string) {
  const [m] = await db
    .select({ role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)));
  return m?.role === "owner" || m?.role === "editor";
}

export async function listPendingApprovals(db: Db, workspaceId: string) {
  return db
    .select({
      id: schema.approval.id,
      runId: schema.approval.runId,
      runNumber: schema.run.number,
      flowId: schema.run.flowId,
      flowName: schema.flow.name,
      nodeId: schema.approval.nodeId,
      kind: schema.approval.kind,
      actionId: schema.approval.actionId,
      argsPreview: schema.approval.argsPreview,
      requestedAt: schema.approval.requestedAt,
      expiresAt: schema.approval.expiresAt,
    })
    .from(schema.approval)
    .innerJoin(schema.run, eq(schema.run.id, schema.approval.runId))
    .innerJoin(schema.flow, eq(schema.flow.id, schema.run.flowId))
    .where(and(eq(schema.approval.workspaceId, workspaceId), eq(schema.approval.status, "pending"), sql`${schema.approval.expiresAt} > now()`))
    .orderBy(desc(schema.approval.requestedAt))
    .limit(100);
}

/**
 * Records a decision. `decision` for approvals: approve | reject. For reviews of an
 * uncertain outcome: done (it happened) | retry | fail. The run is re-queued so the
 * worker re-evaluates the gate — the decision is only honoured if still valid then.
 */
export async function decide(db: Db, opts: { workspaceId: string; approvalId: string; userId: string; decision: "approve" | "reject" | "done" | "retry" | "fail"; note?: string }) {
  if (!(await isEditor(db, opts.workspaceId, opts.userId))) throw new HttpError(403, "FORBIDDEN", "Only editors can decide approvals");
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(schema.approval).where(and(eq(schema.approval.id, opts.approvalId), eq(schema.approval.workspaceId, opts.workspaceId))).for("update");
    if (!a) throw notFound("Approval not found");
    if (a.status !== "pending") throw new HttpError(409, "ALREADY_DECIDED", `This request is already ${a.status}`);
    if (a.expiresAt < new Date()) {
      await tx.update(schema.approval).set({ status: "expired" }).where(eq(schema.approval.id, a.id));
      throw new HttpError(409, "EXPIRED", "This request expired — re-run to request a new decision");
    }
    const valid = a.kind === "approval" ? ["approve", "reject"] : ["done", "retry", "fail"];
    if (!valid.includes(opts.decision)) throw new HttpError(400, "VALIDATION", `Invalid decision for a ${a.kind}`);
    const approved = opts.decision === "approve" || opts.decision === "done" || opts.decision === "retry";
    await tx
      .update(schema.approval)
      .set({ status: approved ? "approved" : "rejected", resolution: a.kind === "review" ? opts.decision : null, decidedBy: opts.userId, decidedAt: new Date(), note: opts.note?.slice(0, 500) ?? null })
      .where(eq(schema.approval.id, a.id));
    // Wake the run: the worker re-checks the gate and continues or fails the step.
    await tx.update(schema.run).set({ status: "queued", lockedBy: null }).where(and(eq(schema.run.id, a.runId), eq(schema.run.status, "waiting_approval")));
    await tx.execute(sql`select pg_notify('flowline_runs', ${a.runId})`);
    await tx.insert(schema.runEvent).values({ runId: a.runId, workspaceId: a.workspaceId, type: "approval_decided", nodeId: a.nodeId, data: { approvalId: a.id, decision: opts.decision } });
    return { runId: a.runId, status: approved ? "approved" : "rejected" };
  });
}

/**
 * A reviewer's "retry" allows exactly one more attempt. Once acted on it is retired, so a
 * second lost response opens a new review instead of silently re-sending again.
 */
export async function consumeRetry(db: Db, approvalId: string) {
  await db.update(schema.approval).set({ status: "superseded", note: "Retry used" }).where(and(eq(schema.approval.id, approvalId), eq(schema.approval.status, "approved")));
}
