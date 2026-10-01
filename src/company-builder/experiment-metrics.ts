import { z } from "zod";
import type { AnswerRecord, CompanyBlueprint, TrialVerdict } from "./model";

/**
 * Experiment-mode metric definitions (pure; the server loads the inputs). Definitions are documented in
 * docs/company-builder/COMPETITIVE_TEST_PROTOCOL.md §Metrics. Event payloads are bounded numbers or enum ids only.
 */

/** Client heartbeat cap: one event may add at most this many seconds (a stuck tab can't inflate active time). */
export const ACTIVE_SLICE_MAX_S = 60;

export const clientEventBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("active_time"), seconds: z.number().int().min(1).max(ACTIVE_SLICE_MAX_S) }),
  z.object({ kind: z.literal("help_opened"), topic: z.enum(["question_reason", "plan_cost", "result_checks", "advanced"]) }),
]);
export const effortBody = z.object({ kind: z.enum(["support", "external_delay"]), minutes: z.number().int().min(1).max(24 * 60) });

export interface MetricInputs {
  sessionCreatedAt: Date;
  answers: AnswerRecord[];
  /** Plan versions, oldest first. */
  plans: { createdAt: Date; body: CompanyBlueprint }[];
  trials: { createdAt: Date; completedAt: Date | null; verdict: TrialVerdict | null; userVerdict: string | null; userVerdictAt: Date | null }[];
  events: { kind: string; data: Record<string, unknown>; at: Date }[];
  /** CLI-reported cost (owner prototype only); never estimated. */
  cliReportedUsd: number[];
  /** Non-trial runs of the installed flows (reuse). */
  laterRuns: Date[];
  now: Date;
}

const secs = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
const DAY = 86_400_000;

/**
 * Pure metric computation (unit-tested). Each quantity is counted in exactly one bucket: active time is the person's,
 * waiting time is the system's, external delays and support are owner-logged, AI cost is only what a CLI reported.
 */
export function computeMetrics(i: MetricInputs) {
  const firstPlan = i.plans[0] ?? null;
  const questionsToPreview = firstPlan ? new Set(i.answers.filter((a) => new Date(a.at) <= firstPlan.createdAt).map((a) => a.questionId)).size : null;
  const accepted = i.trials.filter((t) => t.userVerdict === "accepted" && t.userVerdictAt);
  const firstVerified = accepted.filter((t) => t.verdict?.matchedOutcome).sort((a, b) => a.userVerdictAt!.getTime() - b.userVerdictAt!.getTime())[0] ?? null;
  const firstAcceptedAt = accepted.map((t) => t.userVerdictAt!).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  // An "edit" is a CHANGE to a question already answered earlier (a first answer to a later question isn't an edit).
  const editsBeforeAccepted = firstPlan
    ? i.answers.filter((a, idx) => new Date(a.at) > firstPlan.createdAt && (!firstAcceptedAt || new Date(a.at) <= firstAcceptedAt) && i.answers.slice(0, idx).some((p) => p.questionId === a.questionId)).length
    : null;
  const latest = i.plans.at(-1)?.body ?? null;
  const connectionsRequired = latest ? new Set(latest.tasks.flatMap((t) => t.connections.filter((c) => c.status === "missing").map((c) => c.provider))).size : null;
  const sum = (kind: string, field: string) => i.events.filter((e) => e.kind === kind).reduce((n, e) => n + (Number(e.data[field]) || 0), 0);
  const reuseWindow = firstVerified ? { from: new Date(firstVerified.userVerdictAt!.getTime() + DAY), to: new Date(firstVerified.userVerdictAt!.getTime() + 8 * DAY) } : null;
  return {
    timeToPlanPreviewS: firstPlan ? secs(i.sessionCreatedAt, firstPlan.createdAt) : null,
    questionsToPreview,
    editsBeforeFirstAcceptedResult: editsBeforeAccepted,
    connectionsRequired,
    timeToFirstVerifiedResultS: firstVerified ? secs(i.sessionCreatedAt, firstVerified.userVerdictAt!) : null,
    activeUserTimeS: sum("active_time", "seconds"),
    systemWaitingTimeS: i.trials.reduce((n, t) => n + (t.completedAt ? secs(t.createdAt, t.completedAt) : 0), 0),
    externalOnboardingDelayMin: sum("external_delay_minutes", "minutes"),
    supportTimeMin: sum("support_minutes", "minutes"),
    helpOpened: i.events.filter((e) => e.kind === "help_opened").length,
    cost: {
      /** Only what an owner CLI job reported; customer packs use no AI. */
      aiReportedUsd: i.cliReportedUsd.length ? Math.round(i.cliReportedUsd.reduce((a, b) => a + b, 0) * 10000) / 10000 : 0,
      /** Platform charges are not measured in the sandbox — stated, never estimated. */
      platformCharges: null,
      supportEffortMin: sum("support_minutes", "minutes"),
    },
    results: { accepted: i.trials.filter((t) => t.userVerdict === "accepted").length, rejected: i.trials.filter((t) => t.userVerdict === "rejected").length, notJudged: i.trials.filter((t) => t.completedAt && !t.userVerdict).length },
    /** Reuse in the following week: a non-trial run of the installed flow 1–8 days after the first verified result. */
    reusedFollowingWeek: !reuseWindow ? null : i.laterRuns.some((d) => d >= reuseWindow.from && d < reuseWindow.to) ? true : i.now < reuseWindow.to ? "pending" : false,
  };
}

