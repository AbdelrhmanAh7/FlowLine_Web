import { createHash } from "node:crypto";
import { purposeDef } from "./platform-purposes";
import { zitadelIssuerSchema } from "./platform-setting-schemas";

export interface EnvZitadelConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Stable non-secret app identity used to fence outstanding sign-in attempts. */
  id: string;
  /** Stable non-secret revision for this issuer/client pair. */
  revision: number;
  /** Internal cache invalidator only; never serialized, logged, or returned from an endpoint. */
  secretFingerprint: string;
}

export type EnvZitadelState = { status: "absent" | "partial" | "invalid" } | { status: "configured"; config: EnvZitadelConfig };

function uuidFromIdentity(digest: Buffer) {
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Pure environment parsing: any partial or malformed env configuration blocks fallback to the optional DB source. */
export function readEnvZitadelConfig(env: NodeJS.ProcessEnv = process.env): EnvZitadelState {
  const raw = [env.ZITADEL_ISSUER, env.ZITADEL_CLIENT_ID, env.ZITADEL_CLIENT_SECRET];
  const present = raw.map((value) => value !== undefined && value !== "");
  if (!present.some(Boolean)) return { status: "absent" };
  if (!present.every(Boolean)) return { status: "partial" };

  const [issuer, clientId, clientSecret] = raw as [string, string, string];
  const def = purposeDef("signin.zitadel");
  if (
    issuer !== issuer.trim() ||
    !zitadelIssuerSchema.safeParse(issuer).success ||
    !def?.publicId?.pattern.test(clientId) ||
    clientId !== clientId.trim() ||
    clientSecret !== clientSecret.trim() ||
    clientSecret.length < (def?.secret.min ?? 8) ||
    clientSecret.length > (def?.secret.max ?? 512) ||
    /[\0-\x1f\x7f]/.test(clientSecret)
  ) return { status: "invalid" };

  const identity = createHash("sha256").update(`zitadel\0${issuer}\0${clientId}`).digest();
  const revision = (identity.readUInt32BE(16) & 0x7fffffff) || 1;
  return {
    status: "configured",
    config: {
      issuer,
      clientId,
      clientSecret,
      id: uuidFromIdentity(identity),
      revision,
      // This digest stays inside the server auth-cache key; don't include it in public status or diagnostics.
      secretFingerprint: createHash("sha256").update(clientSecret).digest("hex"),
    },
  };
}
