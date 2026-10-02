import { CATALOGUES } from "./translate";
import { HttpError } from "@/server/http";

function flatten(node: unknown, prefix = "", result: Record<string, string> = Object.create(null)): Record<string, string> {
  if (!node || typeof node !== "object") return result;
  for (const [part, value] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${part}` : part;
    if (typeof value === "string") result[key] = value;
    else if (value && typeof value === "object") flatten(value, key, result);
  }
  return result;
}

export const BASE_COPY = { ar: flatten(CATALOGUES.ar), en: flatten(CATALOGUES.en) };
export function baseCopy(locale: "ar" | "en", key: string): string | undefined {
  return BASE_COPY[locale][key] ?? BASE_COPY[locale][key.replace(/\.(zero|one|two|few|many)$/, ".other")];
}
const protectedKey = (key: string) => /^(https?:|mailto:|\/)/i.test(baseCopy("ar", key) ?? "") || /^(https?:|mailto:|\/)/i.test(baseCopy("en", key) ?? "") || /(^|\.)(url|href|path)(\.|$)/i.test(key);
export const EDITABLE_COPY_KEYS = new Set([...new Set([...Object.keys(BASE_COPY.ar), ...Object.keys(BASE_COPY.en)])].filter((key) => baseCopy("ar", key) !== undefined && baseCopy("en", key) !== undefined && !protectedKey(key)));
const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");

export function validateCopy(locale: string, key: string, value: string | null) {
  if ((locale !== "ar" && locale !== "en") || !EDITABLE_COPY_KEYS.has(key)) throw new HttpError(400, "COPY_KEY_INVALID", "Unknown copy key");
  if (value === null) return;
  const base = baseCopy(locale, key)!;
  const max = key === "meta.keywords" ? 500 : 1200;
  const min = base === "" ? 0 : 1;
  if ((!value.trim() && base !== "") || value.length > max || /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) {
    throw new HttpError(400, "COPY_VALUE_INVALID", min === 0 ? `Enter plain text up to ${max} characters` : `Enter plain text between 1 and ${max} characters`);
  }
  if (placeholders(value) !== placeholders(base)) throw new HttpError(400, "COPY_PLACEHOLDERS_INVALID", "Keep the original placeholders unchanged");
}
