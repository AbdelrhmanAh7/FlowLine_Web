import type { Translator } from "@/i18n/translate";
import type { MessageKey } from "@/i18n/types";
import type { RunDetailDto, RunStepDto } from "./types";

/** Steps that wait on an external provider (network, AI, app actions). */
const PROVIDER_BOUND = /^(http\.request|ai\.|integration\.action)/;
/** After this long a provider-bound step is shown as degraded ("provider slow"), not failed. */
export const SLOW_AFTER_MS = 8_000;

const RETRY_REASON: Record<string, string> = {
  rate_limit: "rate limited",
  server: "provider error",
  timeout: "timed out",
  network: "network error",
  response_lost: "no response",
};

/**
 * The degraded-state text for a running step (design slide 13: "Running… 12s · provider slow").
 * Built only from real data: the step's start time and the run's retry events.
 * Pass the UI translator to get the text in the user's language; without it the text is English.
 */
export function runningDetail(step: RunStepDto, events: RunDetailDto["events"], now: number, t?: Translator): { text: string; degraded: boolean } {
  const elapsed = step.startedAt ? Math.max(0, now - new Date(step.startedAt).getTime()) : 0;
  const n = Math.floor(elapsed / 1000);
  const secs = t ? t("runningDetail.secs", { n: t.number(n) }) : `${n}s`;
  const retries = (events ?? []).filter((e) => e.type === "step_retry" && e.nodeId === step.nodeId);
  if (retries.length > 0) {
    const kind = (retries.at(-1)!.data as { kind?: string } | null)?.kind ?? "";
    if (t) {
      const reason = t(Object.hasOwn(RETRY_REASON, kind) ? (`runningDetail.reasons.${kind}` as MessageKey) : "runningDetail.reasons.transient");
      return { text: t("runningDetail.retry", { secs, attempt: t.number(retries.length + 1), reason }), degraded: true };
    }
    return { text: `Running… ${secs} · retry ${retries.length + 1} (${Object.hasOwn(RETRY_REASON, kind) ? RETRY_REASON[kind] : "transient error"})`, degraded: true };
  }
  if (PROVIDER_BOUND.test(step.nodeType) && elapsed >= SLOW_AFTER_MS) return { text: t ? t("runningDetail.slow", { secs }) : `Running… ${secs} · provider slow`, degraded: true };
  if (t) return { text: elapsed >= 1000 ? t("runningDetail.runningFor", { secs }) : t("runningDetail.running"), degraded: false };
  return { text: elapsed >= 1000 ? `Running… ${secs}` : "Running…", degraded: false };
}
