import { z } from "zod";
import { createProviderHttp } from "./http";
import { ProviderError, type Credentials, type ProviderDef, type ProviderHttp } from "./types";
import { HttpError } from "@/server/http";
import { checkUrl, EgressError } from "@/server/egress";

/** A test is a UX check, not a job: it must answer quickly and never hold a worker. */
export const TEST_TIMEOUT_MS = 8_000;

// GET /api/health: the instance is up and answering. Anything else (HTML from a proxy, `{}`, an unhealthy status) is
// not a Mizano that can be connected, so a 200 alone is not trusted.
const HEALTHY = new Set(["ok", "healthy", "up"]);
const mizanoHealth = z.object({ status: z.string() }).refine((h) => HEALTHY.has(h.status.toLowerCase()));

function mizanoBase(creds: Credentials): string {
  const raw = creds.settings?.baseUrl;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ProviderError("client", "Mizano connection settings missing baseUrl");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderError("client", "Mizano base URL must be a full https URL");
  }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new ProviderError("client", "Mizano base URL must be an https origin with no path");
  }
  try {
    checkUrl(url);
  } catch (e) {
    if (e instanceof EgressError) throw new ProviderError("egress_blocked", `Mizano base URL refused: ${e.message}`);
    throw e;
  }
  return url.origin;
}

/**
 * Runs the provider's connection check (`GET /api/health` then `GET /api/me` for Mizano) with `credentials`
 * and a deadline, and returns the label of the account it reached. Failures are `HttpError`s with a bounded code
 * and fixed text (see `testError`).
 */
export async function runConnectionTest(provider: ProviderDef, credentials: Credentials, timeoutMs = TEST_TIMEOUT_MS, customHttp?: ProviderHttp) {
  // A timeout signal (not a timer we would have to clear) is what the HTTP client turns into a ProviderError("timeout").
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const http = customHttp ?? createProviderHttp(provider, credentials, signal);
    if (provider.id === "mizano") {
      const baseUrl = mizanoBase(credentials);
      const health = await http.request<unknown>({ method: "GET", path: "/api/health", baseUrl });
      if (!mizanoHealth.safeParse(health.data).success) throw new ProviderError("server", "Mizano reported that it is not healthy");
    }
    const identity = await provider.identity({ http, credentials, signal, log: () => {} });
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
