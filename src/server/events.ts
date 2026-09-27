import type { Db } from "@/db";
import { schema } from "@/db";
import { redact } from "./redact";

export type RunEventType =
  | "queued"
  | "claimed"
  | "resumed"
  | "step_started"
  | "step_succeeded"
  | "step_failed"
  | "step_skipped"
  | "step_retry"
  | "step_verified"
  | "step_uncertain"
  | "approval_requested"
  | "approval_decided"
  | "budget_blocked"
  | "connection_blocked"
  | "cancel_requested"
  | "cancelled"
  | "lease_lost"
  | "requeued"
  | "timed_out"
  | "finished";

/** Append-only run event log. Data is redacted before it is stored. */
export async function logEvent(db: Db, e: { runId: string; workspaceId: string; type: RunEventType; nodeId?: string | null; data?: unknown }) {
  await db.insert(schema.runEvent).values({
    runId: e.runId,
    workspaceId: e.workspaceId,
    type: e.type,
    nodeId: e.nodeId ?? null,
    data: e.data === undefined ? null : (redact(e.data) as object),
  });
}
