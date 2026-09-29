import type { schema } from "@/db";
import { decryptSecretV2, encryptSecretV2, type SecretContext } from "@/server/crypto";
import type { Credentials } from "./protocols";
import { HubError } from "./types";

type Conn = typeof schema.aiConnection.$inferSelect;

/**
 * Credential handling for AI connections.
 * - Encrypted with the v2 format: the ciphertext is bound (AES-GCM AAD) to this exact row, workspace, provider and
 *   purpose, so a blob copied to another row or workspace does not decrypt. v1 (context-free) blobs are refused.
 * - Decrypted server-side only, per call, from the row just read — there is NO credential or client cache, so a
 *   replaced or revoked key takes effect on the very next call.
 * - Model-provider environment variables are never read here or anywhere on a tenant path.
 */
interface StoredAiSecret {
  apiKey: string;
}

export function aiSecretContext(c: { id: string; workspaceId: string; provider: string }): SecretContext {
  return { table: "ai_connection", rowId: c.id, workspaceId: c.workspaceId, provider: c.provider, purpose: "api_key" };
}

export function encryptAiKey(apiKey: string, c: { id: string; workspaceId: string; provider: string }) {
  return encryptSecretV2({ apiKey } satisfies StoredAiSecret, aiSecretContext(c));
}

/** Keys shorter than this don't get a last-4 hint (4 characters of a short key are too large a share of it). */
export const KEY_HINT_MIN_LENGTH = 32;

/**
 * Masked indicator stored at save time (security review): the last 4 characters only for keys of at least
 * KEY_HINT_MIN_LENGTH characters; otherwise only the date it was set ("set:YYYY-MM-DD", rendered by the UI).
 */
export function keyHint(apiKey: string, at: Date = new Date()) {
  return apiKey.length >= KEY_HINT_MIN_LENGTH ? `••••${apiKey.slice(-4)}` : `set:${at.toISOString().slice(0, 10)}`;
}

export function loadCredentials(conn: Conn): Credentials {
  if (conn.status === "REVOKED" || !conn.secretEnc || !conn.keyId) throw new HubError("AI_CONNECTION_REVOKED", `The AI connection "${conn.label}" was disconnected. Choose another connection or reconnect it in Settings → AI Providers.`);
  if (!conn.secretEnc.startsWith("v2.")) throw new HubError("AI_CREDENTIAL_UNREADABLE", `The key of "${conn.label}" can't be read. Replace the key in Settings → AI Providers.`);
  let s: StoredAiSecret;
  try {
    s = decryptSecretV2<StoredAiSecret>(conn.secretEnc, conn.keyId, aiSecretContext(conn));
  } catch {
    throw new HubError("AI_CREDENTIAL_UNREADABLE", `The key of "${conn.label}" can't be read. Replace the key in Settings → AI Providers.`);
  }
  if (typeof s?.apiKey !== "string" || !s.apiKey) throw new HubError("AI_CREDENTIAL_UNREADABLE", `The key of "${conn.label}" can't be read. Replace the key in Settings → AI Providers.`);
  return { apiKey: s.apiKey, settings: conn.settings ?? {} };
}

/** Validates the shape of a pasted API key (never logged). */
export function validateApiKey(raw: unknown): string {
  const k = typeof raw === "string" ? raw.trim() : "";
  if (k.length < 8 || k.length > 512 || /\s/.test(k)) throw new HubError("AI_KEY_INVALID", "Paste the API key exactly as the provider shows it (8–512 characters, no spaces)");
  return k;
}
