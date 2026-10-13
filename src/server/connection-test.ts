import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { TEST_TIMEOUT_MS, runConnectionTest } from "@/integrations/connection-test";
import { getProvider } from "@/integrations/registry";
import type { Credentials } from "@/integrations/types";
import { requireWorkspace, isUuid, type CurrentUser } from "./access";
import { openSecret, type SecretContext } from "./crypto";
import { HttpError, notFound } from "./http";

/**
 * Test connection for a SAVED connection (owner or editor: `integration.manage`; a viewer gets 403 and a non-member 404).
 *
 * There is deliberately NO caller-supplied URL or key. The stored key is only ever sent to the connection's own saved
 * base URL (for Mizano, `credentials.settings.baseUrl`); letting the caller override the URL would let it send a stored
 * secret to a host of its choosing. Changing the URL goes through the normal connect/reconnect flow, which re-saves
 * the encrypted secret. A provider's raw response text is never returned: only a bounded code and fixed message.
 */
export async function testConnection(user: CurrentUser, workspaceId: string, connectionId: string, timeoutMs = TEST_TIMEOUT_MS) {
  const { workspace } = await requireWorkspace(user, workspaceId, "integration.manage");
  if (!isUuid(connectionId)) throw notFound("Connection not found");

  const [conn] = await db
    .select()
    .from(schema.connection)
    .where(and(eq(schema.connection.id, connectionId), eq(schema.connection.workspaceId, workspace.id)));
  if (!conn) throw new HttpError(404, "CONNECTION_NOT_FOUND", "Connection not found");
  if (conn.visibility === "private" && conn.createdBy !== user.id) {
    throw new HttpError(403, "NOT_CONNECTION_OWNER", "Only the connection owner can test it");
  }

  const provider = getProvider(conn.provider);
  if (!provider) throw new HttpError(404, "UNKNOWN_PROVIDER", "Provider not found");

  const context: SecretContext = { table: "connection", rowId: conn.id, workspaceId: workspace.id, provider: conn.provider, purpose: "credentials" };
  const credentials = openSecret<Credentials>({ ciphertext: conn.secretEnc, keyId: conn.keyId, legacy: conn.legacyCrypto }, context);

  const accountLabel = await runConnectionTest(provider, credentials, timeoutMs);
  return { ok: true as const, provider: provider.name, accountLabel };
}
