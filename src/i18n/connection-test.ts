import { ApiError } from "@/lib/api";
import { apiErrorMessage } from "./errors";
import type { Translator } from "./translate";
import type { MessageKey } from "./types";

/** Every code the Test connection route sends besides the generic ones `apiErrorMessage` already translates. */
const TEST_ERROR_KEYS: Partial<Record<string, MessageKey>> = {
  AUTHENTICATION_FAILED: "integrations.card.testAuthFailed",
  PROVIDER_UNREACHABLE: "integrations.card.testUnreachable",
  PROVIDER_ERROR: "integrations.card.testProviderError",
  EGRESS_BLOCKED: "integrations.card.testEgressBlocked",
  NOT_CONNECTION_OWNER: "integrations.card.testNotOwner",
  CONNECTION_NOT_FOUND: "integrations.card.testGone",
  UNKNOWN_PROVIDER: "integrations.card.testUnavailable",
  TEST_NOT_SUPPORTED: "integrations.card.testUnavailable",
};

/** A failed connection test shows a fixed, translated line per bounded code — never the provider's own text. */
export function connectionTestErrorText(t: Translator, err: unknown): string {
  const key = err instanceof ApiError ? TEST_ERROR_KEYS[err.code] : undefined;
  return key ? t(key) : apiErrorMessage(t, err, t("integrations.card.testError"));
}
