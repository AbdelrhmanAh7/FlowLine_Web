/** Full-jitter exponential backoff, bounded; honours Retry-After (capped). */
export function backoffMs(attempt: number, retryAfterMs?: number, baseMs = 500, capMs = 8000) {
  if (retryAfterMs != null) return Math.min(retryAfterMs, 30_000);
  const exp = Math.min(capMs, baseMs * 2 ** (attempt - 1));
  return Math.round(Math.random() * exp);
}

export function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason ?? new Error("aborted"));
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export const MAX_ATTEMPTS_CAP = 5;
export function attemptsFor(cfg?: { maxAttempts?: number }) {
  const n = Math.trunc(cfg?.maxAttempts ?? 3);
  return Math.min(Math.max(1, n || 1), MAX_ATTEMPTS_CAP);
}
