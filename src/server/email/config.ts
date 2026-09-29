import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting, settingEnvPresent } from "@/server/platform-settings";
import { markPlatformSecretVerified, platformCredentialStatus, resolvePlatformCredential } from "@/server/platform-secrets";
import { EmailDeliveryError, type EmailTransportConfig } from "./index";

export interface EmailDelivery {
  /** null = the test/staging outbox selected by the environment. */
  transport: EmailTransportConfig | null;
  /** Comma-joined allowlist rules (empty = no restriction). */
  allowlist: string;
  /** Set while platform setup is incomplete and the email credential came from the setup session. */
  onlyRecipient: string | null;
  onDelivered?: () => Promise<void>;
}

/** Email configuration for ONE send, from the platform panel's DB records (no cache, no environment fallback). */
export async function resolveEmailDelivery(): Promise<EmailDelivery> {
  const allow = await getSetting("email.allowed_recipients");
  const allowlist = (allow?.value ?? []).join(",");
  const active = await getSetting("email.provider");
  // No real provider selected: the environment may select the test/staging outbox (nothing reaches a real inbox).
  if (!active?.value) return { transport: null, allowlist, onlyRecipient: null };
  if (!allow && settingEnvPresent("email.allowed_recipients")) {
    // Fail closed: an operator-set recipient sandbox must be imported into the panel before real mail is sent.
    throw new EmailDeliveryError("The email recipient allowlist is still in the environment — import it in the platform panel first.");
  }
  const purpose = `email.${active.value}`;
  const cred = await resolvePlatformCredential(purpose);
  if (!cred || !cred.publicId) throw new EmailDeliveryError("Email provider credential is not configured.");
  let onlyRecipient: string | null = null;
  const status = await platformCredentialStatus(purpose);
  if (status?.setBy?.startsWith("setup:")) {
    const [setup] = await db.select({ completedAt: schema.platformSetup.completedAt }).from(schema.platformSetup).where(eq(schema.platformSetup.id, 1));
    if (!setup?.completedAt) {
      const [ch] = await db.select({ email: schema.platformSetupChallenge.email }).from(schema.platformSetupChallenge).where(eq(schema.platformSetupChallenge.id, status.setBy.slice("setup:".length)));
      onlyRecipient = ch?.email.toLowerCase() ?? "\0nobody";
    }
  }
  return {
    transport: { provider: active.value, from: cred.publicId, key: cred.secret },
    allowlist,
    onlyRecipient,
    onDelivered: () => markPlatformSecretVerified(purpose, cred.revision, "send"),
  };
}
