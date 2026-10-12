import { z } from "zod";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getProvider } from "@/integrations/registry";
import { createProviderHttp } from "@/integrations/http";
import { HttpError, jsonNoStore, parseBody, route } from "@/server/http";
import { encryptSecretV2, openSecret, type SecretContext } from "@/server/crypto";
import { requireUser, requireWorkspace } from "@/server/access";
import { randomUUID } from "node:crypto";
import type { Credentials } from "@/integrations/types";

type ConnRow = typeof schema.connection.$inferSelect;
type StoredSecret = Credentials;

type Ctx = { params: Promise<{ wid: string; cid: string }> };

const body = z.object({
  baseUrl: z.string().url().optional(),
});

/**
 * Test a regular connection (API key / basic / connection string):
 * calls the provider's identity() method with the provided credentials.
 * Returns OK for success, or a clear error (401, unreachable, etc.).
 */
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { wid, cid } = await ctx.params;
  const { workspace } = await requireWorkspace(user, wid, "integration.manage");

  const b = await parseBody(req, body);

  // Fetch the connection
  const [conn] = await db
    .select()
    .from(schema.connection)
    .where(and(eq(schema.connection.id, cid), eq(schema.connection.workspaceId, workspace.id)));

  if (!conn) {
    throw new HttpError(404, "CONNECTION_NOT_FOUND", `Connection ${cid} not found`);
  }

  if (conn.visibility === "private" && conn.createdBy !== user.id) {
    throw new HttpError(403, "NOT_CONNECTION_OWNER", "Only the connection owner can test it");
  }

  const provider = getProvider(conn.provider);
  if (!provider) {
    throw new HttpError(404, "UNKNOWN_PROVIDER", `Provider ${conn.provider} not found`);
  }

  // Decrypt the stored credentials
  const context: SecretContext = {
    table: "connection",
    rowId: conn.id,
    workspaceId: workspace.id,
    provider: conn.provider,
    purpose: "credentials",
  };
  const creds = openSecret<StoredSecret>({
    ciphertext: conn.secretEnc,
    keyId: conn.keyId,
    legacy: conn.legacyCrypto,
  }, context);

  // Override baseUrl if provided in the test request
  if (b.baseUrl) {
    creds.settings = { ...creds.settings, baseUrl: b.baseUrl };
  }

  // Use the provider's http client with a short timeout
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 10000); // 10s timeout

  try {
    const http = createProviderHttp(provider, creds, ac.signal);

    // Call the provider's identity method to verify credentials
    const identity = await provider.identity({ http, credentials: creds, signal: ac.signal, log: () => {} });

    // Success
    return jsonNoStore({
      ok: true,
      message: "Connection successful",
      accountId: identity.accountId,
      accountLabel: identity.label,
      provider: provider.name,
    });
  } catch (e) {
    clearTimeout(timeoutId);

    // Convert provider errors to HTTP errors
    if (e instanceof HttpError) {
      throw e;
    }

    if (e instanceof Error) {
      // Check if it's an authentication error (401/403)
      if (e.message.includes("401") || e.message.includes("unauthorized") || e.message.includes("authentication failed")) {
        throw new HttpError(400, "AUTHENTICATION_FAILED", `Invalid credentials: ${e.message}`);
      }

      // Check if it's a network error
      if (e.message.includes("ECONNREFUSED") || e.message.includes("ENOTFOUND") || e.message.includes("ETIMEDOUT")) {
        throw new HttpError(502, "PROVIDER_UNREACHABLE", `Cannot reach ${provider.name}: ${e.message}`);
      }

      // Generic provider error
      throw new HttpError(502, "PROVIDER_ERROR", `Provider error: ${e.message}`);
    }

    throw new HttpError(500, "INTERNAL_ERROR", "Unexpected error during connection test");
  }
});
