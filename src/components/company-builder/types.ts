import type { CompanyBlueprint, Fact, TaskPlan, TrialVerdict } from "@/company-builder/model";

/** Shapes returned by /api/workspaces/[wid]/company-builder/sessions/[sid] (see src/server/company-builder/overview.ts). */
export interface QuestionDto {
  id: string;
  target: string;
  kind: "single" | "multi" | "text";
  options: string[] | null;
  maxLength: number | null;
  allowUnknown: boolean;
  sensitivity: "none" | "business" | "financial" | "personal";
  department: string | null;
  current: Fact | null;
}

export interface TaskView {
  task: TaskPlan;
  status: { state: string; reasons: string[]; canTry: boolean; canRequestActivation: boolean };
  capabilities: string[];
  flow: { id: string; name: string; edited: boolean; published: boolean; origin: string } | null;
  agent: { id: string; name: string; origin: string } | null;
  trial: { id: string; status: string; provenance: string; verdict: TrialVerdict | null; runId: string | null; runNumber: number | null; runStatus: string | null; output: Record<string, unknown> | null } | null;
  activation: { state: string; reason: string | null } | null;
}

export interface ReviewItemDto {
  id: string;
  kind: "send_sample" | "activation";
  taskId: string;
  status: string;
  source: Record<string, unknown>;
  proposed: Record<string, unknown>;
  recipient: string | null;
  connection: { provider?: string; mocked?: boolean } | null;
  reviewerRole: string;
  taskVersion: string;
  blueprintVersion: number;
  note: string | null;
  createdAt: string;
  expired: boolean;
}

export interface Overview {
  session: {
    id: string;
    status: string;
    revision: number;
    profileVersion: number;
    facts: Record<string, Fact>;
    answered: number;
    question: QuestionDto | null;
    backTo: string | null;
    readiness: { complete: boolean; missing: string[]; departments: string[] };
  };
  blueprint: { id: string; version: number; status: string; generator: CompanyBlueprint["generator"]; diff: { addedTasks: string[]; removedTasks: string[]; changedTasks: string[]; changedFields?: Record<string, string[]> } | null; body: CompanyBlueprint } | null;
  versions: { id: string; version: number; status: string; generator: string }[];
  installation: { id: string; status: string; error: { code: string } | null; blueprintId: string; blueprintVersion: number | null } | null;
  tasks: TaskView[];
  reviews: ReviewItemDto[];
  outbox: { id: string; reviewItemId: string; payload: Record<string, unknown>; provenance: string; createdAt: string }[];
  entitlement: { effective: { source: string; expiresAt: string | null } | null; devTrial: { status: string; expiresAt: string } | null; devTrialAllowed: boolean; billing: { status: string; planId: string | null } };
  prototype: { allowed: boolean; reason: string | null };
}

export interface CliJobDto {
  id: string;
  kind: "blueprint" | "text_trial";
  cli: "claude" | "codex";
  status: string;
  error: { code: string } | null;
  attempts: number;
  repairAttempts: number;
  reported: Record<string, unknown> | null;
  resultBlueprintId: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
}
