import { createProviderHttp } from "./http";
import { ProviderError, type Credentials, type ProviderDef } from "./types";
import { HttpError } from "@/server/http";

/** A test is a UX check, not a job: it must answer quickly and never hold a worker. */
export const TEST_TIMEOUT_MS = 8_000;

/**
 * Runs the provider's own connection check (`identity()`, which for Mizano is `GET /api/health` then `GET /api/me`)
 * with `credentials` and a deadline, and returns the label of the account it reached. Failures are `HttpError`s with a
 * bounded code and fixed text (see `testError`).
 */
export async function runConnectionTest(provider: ProviderDef, credentials: Credentials, timeoutMs = TEST_TIMEOUT_MS) {
  // A timeout signal (not a timer we would have to clear) is what the HTTP client turns into a ProviderError("timeout").
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const identity = await provider.identity({ http: createProviderHttp(provider, credentials, signal), credentials, signal, log: () => {} });
    return identity.label;
  } catch (e) {
    throw testError(e);
  }
}

/** Provider failures become bounded codes with fixed text; the provider message and response body never reach the client. */
export function testError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof ProviderError) {
    if (e.kind === "auth") return new HttpError(400, "AUTHENTICATION_FAILED", "Invalid API key");
    if (e.kind === "egress_blocked") return new HttpError(400, "EGRESS_BLOCKED", "That URL is not allowed");
    if (e.kind === "timeout" || e.kind === "network" || e.kind === "response_lost") {
      return new HttpError(502, "PROVIDER_UNREACHABLE", "The provider could not be reached");
    }
    return new HttpError(502, "PROVIDER_ERROR", "The provider returned an unexpected error");
  }
  return new HttpError(502, "PROVIDER_ERROR", "The provider returned an unexpected error");
}
