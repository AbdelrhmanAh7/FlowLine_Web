import type { TaskPlan, TaskState, TrialVerdict, UserVerdict } from "./model";

/**
 * Task state (Milestone C) — computed per task, so one blocked department never makes unrelated tasks unavailable.
 * Billing status, installation status and task state are separate inputs; payment alone never makes a task active.
 */
export interface TaskStateInput {
  task: TaskPlan;
  installed: boolean;
  verdict: TrialVerdict | null;
  /** Stored ActivationDecision state, if any. */
  activation: "approval_required" | "active" | "paused" | "failed" | null;
  /** A real authorised service verified this task (never set by sample trials). */
  liveVerified?: boolean;
  /**
   * The person's own answer to "Does this result match what you wanted?" for the latest trial. Kept apart from the
   * objective checks: acceptance is not proof that every field is correct, and passing checks are not acceptance.
   */
  userVerdict?: UserVerdict | null;
}

export interface TaskStatus {
  state: TaskState;
  /** Stable reason codes (i18n `companyBuilder.reason.<code>`). */
  reasons: string[];
  /** Can the owner run a sample trial now? */
  canTry: boolean;
  /** Can the owner request activation now (entitlement is checked separately at request time)? */
  canRequestActivation: boolean;
}

export function setupReasons(task: TaskPlan): string[] {
  const r: string[] = [];
  if (task.reviewer === "unknown") r.push("reviewer_unknown");
  if (task.trigger.status === "unsupported") r.push("trigger_unsupported");
  for (const c of task.connections) if (c.status === "missing") r.push(c.provider === "ai" ? "ai_connection_missing" : "connection_missing");
  return r;
}

export function taskStatus(i: TaskStateInput): TaskStatus {
  const { task } = i;
  if (task.availability !== "operational") return { state: "plan_draft", reasons: [task.availability === "planned" ? "planned_not_operational" : "not_supported"], canTry: false, canRequestActivation: false };
  if (!i.installed) return { state: "plan_draft", reasons: ["not_installed"], canTry: false, canRequestActivation: false };
  const canTry = task.kind === "workflow";
  // VF-03 state contract: in this build no Company Builder task reads or sends through an account, connected or not.
  // Every installed state of a task that needs one says it runs on sample data only (active never implies live email).
  const sampleOnly = task.connections.some((c) => c.provider !== "ai" && c.status !== "not_needed") ? ["sample_only_not_live"] : [];
  const setup = [...setupReasons(task), ...sampleOnly];
  if (i.activation === "active") return { state: "active", reasons: sampleOnly, canTry, canRequestActivation: false };
  if (i.activation === "paused") return { state: "paused", reasons: ["paused", ...sampleOnly], canTry, canRequestActivation: Boolean(i.verdict?.matchedOutcome) && i.userVerdict === "accepted" };
  if (i.activation === "approval_required") return { state: "approval_required", reasons: ["awaiting_review", ...sampleOnly], canTry, canRequestActivation: false };
  if (i.verdict && !i.verdict.matchedOutcome) return { state: "failed", reasons: [!i.verdict.structurallyValid ? "invalid_structure" : !i.verdict.ranWithoutErrors ? "run_failed" : "outcome_not_matched", ...sampleOnly], canTry, canRequestActivation: false };
  // Setup that blocks activation (reviewer, unsupported trigger) — sample trials stay available.
  const blocking = setup.filter((r) => r === "reviewer_unknown" || r === "trigger_unsupported" || (task.kind === "agent" && r === "ai_connection_missing"));
  if (i.verdict?.matchedOutcome) {
    // Objective checks passed; the person still has to say the result is what they wanted before activation.
    if (i.userVerdict === "rejected") return { state: "requires_setup", reasons: [...setup, "result_rejected"], canTry, canRequestActivation: false };
    if (i.userVerdict !== "accepted") return { state: "requires_setup", reasons: [...setup, "result_review_needed"], canTry, canRequestActivation: false };
    if (i.liveVerified) return { state: "live_verified", reasons: sampleOnly, canTry, canRequestActivation: blocking.length === 0 };
    return { state: "sample_verified", reasons: setup, canTry, canRequestActivation: blocking.length === 0 };
  }
  return { state: "requires_setup", reasons: [...setup, ...(canTry ? ["sample_trial_needed"] : [])], canTry, canRequestActivation: false };
}
