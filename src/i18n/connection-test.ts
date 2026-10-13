import { ApiError } from "@/lib/api";
import { apiErrorMessage } from "./errors";
import type { Translator } from "./translate";

/** A failed connection test shows a fixed, translated line per bounded code — never the provider's own text. */
export function connectionTestErrorText(t: Translator, err: unknown): string {
  const code = err instanceof ApiError ? err.code : null;
  if (code === "AUTHENTICATION_FAILED") return t("integrations.card.testAuthFailed");
  if (code === "PROVIDER_UNREACHABLE") return t("integrations.card.testUnreachable");
  return apiErrorMessage(t, err, t("integrations.card.testError"));
}
