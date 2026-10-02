import { createHash } from "node:crypto";
import { getSetting } from "./platform-settings";
import { resolvePlatformCredential } from "./platform-secrets";
import { readEnvZitadelConfig } from "./zitadel-env";

export interface ActiveZitadelConfig {
  source: "environment" | "database";
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** DB-backed attempt fence or stable non-secret env identity revision. */
  id: string;
  revision: number;
  /** Changes when DB issuer metadata is saved; env mode derives its stable revision from issuer/client ID. */
  issuerRevision: number;
  /** Internal cache invalidator. Never include this in responses, logs, or public revisions. */
  secretFingerprint: string;
}

/**
 * Environment is the operator-managed primary source. Any partial or invalid env tuple fails closed and blocks DB
 * fallback. The prior encrypted platform setting/secret remains available only when all three env values are absent.
 */
export async function activeZitadelConfig(): Promise<ActiveZitadelConfig | null> {
  const environment = readEnvZitadelConfig();
  if (environment.status === "partial" || environment.status === "invalid") return null;
  if (environment.status === "configured") {
    return {
      source: "environment",
      ...environment.config,
      issuerRevision: environment.config.revision,
    };
  }

  const [setting, credential] = await Promise.all([getSetting("signin.zitadel.issuer"), resolvePlatformCredential("signin.zitadel")]);
  if (!setting || !credential?.publicId) return null;
  return {
    source: "database",
    issuer: setting.value,
    clientId: credential.publicId,
    clientSecret: credential.secret,
    id: credential.id,
    revision: credential.revision,
    issuerRevision: setting.revision,
    secretFingerprint: createHash("sha256").update(credential.secret).digest("hex"),
  };
}
