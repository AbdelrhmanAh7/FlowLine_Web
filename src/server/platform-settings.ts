import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema, type Db } from "@/db";
import { HttpError } from "./http";
import { platformAudit, type Assurance } from "./platform-audit";
import { SETTING_ENV, SETTING_KEYS, type SettingKey } from "./platform-purposes";
import { SETTING_SCHEMAS } from "./platform-setting-schemas";

export { SETTING_SCHEMAS } from "./platform-setting-schemas";

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Validated, versioned platform settings that are NOT secrets (owner decision 3): the email recipient allowlist, the
 * billing plans list, and which email/billing provider is active. Read per operation (no cache), so a change takes
 * effect on the next email/checkout without a restart. Live-payment enablement stays in operator env.
 */
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

export function isSettingKey(k: string): k is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(k);
}

export async function getSetting<K extends SettingKey>(key: K, dbOrTx: DbOrTx = db): Promise<{ value: SettingValue<K>; revision: number; setAt: Date; setBy: string } | null> {
  const [row] = await dbOrTx.select().from(schema.platformSetting).where(eq(schema.platformSetting.key, key));
  if (!row) return null;
  const parsed = SETTING_SCHEMAS[key].safeParse(row.value);
  // A value that no longer validates is treated as NOT configured (fail closed), never guessed.
  if (!parsed.success) return null;
  return { value: parsed.data as SettingValue<K>, revision: row.revision, setAt: row.setAt, setBy: row.setBy };
}

export interface SettingActor {
  userId: string | null;
  label: string;
  assurance: Assurance;
}

/** Compare-and-swap on revision (0 = not set yet). Audited in the same transaction. */
export async function setSetting<K extends SettingKey>(actor: SettingActor, key: K, value: unknown, expectedRevision: number, opts: { importedFromEnv?: boolean } = {}) {
  const parsed = SETTING_SCHEMAS[key].safeParse(value);
  if (!parsed.success) throw new HttpError(400, "SETTING_INVALID", "This value isn't valid for this setting", parsed.error.issues.map((i) => ({ path: i.path, message: i.message })));
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.platformSetting).where(eq(schema.platformSetting.key, key)).for("update");
    const current = row?.revision ?? 0;
    if (current !== expectedRevision) throw new HttpError(409, "REVISION_CONFLICT", "This setting changed since you loaded it. Reload and try again.");
    const next = current + 1;
    if (row) await tx.update(schema.platformSetting).set({ value: parsed.data as object, revision: next, setBy: actor.userId ?? actor.label, setAt: new Date() }).where(eq(schema.platformSetting.key, key));
    else await tx.insert(schema.platformSetting).values({ key, value: parsed.data as object, revision: next, setBy: actor.userId ?? actor.label });
    await platformAudit(tx, {
      actor: { userId: actor.userId, label: actor.label },
      assurance: actor.assurance,
      action: "platform_setting.set",
      result: "ok",
      targetType: "platform_setting",
      targetId: key,
      purpose: key,
      oldRevision: current || null,
      newRevision: next,
      data: { importedFromEnv: Boolean(opts.importedFromEnv) },
    });
    return { key, revision: next };
  });
}

/** Import-from-environment for a setting: explicit, audited, at most once (marker `setting:<key>`), only if never set. */
export async function importSettingFromEnv(actor: SettingActor, key: SettingKey) {
  const value = settingFromEnv(key);
  if (value === undefined) throw new HttpError(400, "ENV_NOT_SET", "The environment doesn't hold a valid value for this setting");
  const marker = `setting:${key}`;
  const parsed = SETTING_SCHEMAS[key].safeParse(value);
  if (!parsed.success) throw new HttpError(400, "SETTING_INVALID", "The environment value isn't valid for this setting");
  return db.transaction(async (tx) => {
    const [done] = await tx.select().from(schema.platformEnvImport).where(eq(schema.platformEnvImport.purpose, marker)).for("update");
    if (done) throw new HttpError(409, "ALREADY_IMPORTED", "This setting was already imported from the environment once");
    const [row] = await tx.select().from(schema.platformSetting).where(eq(schema.platformSetting.key, key)).for("update");
    if (row) throw new HttpError(409, "ALREADY_CONFIGURED", "This setting is already configured in the panel");
    await tx.insert(schema.platformEnvImport).values({ purpose: marker, importedBy: actor.userId ?? actor.label });
    await tx.insert(schema.platformSetting).values({ key, value: parsed.data as object, revision: 1, setBy: actor.userId ?? actor.label });
    await platformAudit(tx, { actor: { userId: actor.userId, label: actor.label }, assurance: actor.assurance, action: "platform_setting.set", result: "ok", targetType: "platform_setting", targetId: key, purpose: key, newRevision: 1, data: { importedFromEnv: true } });
    return { key, revision: 1 };
  });
}

/** Parses the legacy env representation of a setting (import-from-environment only). */
export function settingFromEnv(key: SettingKey, env: NodeJS.ProcessEnv = process.env): unknown {
  switch (key) {
    case "email.provider": {
      const v = env.FLOWLINE_EMAIL_PROVIDER?.trim();
      return v === "resend" || v === "postmark" ? v : undefined;
    }
    case "email.allowed_recipients": {
      const v = env.FLOWLINE_EMAIL_ALLOWED_RECIPIENTS?.trim();
      return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    }
    case "billing.provider": {
      const v = env.FLOWLINE_BILLING_PROVIDER?.trim().toLowerCase();
      return v === "stripe" || v === "paddle" ? v : undefined;
    }
    case "billing.plans": {
      if (!env.FLOWLINE_BILLING_PLANS || !env.FLOWLINE_BILLING_FREE_PLAN) return undefined;
      try {
        return { plans: JSON.parse(env.FLOWLINE_BILLING_PLANS), freePlanId: env.FLOWLINE_BILLING_FREE_PLAN };
      } catch {
        return undefined;
      }
    }
  }
}

export function settingEnvPresent(key: SettingKey, env: NodeJS.ProcessEnv = process.env) {
  return SETTING_ENV[key].some((k) => Boolean(env[k]?.trim()));
}
