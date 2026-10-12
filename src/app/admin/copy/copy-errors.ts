import { ApiError } from "@/lib/api";

/**
 * Maps an error cause to a user-friendly translation key for the copy editor.
 * Never exposes raw server messages or stack traces to the UI.
 *
 * @param cause - The caught error (unknown type)
 * @param fallbackKey - Default translation key for save/publish errors
 * @returns A translation key under platformAdmin.copyEditor.*
 */
export function copyErrorKey(
  cause: unknown,
  fallbackKey: "platformAdmin.copyEditor.saveError" | "platformAdmin.copyEditor.publishError"
): "platformAdmin.copyEditor.conflict" | "platformAdmin.copyEditor.stepUp" | "platformAdmin.copyEditor.networkError" | "platformAdmin.copyEditor.serverError" | "platformAdmin.copyEditor.saveError" | "platformAdmin.copyEditor.publishError" {
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
 * 2. Network error (status 0) — the request never reached the server OR the response was lost
 *    (connection reset, timeout). In this case the write MAY have committed on the server, so we
 *    must refetch to reconcile.
 *
 * Validation errors (400), permission errors (401, 403), not found (404), and server errors (5xx)
 * do not trigger a refetch because either the write definitely failed (4xx) or the server state
 * is unknown but the client's revision is still valid (5xx).
 */
export function shouldRefetchAfterWriteError(cause: unknown): boolean {
  // Refetch on revision conflict OR network error (lost response where write may have committed)
  return cause instanceof ApiError && (cause.code === "REVISION_CONFLICT" || cause.isNetwork);
}
