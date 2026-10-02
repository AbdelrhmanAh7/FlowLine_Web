import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import type { CopyOverrides } from "@/i18n/translate";
import { publishedCopyOrBase } from "@/i18n/copy-fallback";
import { EDITABLE_COPY_KEYS, baseCopy, validateCopy } from "@/i18n/copy-validation";
import { HttpError } from "./http";
import { platformAudit } from "./platform-audit";
import type { PlatformAdminContext } from "./platform-access";

const DRAFT = "site.copy.draft";
const PUBLISHED = "site.copy.published";
const localeKeys = ["ar", "en"] as const;
type Locale = (typeof localeKeys)[number];

function parseOverrides(value: unknown): CopyOverrides {
  // These validated maps cross the React Server Component boundary into I18nProvider.
  const parsed: CopyOverrides = { ar: {}, en: {} };
  if (!value || typeof value !== "object" || Array.isArray(value)) return parsed;
  for (const locale of localeKeys) {
    const source = (value as Record<string, unknown>)[locale];
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const [key, text] of Object.entries(source)) {
      try {
        if (typeof text === "string") {
          validateCopy(locale, key, text);
          parsed[locale]![key] = text;
        }
      } catch { /* Invalid stored keys never reach a translator. */ }
    }
  }
  return parsed;
}

async function read(key: string) {
  const [row] = await db.select().from(schema.platformSetting).where(eq(schema.platformSetting.key, key));
  return { value: parseOverrides(row?.value), revision: row?.revision ?? 0, setAt: row?.setAt ?? null };
}

/** React cache deduplicates within one request only; a database outage leaves the built-in copy visible. */
export const getPublishedCopy = cache(async (): Promise<CopyOverrides> => {
  return publishedCopyOrBase(async () => (await read(PUBLISHED)).value, () => console.error("Published copy unavailable; using built-in catalogue"));
});

export async function getCopyEditorState() {
  const [draft, published] = await Promise.all([read(DRAFT), read(PUBLISHED)]);
  return { base: { ar: Object.fromEntries([...EDITABLE_COPY_KEYS].map((key) => [key, baseCopy("ar", key)!])), en: Object.fromEntries([...EDITABLE_COPY_KEYS].map((key) => [key, baseCopy("en", key)!])) }, draft, published };
}

function actorOf(ctx: PlatformAdminContext) {
  return { userId: ctx.user.id, label: ctx.user.email };
}

export async function editDraftCopyBatch(ctx: PlatformAdminContext, edits: { locale: Locale; key: string; value: string | null }[], expectedRevision: number) {
  for (const edit of edits) validateCopy(edit.locale, edit.key, edit.value);
  if (new Set(edits.map((edit) => `${edit.locale}:${edit.key}`)).size !== edits.length) throw new HttpError(400, "COPY_DUPLICATE_EDIT", "Duplicate copy edit");
  return db.transaction(async (tx) => {
    await tx.insert(schema.platformSetting).values({ key: DRAFT, value: { ar: {}, en: {} }, revision: 0, setBy: ctx.user.id }).onConflictDoNothing();
    const [row] = await tx.select().from(schema.platformSetting).where(eq(schema.platformSetting.key, DRAFT)).for("update");
    const current = row?.revision ?? 0;
    if (current !== expectedRevision) throw new HttpError(409, "REVISION_CONFLICT", "Draft changed. Reload and try again.");
    const overrides = parseOverrides(row?.value);
    for (const { locale, key, value } of edits) {
      if (value === null || value === baseCopy(locale, key)) delete overrides[locale]![key];
      else overrides[locale]![key] = value;
    }
    const revision = current + 1;
    await tx.update(schema.platformSetting).set({ value: overrides, revision, setBy: ctx.user.id, setAt: new Date() }).where(eq(schema.platformSetting.key, DRAFT));
    await platformAudit(tx, { actor: actorOf(ctx), assurance: "session_totp_stepup", action: "platform_setting.set", result: "ok", targetType: "platform_setting", targetId: DRAFT, purpose: DRAFT, oldRevision: current || null, newRevision: revision, data: { changedKeys: edits.length } });
    return { revision, value: overrides };
  });
}

export function editDraftCopy(ctx: PlatformAdminContext, locale: Locale, key: string, value: string | null, expectedRevision: number) {
  return editDraftCopyBatch(ctx, [{ locale, key, value }], expectedRevision);
}

export async function publishCopy(ctx: PlatformAdminContext, expectedDraftRevision: number, expectedPublishedRevision: number) {
  return db.transaction(async (tx) => {
    await tx.insert(schema.platformSetting).values({ key: DRAFT, value: { ar: {}, en: {} }, revision: 0, setBy: ctx.user.id }).onConflictDoNothing();
    await tx.insert(schema.platformSetting).values({ key: PUBLISHED, value: { ar: {}, en: {} }, revision: 0, setBy: ctx.user.id }).onConflictDoNothing();
    const [draft] = await tx.select().from(schema.platformSetting).where(eq(schema.platformSetting.key, DRAFT)).for("update");
    const [published] = await tx.select().from(schema.platformSetting).where(eq(schema.platformSetting.key, PUBLISHED)).for("update");
    if ((draft?.revision ?? 0) !== expectedDraftRevision || (published?.revision ?? 0) !== expectedPublishedRevision) {
      throw new HttpError(409, "REVISION_CONFLICT", "Copy changed. Reload and review it before publishing.");
    }
    const value = parseOverrides(draft?.value);
    const revision = (published?.revision ?? 0) + 1;
    await tx.update(schema.platformSetting).set({ value, revision, setBy: ctx.user.id, setAt: new Date() }).where(eq(schema.platformSetting.key, PUBLISHED));
    await platformAudit(tx, { actor: actorOf(ctx), assurance: "session_totp_stepup", action: "platform_setting.set", result: "ok", targetType: "platform_setting", targetId: PUBLISHED, purpose: PUBLISHED, oldRevision: published?.revision ?? null, newRevision: revision, data: { publishedKeys: Object.keys(value.ar ?? {}).length + Object.keys(value.en ?? {}).length } });
    return { revision, value };
  });
}
