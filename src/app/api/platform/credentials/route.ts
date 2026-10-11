import { db, schema } from "@/db";
import { platformRead } from "@/server/platform-http";
import { legacyEnvVars, SETTING_KEYS } from "@/server/platform-purposes";
import { listPlatformSecretViews } from "@/server/platform-secrets";
import { getSetting, settingEnvPresent } from "@/server/platform-settings";
import { platformRedirectUris } from "@/server/platform-uris";

export const dynamic = "force-dynamic";

/** Every platform credential as a write-only projection, the settings, and the exact redirect URIs to register. */
export const GET = platformRead(async () => {
  const imported = new Set((await db.select({ p: schema.platformEnvImport.purpose }).from(schema.platformEnvImport)).map((r) => r.p));
  const settings = await Promise.all(
    SETTING_KEYS.map(async (key) => {
      const s = await getSetting(key);
      return {
        key,
        value: s?.value ?? null,
        revision: s?.revision ?? 0,
        setAt: s?.setAt ?? null,
        envImport: { available: !s && settingEnvPresent(key) && !imported.has(`setting:${key}`), imported: imported.has(`setting:${key}`) },
      };
    }),
  );
  return {
    credentials: await listPlatformSecretViews(),
    settings,
    redirectUris: platformRedirectUris(),
    // Env vars that used to hold now UI-managed values and are STILL set: the operator should remove them.
    legacyEnvStillSet: legacyEnvVars().filter((k) => Boolean(process.env[k]?.trim())),
    billingSafety: { paddleEnv: process.env.FLOWLINE_BILLING_PADDLE_ENV === "live" ? "live" : "sandbox", allowLive: process.env.FLOWLINE_BILLING_ALLOW_LIVE === "true" },
  };
});
