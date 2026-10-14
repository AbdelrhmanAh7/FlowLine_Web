import { ApiError } from "@/lib/api";

/** The message key a failed save or publish falls back to. */
export type CopyWriteFallbackKey = "platformAdmin.copyEditor.saveError" | "platformAdmin.copyEditor.publishError";
/** Every message key a failed save or publish can show. */
export type CopyErrorKey = CopyWriteFallbackKey | "platformAdmin.copyEditor.conflict" | "platformAdmin.copyEditor.stepUp" | "platformAdmin.copyEditor.networkError" | "platformAdmin.copyEditor.serverError" | "platformAdmin.copyEditor.reauthRequired" | "platformAdmin.copyEditor.rateLimited";

/** The admin session is no longer accepted (older than 24 hours, or its authenticator challenge is gone): only signing in again helps. */
function isSessionRefusal(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.code === "PLATFORM_REAUTH_REQUIRED" || cause.code === "PLATFORM_MFA_REQUIRED");
}

/** The server refused the write for volume (429), before touching the draft. */
function isRateLimit(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.status === 429 || cause.code === "RATE_LIMITED");
}

/** The translated message key for a failed save or publish; the server's own text is never shown. */
function copyErrorKey(cause: unknown, fallbackKey: CopyWriteFallbackKey): CopyErrorKey {
  if (!(cause instanceof ApiError)) return fallbackKey;
  if (cause.code === "REVISION_CONFLICT") return "platformAdmin.copyEditor.conflict";
  if (cause.code === "STEP_UP_REQUIRED") return "platformAdmin.copyEditor.stepUp";
  if (isSessionRefusal(cause)) return "platformAdmin.copyEditor.reauthRequired";
  if (isRateLimit(cause)) return "platformAdmin.copyEditor.rateLimited";
  if (cause.isNetwork) return "platformAdmin.copyEditor.networkError";
  return cause.status >= 500 ? "platformAdmin.copyEditor.serverError" : fallbackKey;
}

/** The editor state and queries `handleWriteError` reads and updates (CopyEditor passes its own). */
export interface WriteErrorEffects {
  t: (key: CopyErrorKey) => string;
  setError: (message: string) => void;
  setStepUpActive: (active: boolean) => void;
  refetchMe: () => Promise<{ data?: { stepUpUntil: string | null }; isError?: boolean; error?: unknown }>;
  refetchCopy: () => Promise<unknown>; // TanStack's refetch: it never rejects, so it may run unawaited
}

/**
 * The copy editor's response to a failed save or publish. The translated message comes first. A step-up refusal then
 * re-reads the admin session and keeps the write buttons enabled only while the refreshed step-up is valid. Any other
 * failure starts a reload of the copy state, because the loaded revision may be stale (a conflict) or the write may have
 * committed (a lost or cut-off response, a gateway timeout). Two refusals happen before the server touches the draft, so a
 * reload could not help: an expired admin session (reauth or MFA) disables the write buttons and re-reads the session, and a rate
 * limit (429) only shows its message (the admin can retry after a minute). The reload is not awaited: TanStack retries it with backoff
 * and pauses it offline, which would keep the editor locked; CopyEditor disables Save and Apply while it fetches.
 */
export async function handleWriteError(cause: unknown, fallbackKey: CopyWriteFallbackKey, fx: WriteErrorEffects): Promise<void> {
  fx.setError(fx.t(copyErrorKey(cause, fallbackKey)));
  if (cause instanceof ApiError && cause.code === "STEP_UP_REQUIRED") {
    const refreshed = await fx.refetchMe();
    const isSuccess = !refreshed.isError && !refreshed.error;
    const expiresAt = isSuccess && refreshed.data?.stepUpUntil ? Date.parse(refreshed.data.stepUpUntil) : Number.NaN;
    fx.setStepUpActive(Number.isFinite(expiresAt) && expiresAt > Date.now());
  } else if (isSessionRefusal(cause)) {
    fx.setStepUpActive(false);
    void fx.refetchMe(); // TanStack's refetch never rejects
  } else if (!isRateLimit(cause)) {
    void fx.refetchCopy();
  }
}
