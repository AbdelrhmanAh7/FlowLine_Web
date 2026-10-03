import { ApiError } from "@/lib/api";
import type { Translator } from "./translate";
import type { MessageKey } from "./types";

/** API error codes that have a translated, user-facing message. Anything else shows the server's own message. */
const KNOWN = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INTERNAL",
  "BAD_JSON",
  "BODY_TOO_LARGE",
  "CROSS_SITE_REQUEST",
  "INVITE_USED",
  "INVITE_REVOKED",
  "INVITE_EXPIRED",
  "INVITE_EMAIL_MISMATCH",
  "ALREADY_MEMBER",
  "EXECUTION_LIMIT",
  "QUEUE_FULL",
  "AI_KEY_REJECTED",
  "AI_KEY_INVALID",
  "AI_PROVIDER_UNREACHABLE",
  "AI_NOT_CONFIGURED",
  "AI_LOCAL_MIGRATION_REQUIRED",
  "AI_CONNECTION_REVOKED",
  "AI_PROVIDER_NOT_AVAILABLE",
  "AI_MODEL_NOT_LISTED",
  "STEP_UP_REQUIRED",
  "STEP_UP_INVALID",
  "REVISION_CONFLICT",
  "SECRET_INVALID",
  "PUBLIC_ID_INVALID",
  "SECRET_REQUIRED",
  "PUBLIC_ID_REQUIRED",
  "NOTHING_TO_CHANGE",
  "ALREADY_IMPORTED",
  "ALREADY_CONFIGURED",
  "ENV_NOT_SET",
  "REVOKE_FIRST",
  "NOT_CONFIGURED",
  "CSRF_TOKEN_INVALID",
  "PLATFORM_REAUTH_REQUIRED",
  "PLATFORM_TOTP_REQUIRED",
  "PLATFORM_EMAIL_UNVERIFIED",
  "SETUP_CHALLENGE_INVALID",
  "SETUP_WRONG_IDENTITY",
  "SETUP_EMAIL_UNVERIFIED",
  "SETTING_INVALID",
  "OAUTH_NOT_CONFIGURED",
  "EMAIL_ALREADY_CONFIGURED",
]);

/**
 * Turns an API error into a message in the UI language: known `code`s map to the catalogue, network failures and
 * 5xx get a generic translated line, and everything else falls back to the server's message (then `fallback`).
 * A VALIDATION error is only translated when the server gave no specific reason ("Invalid request").
 */
export function apiErrorMessage(t: Translator, err: unknown, fallback?: string): string {
  if (err instanceof ApiError) {
    if (err.isNetwork || err.code === "NETWORK") return t("errors.NETWORK");
    if (KNOWN.has(err.code)) return t(`errors.${err.code}` as MessageKey);
    // AI hub codes share the catalogue with run errors; keep these translated even when an endpoint
    // returns a less common hub code instead of one of the workspace API's short error codes.
    const aiKey = `aiHub.errors.${err.code}`;
    if (err.code.startsWith("AI_") && t.has(aiKey)) return t(aiKey as MessageKey);
    if (err.code === "VALIDATION" && (!err.message || err.message === "Invalid request")) return t("errors.VALIDATION");
    if (err.status >= 500 && /^HTTP_5\d\d$/.test(err.code)) return t("errors.server");
    return err.message || fallback || t("errors.generic");
  }
  return fallback ?? t("errors.generic");
}
