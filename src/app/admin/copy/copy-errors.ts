import { ApiError } from "@/lib/api";

/** The message key a failed save or publish falls back to. */
export type CopyWriteFallbackKey = "platformAdmin.copyEditor.saveError" | "platformAdmin.copyEditor.publishError";
/** Every message key a failed save or publish can show. */
export type CopyErrorKey = CopyWriteFallbackKey | "platformAdmin.copyEditor.conflict" | "platformAdmin.copyEditor.stepUp" | "platformAdmin.copyEditor.networkError" | "platformAdmin.copyEditor.serverError";

/**
 * Maps an error cause to a user-friendly translation key for the copy editor.
 * Never exposes raw server messages or stack traces to the UI.
 *
 * @param cause - The caught error (unknown type)
 * @param fallbackKey - Default translation key for save/publish errors
 * @returns A translation key under platformAdmin.copyEditor.*
 */
export function copyErrorKey(cause: unknown, fallbackKey: CopyWriteFallbackKey): CopyErrorKey {
  if (cause instanceof ApiError) {
    // Revision conflict (409) — the draft changed since load
    if (cause.code === "REVISION_CONFLICT") {
      return "platformAdmin.copyEditor.conflict";
    }
    // Step-up required — need to re-authenticate
    if (cause.code === "STEP_UP_REQUIRED") {
      return "platformAdmin.copyEditor.stepUp";
    }
    // Network error — never reached the server
    if (cause.isNetwork) {
      return "platformAdmin.copyEditor.networkError";
    }
    // Server error (5xx) — internal server problem
    if (cause.status >= 500) {
      return "platformAdmin.copyEditor.serverError";
    }
    // Other API errors (4xx) — use fallback
    return fallbackKey;
  }
  // Non-API errors (e.g., thrown strings, TypeError) — use fallback
  return fallbackKey;
}

/**
 * Whether the editor must refetch the copy state after a failed write.
 *
 * We refetch in two cases where the client's revision may be stale:
 * 1. Revision conflict (409 REVISION_CONFLICT) — the draft was modified by another session.
 * 2. Network failure (status 0) — the request outcome is unknown, so the write MAY have committed on the
 *    server and we must reconcile. `api()` in `src/lib/api.ts` reports every ambiguous failure as status 0:
 *    it wraps both a rejected `fetch()` and a `res.text()` that rejects because the connection dropped while
 *    the response body was being read (headers already received, body lost), so neither escapes this predicate.
 *
 * Validation errors (400), permission errors (401, 403), not found (404), and server errors (5xx)
 * do not trigger a refetch because either the write definitely failed (4xx) or the server state
 * is unknown but the client's revision is still valid (5xx).
 */
export function shouldRefetchAfterWriteError(cause: unknown): boolean {
  // Only api() failures reach the editor; api() normalises every ambiguous outcome (a rejected fetch()
  // and a res.text() that rejects mid-read) to a status-0 network ApiError, so isNetwork covers both.
  if (!(cause instanceof ApiError)) return false;
  // Refetch on revision conflict OR network failure (outcome unknown: the write may have committed).
  return cause.code === "REVISION_CONFLICT" || cause.isNetwork;
}

/** The editor state and queries `handleWriteError` reads and updates (CopyEditor passes its own). */
export interface WriteErrorEffects {
  t: (key: CopyErrorKey) => string;
  setError: (message: string) => void;
  setStepUpActive: (active: boolean) => void;
  refetchMe: () => Promise<{ data?: { stepUpUntil: string | null } }>;
  refetchCopy: () => Promise<unknown>;
}

/**
 * The copy editor's response to a failed save or publish.
 *
 * A step-up refusal re-reads the admin session and keeps the write buttons enabled only while the refreshed
 * step-up is still valid. The copy state is refetched when `shouldRefetchAfterWriteError` says the loaded
 * revision may be stale. Then the alert shows the translated `copyErrorKey` message, never the server's text.
 */
export async function handleWriteError(cause: unknown, fallbackKey: CopyWriteFallbackKey, fx: WriteErrorEffects): Promise<void> {
  if (cause instanceof ApiError && cause.code === "STEP_UP_REQUIRED") {
    const refreshed = await fx.refetchMe();
    const expiresAt = refreshed.data?.stepUpUntil ? Date.parse(refreshed.data.stepUpUntil) : Number.NaN;
    fx.setStepUpActive(Number.isFinite(expiresAt) && expiresAt > Date.now());
  }
  if (shouldRefetchAfterWriteError(cause)) await fx.refetchCopy();
  fx.setError(fx.t(copyErrorKey(cause, fallbackKey)));
}
