import { HttpError } from "./http";

/**
 * Per-user limit on starting runs (sliding window, in-process). Enough for a single
 * web instance; a multi-instance deployment needs a shared store (Phase 3 release work).
 */
const WINDOW_MS = 60_000;
export const RUNS_PER_MINUTE = 30;

const g = globalThis as unknown as { __flowlineRunRate?: Map<string, number[]> };

export function checkRunRate(userId: string, now = Date.now()) {
  g.__flowlineRunRate ??= new Map();
  const hits = (g.__flowlineRunRate.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= RUNS_PER_MINUTE) {
    throw new HttpError(429, "RATE_LIMITED", `You can start at most ${RUNS_PER_MINUTE} runs per minute. Try again shortly.`);
  }
  hits.push(now);
  g.__flowlineRunRate.set(userId, hits);
}
