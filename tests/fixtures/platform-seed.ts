import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { platformCredentialStatus, resolvePlatformCredential, setPlatformSecret } from "@/server/platform-secrets";
import { getSetting, setSetting } from "@/server/platform-settings";
import type { SettingKey } from "@/server/platform-purposes";

/**
 * TEST-ONLY seeding of platform credentials/settings through the real platform-secret service (encrypted, audited as
 * the "test-seed" system actor). Onboarding / admin-panel E2E specs never use this — they enter values through the UI.
 * Refuses to run outside FLOWLINE_ENV=test against a flowline_test* database.
 */
const SEED_ACTOR = { userId: null, label: "test-seed", assurance: "system" as const };

function guard() {
  const dbName = (process.env.DATABASE_URL ?? "").split("/").pop()?.split("?")[0] ?? "";
  if (process.env.FLOWLINE_ENV !== "test" || !/^flowline_test(_[a-z0-9]+)?$/.test(dbName)) throw new Error("Platform seeding is test-only (FLOWLINE_ENV=test and a flowline_test database)");
}

/** Makes `purpose` hold exactly this public id + secret (no-op when it already does). */
export async function seedPlatformCredential(purpose: string, value: { publicId?: string; secret: string }) {
  guard();
  const current = await resolvePlatformCredential(purpose);
  if (current && current.secret === value.secret && (current.publicId ?? undefined) === value.publicId) return;
  const status = await platformCredentialStatus(purpose);
  await setPlatformSecret(SEED_ACTOR, purpose, { publicId: value.publicId, secret: value.secret, expectedRevision: status?.revision ?? 0 });
}

/** Removes a purpose entirely (test cleanup). */
export async function unseedPlatformCredential(purpose: string) {
  guard();
  await db.delete(schema.platformSecret).where(eq(schema.platformSecret.purpose, purpose));
}

export async function seedSetting(key: SettingKey, value: unknown) {
  guard();
  const cur = await getSetting(key);
  if (cur && JSON.stringify(cur.value) === JSON.stringify(value)) return;
  await setSetting(SEED_ACTOR, key, value, cur?.revision ?? 0);
}

export async function unseedSetting(key: SettingKey) {
  guard();
  await db.delete(schema.platformSetting).where(eq(schema.platformSetting.key, key));
}

/**
 * Mirrors the test stack's .env.test OAuth/billing values into the platform panel's records, so suites that assumed
 * env credentials keep the same behaviour. (The runtime itself never reads these variables.)
 */
export async function seedPlatformFromTestEnv(env: NodeJS.ProcessEnv = process.env) {
  guard();
  const pairs: [string, string | undefined, string | undefined][] = [
    ["integration.google", env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET],
    ["integration.slack", env.SLACK_OAUTH_CLIENT_ID, env.SLACK_OAUTH_CLIENT_SECRET],
    ["integration.github", env.GITHUB_OAUTH_CLIENT_ID, env.GITHUB_OAUTH_CLIENT_SECRET],
    ["signin.google", env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET],
    ["signin.github", env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET],
  ];
  for (const [purpose, id, secret] of pairs) if (id?.trim() && secret?.trim()) await seedPlatformCredential(purpose, { publicId: id.trim(), secret: secret.trim() });
  if (env.FLOWLINE_BILLING_STRIPE_KEY?.trim()) await seedPlatformCredential("billing.stripe.test", { secret: env.FLOWLINE_BILLING_STRIPE_KEY.trim() });
  if (env.FLOWLINE_BILLING_WEBHOOK_SECRET?.trim()) await seedPlatformCredential("billing.stripe.test.webhook", { secret: env.FLOWLINE_BILLING_WEBHOOK_SECRET.trim() });
  const provider = (env.FLOWLINE_BILLING_PROVIDER ?? (env.FLOWLINE_BILLING_STRIPE_KEY ? "stripe" : "")).toLowerCase();
  if (provider === "stripe" || provider === "paddle") await seedSetting("billing.provider", provider);
  if (env.FLOWLINE_BILLING_PLANS && env.FLOWLINE_BILLING_FREE_PLAN) await seedSetting("billing.plans", { plans: JSON.parse(env.FLOWLINE_BILLING_PLANS), freePlanId: env.FLOWLINE_BILLING_FREE_PLAN });
}
