import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getProvider } from "@/integrations/registry";
import { createProviderHttp } from "@/integrations/http";
import { ProviderError, type Credentials } from "@/integrations/types";
import { HttpError, jsonNoStore, route } from "@/server/http";
import { openSecret, type SecretContext } from "@/server/crypto";
import { requireUser, requireWorkspace } from "@/server/access";

type Ctx = { params: Promise<{ wid: string; cid: string }> };

/** A test is a UX check, not a job: it must answer quickly and never hold a worker. */
const TEST_TIMEOUT_MS = 8_000;

/**
 * Test connection (owner): verify a SAVED connection's credentials by calling the provider's `identity()`.
 *
 * There is deliberately NO request body. The stored key is only ever sent to the connection's own saved base URL
 * (for Mizano, `credentials.settings.baseUrl`); letting the caller override the URL here would let it send a stored
 * secret to a host of its choosing. Changing the URL goes through the normal connect/reconnect flow, which re-saves
 * the encrypted secret. A provider's raw response text is never returned: only a bounded code and fixed message.
 */
export const POST = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { wid, cid } = await ctx.params;
  const { workspace } = await requireWorkspace(user, wid, "integration.manage");

  const [conn] = await db
    .select()
    .from(schema.connection)
    .where(and(eq(schema.connection.id, cid), eq(schema.connection.workspaceId, workspace.id)));
  if (!conn) throw new HttpError(404, "CONNECTION_NOT_FOUND", "Connection not found");
  if (conn.visibility === "private" && conn.createdBy !== user.id) {
    throw new HttpError(403, "NOT_CONNECTION_OWNER", "Only the connection owner can test it");
  }

  const provider = getProvider(conn.provider);
  if (!provider) throw new HttpError(404, "UNKNOWN_PROVIDER", "Provider not found");

  const context: SecretContext = { table: "connection", rowId: conn.id, workspaceId: workspace.id, provider: conn.provider, purpose: "credentials" };
  const credentials = openSecret<Credentials>({ ciphertext: conn.secretEnc, keyId: conn.keyId, legacy: conn.legacyCrypto }, context);

  // A timeout signal (not a timer we clear) is what the HTTP client turns into a ProviderError("timeout").
  const signal = AbortSignal.timeout(TEST_TIMEOUT_MS);
  try {
    const identity = await provider.identity({ http: createProviderHttp(provider, credentials, signal), credentials, signal, log: () => {} });
    return jsonNoStore({ ok: true, provider: provider.name, accountLabel: identity.label });
  } catch (e) {
    throw testError(e);
  }
});

/** Provider failures become bounded codes with fixed text; the provider message and response body never reach the client. */
function testError(e: unknown): HttpError {
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
