import type { FlowGraph, ValidationIssue } from "@/engine/types";

export interface FlowDto {
  id: string;
  workspaceId: string;
  name: string;
  graph: FlowGraph;
  revision: number;
  updatedAt: string;
}

export interface FlowResponse {
  flow: FlowDto;
  role: "owner" | "editor" | "viewer";
  workspace: { id: string; slug: string; name: string };
  issues: ValidationIssue[];
}

export interface RunStepDto {
  id: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  position: number;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped" | "reused" | "waiting_approval" | "uncertain" | "cancelled";
  meta?: Record<string, unknown> | null;
  log?: string[] | null;
  attempts?: number;
  input: unknown;
  output: unknown;
  error: { code: string; message: string } | null;
  skipReason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface RunDetailDto {
  id: string;
  number: number;
  status: "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
  triggerKind?: "manual" | "webhook" | "schedule" | "rerun" | "subflow";
  cancelRequestedAt?: string | null;
  flowId: string;
  flowName: string;
  input: unknown;
  output: unknown;
  error: { code: string; message: string; nodeId?: string } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  rerunOfRunId: string | null;
  rerunFromNodeId: string | null;
  version: number | null;
  graph: FlowGraph | null;
  steps: RunStepDto[];
  versionReason?: string | null;
  approvals?: ApprovalDto[];
  events?: { id: number; at: string; type: string; nodeId: string | null; data: unknown }[];
}

export interface ApprovalDto {
  id: string;
  nodeId: string;
  kind: "approval" | "review";
  actionId: string;
  status: "pending" | "approved" | "rejected" | "expired" | "superseded";
  resolution: string | null;
  argsPreview: unknown;
  requestedAt: string;
  expiresAt: string;
  decidedAt: string | null;
  note: string | null;
}

export interface RunListItem {
  id: string;
  number: number;
  status: RunDetailDto["status"];
  flowId: string;
  flowName: string;
  createdAt: string;
  durationMs: number | null;
  error: RunDetailDto["error"];
  rerunOfRunId: string | null;
  triggerKind?: RunDetailDto["triggerKind"];
  steps: Pick<RunStepDto, "nodeId" | "nodeType" | "nodeLabel" | "position" | "status" | "durationMs" | "error">[];
}

export const isActive = (s: string) => s === "queued" || s === "running";
/** Not finished: active or waiting for a human. */
export const isOpen = (s: string) => isActive(s) || s === "waiting_approval";
