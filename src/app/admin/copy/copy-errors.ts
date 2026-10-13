import { ApiError } from "@/lib/api";

/** The message key a failed save or publish falls back to. */
export type CopyWriteFallbackKey = "platformAdmin.copyEditor.saveError" | "platformAdmin.copyEditor.publishError";
/** Every message key a failed save or publish can show. */
export type CopyErrorKey = CopyWriteFallbackKey | "platformAdmin.copyEditor.conflict" | "platformAdmin.copyEditor.stepUp" | "platformAdmin.copyEditor.networkError" | "platformAdmin.copyEditor.serverError";

/** The translated message key for a failed save or publish; the server's own text is never shown. */
function copyErrorKey(cause: unknown, fallbackKey: CopyWriteFallbackKey): CopyErrorKey {
  if (!(cause instanceof ApiError)) return fallbackKey;
  if (cause.code === "REVISION_CONFLICT") return "platformAdmin.copyEditor.conflict";
  if (cause.code === "STEP_UP_REQUIRED") return "platformAdmin.copyEditor.stepUp";
  if (cause.isNetwork) return "platformAdmin.copyEditor.networkError";
  return cause.status >= 500 ? "platformAdmin.copyEditor.serverError" : fallbackKey;
}

/** The editor state and queries `handleWriteError` reads and updates (CopyEditor passes its own). */
export interface WriteErrorEffects {
  t: (key: CopyErrorKey) => string;
  setError: (message: string) => void;
  setStepUpActive: (active: boolean) => void;
  refetchMe: () => Promise<{ data?: { stepUpUntil: string | null } }>;
  refetchCopy: () => Promise<unknown>; // TanStack's refetch: it never rejects, so it may run unawaited
}

/**
 * The copy editor's response to a failed save or publish. The translated message comes first. A step-up refusal then
 * re-reads the admin session and keeps the write buttons enabled only while the refreshed step-up is valid. Any other
 * failure starts a reload of the copy state, because the loaded revision may be stale (a conflict) or the write may have
 * committed (a lost or cut-off response, a gateway timeout). The reload is not awaited: TanStack retries it with backoff
 * and pauses it offline, which would keep the editor locked; CopyEditor disables Save and Apply while it fetches.
 */
export async function handleWriteError(cause: unknown, fallbackKey: CopyWriteFallbackKey, fx: WriteErrorEffects): Promise<void> {
  fx.setError(fx.t(copyErrorKey(cause, fallbackKey)));
  if (cause instanceof ApiError && cause.code === "STEP_UP_REQUIRED") {
    const refreshed = await fx.refetchMe();
    const expiresAt = refreshed.data?.stepUpUntil ? Date.parse(refreshed.data.stepUpUntil) : Number.NaN;
    fx.setStepUpActive(Number.isFinite(expiresAt) && expiresAt > Date.now());
  } else {
    void fx.refetchCopy();
  }
}
