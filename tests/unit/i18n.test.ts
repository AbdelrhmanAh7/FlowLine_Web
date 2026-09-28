import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, dirOf, intlLocale, LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { apiErrorMessage } from "@/i18n/errors";
import { formatDate, formatDuration, formatNumber, formatPercent, formatRelative } from "@/i18n/format";
import { ar } from "@/i18n/messages/ar";
import { en } from "@/i18n/messages/en";
import { createTranslator } from "@/i18n/translate";
import type { Messages, MessageKey, PluralKey } from "@/i18n/types";
import { ApiError } from "@/lib/api";

const ARABIC_INDIC = /[٠-٩۰-۹]/;
const PLURAL_FORMS = ["zero", "one", "two", "few", "many", "other"];

type Tree = { [k: string]: string | Tree };
const isPlural = (v: unknown): v is Record<string, string> => typeof v === "object" && v !== null && "other" in v;

function leaves(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" || isPlural(v) ? [path] : leaves(v, path);
  });
}
function plurals(tree: Tree, prefix = ""): [string, Record<string, string>][] {
  return Object.entries(tree).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") return [];
    return isPlural(v) ? [[path, v] as [string, Record<string, string>]] : plurals(v, path);
  });
}

describe("i18n catalogues", () => {
  it("English has exactly the Arabic keys (runtime mirror of the type check)", () => {
    expect(leaves(en as unknown as Tree).sort()).toEqual(leaves(ar as unknown as Tree).sort());
  });

  it("a catalogue with a missing key does not type-check", () => {
    // The assertion that matters is the @ts-expect-error: `pnpm typecheck` fails if a missing key were allowed.
    // @ts-expect-error — `shell` (and everything else) is missing
    const partial: Messages = { common: en.common };
    // @ts-expect-error — a key that doesn't exist in the Arabic source of truth
    const unknownKey: MessageKey = "shell.nav.doesNotExist";
    // @ts-expect-error — plural keys can't be used with t(); they need t.plural()
    const pluralAsString: MessageKey = "flows.nodes";
    // @ts-expect-error — plain keys can't be pluralised
    const stringAsPlural: PluralKey = "flows.title";
    expect([partial, unknownKey, pluralAsString, stringAsPlural]).toHaveLength(4);
  });

  it("every Arabic plural fills all six CLDR forms, every English plural has `other`", () => {
    for (const [key, forms] of plurals(ar as unknown as Tree)) expect(Object.keys(forms).sort(), key).toEqual([...PLURAL_FORMS].sort());
    for (const [key, forms] of plurals(en as unknown as Tree)) expect(forms.other, key).toBeTypeOf("string");
  });

  it("no empty strings except deliberate empty zero-forms", () => {
    for (const [lang, cat] of [["ar", ar], ["en", en]] as const) {
      for (const path of leaves(cat as unknown as Tree)) {
        const v = path.split(".").reduce<unknown>((n, k) => (n as Tree)[k], cat);
        if (typeof v === "string") expect(v.trim(), `${lang}:${path}`).not.toBe("");
      }
    }
  });
});

describe("locale resolution", () => {
  it("defaults to Arabic when the cookie is absent or invalid", () => {
    expect(LOCALE_COOKIE).toBe("fl_locale");
    expect(DEFAULT_LOCALE).toBe("ar");
    expect(resolveLocale(undefined)).toBe("ar");
    expect(resolveLocale(null)).toBe("ar");
    expect(resolveLocale("")).toBe("ar");
    expect(resolveLocale("fr")).toBe("ar");
    expect(resolveLocale("EN")).toBe("ar");
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("ar")).toBe("ar");
  });

  it("maps locale to direction and Intl locale", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(intlLocale("ar")).toBe("ar-EG-u-nu-latn");
    expect(intlLocale("en")).toBe("en-US");
  });
});

describe("translator", () => {
  const tAr = createTranslator("ar");
  const tEn = createTranslator("en");

  it("looks up and interpolates", () => {
    expect(tAr("shell.nav.flows")).toBe("المسارات");
    expect(tEn("shell.nav.flows")).toBe("Flows");
    expect(tEn("auth.oauthNotConfigured", { provider: "GitHub" })).toBe("GitHub sign-in isn't configured on this server yet. Use email below.");
    expect(tAr("auth.oauthNotConfigured", { provider: "GitHub" })).toContain("GitHub");
    // Unknown placeholders are left visible rather than silently dropped.
    expect(tEn("flows.noMatch.body", {})).toContain("{q}");
  });

  it("picks all six Arabic plural forms", () => {
    const cases: [number, string][] = [
      [0, "لا عُقد"],
      [1, "عقدة واحدة"],
      [2, "عقدتان"],
      [3, "3 عُقد"],
      [10, "10 عُقد"],
      [11, "11 عقدة"],
      [99, "99 عقدة"],
      [100, "100 عقدة"],
      [102, "102 عقدة"],
      [103, "103 عُقد"],
    ];
    for (const [n, expected] of cases) expect(tAr.plural("flows.nodes", n), String(n)).toBe(expected);
  });

  it("uses one/other in English and formats the count", () => {
    expect(tEn.plural("flows.nodes", 1)).toBe("1 node");
    expect(tEn.plural("flows.nodes", 0)).toBe("0 nodes");
    expect(tEn.plural("flows.kpi.aiTokens", 12345)).toBe("12,345 AI tokens");
    expect(tAr.plural("flows.kpi.aiTokens", 12345)).toBe("12,345 رمزًا للذكاء الاصطناعي"); // 45 → "many"
    expect(tAr.plural("flows.kpi.aiTokens", 12300)).toBe("12,300 رمز ذكاء اصطناعي"); // 00 → "other"
  });

  it("has() tells data-driven keys apart", () => {
    expect(tAr.has("localTemplates.lead-qualifier.name")).toBe(true);
    expect(tAr.has("localTemplates.not-a-template.name")).toBe(false);
  });
});

describe("formatting keeps Western digits in Arabic", () => {
  const d = new Date(Date.UTC(2026, 8, 28, 14, 5));

  it("numbers and percentages", () => {
    expect(formatNumber("ar", 1234567.5)).toBe("1,234,567.5");
    expect(formatNumber("en", 1234567.5)).toBe("1,234,567.5");
    expect(formatPercent("ar", 0.953)).toMatch(/95\.3/);
    expect(formatPercent("ar", 0.953)).not.toMatch(ARABIC_INDIC);
    expect(formatPercent("en", null)).toBe("—");
  });

  it("dates", () => {
    const s = formatDate("ar", d, { dateStyle: "medium", timeZone: "UTC" });
    expect(s).toMatch(/2026/);
    expect(s).not.toMatch(ARABIC_INDIC);
    expect(formatDate("en", d, { dateStyle: "medium", timeZone: "UTC" })).toBe("Sep 28, 2026");
  });

  it("relative times", () => {
    const now = d.getTime();
    expect(formatRelative("ar", d, now)).toBe("الآن");
    expect(formatRelative("en", d, now)).toBe("now");
    expect(formatRelative("en", new Date(now - 5 * 60_000), now)).toBe("5m ago");
    const ar5 = formatRelative("ar", new Date(now - 5 * 60_000), now);
    expect(ar5).toContain("5");
    expect(ar5).not.toMatch(ARABIC_INDIC);
    expect(formatRelative("ar", null, now, { never: "لم يحدث بعد" })).toBe("لم يحدث بعد");
  });

  it("durations", () => {
    expect(formatDuration("en", 850)).toBe("850ms");
    expect(formatDuration("en", 12_300)).toBe("12.3s");
    expect(formatDuration("ar", 12_300)).not.toMatch(ARABIC_INDIC);
    expect(formatDuration("ar", null)).toBe("—");
  });
});

describe("API error messages", () => {
  const t = createTranslator("ar");

  it("maps known codes to the catalogue", () => {
    expect(apiErrorMessage(t, new ApiError(410, "INVITE_EXPIRED", "This invitation expired — ask for a new one"))).toBe(ar.errors.INVITE_EXPIRED);
    expect(apiErrorMessage(t, new ApiError(0, "NETWORK", "Can't reach Flowline"))).toBe(ar.errors.NETWORK);
    expect(apiErrorMessage(t, new ApiError(502, "HTTP_502", "Request failed (502)"))).toBe(ar.errors.server);
    expect(apiErrorMessage(t, new ApiError(400, "VALIDATION", "Invalid request"))).toBe(ar.errors.VALIDATION);
  });

  it("falls back to the server message, then to the given fallback", () => {
    expect(apiErrorMessage(t, new ApiError(400, "VALIDATION", "Workspace name must be 2–60 characters"))).toBe("Workspace name must be 2–60 characters");
    expect(apiErrorMessage(t, new ApiError(409, "SOMETHING_NEW", "Server says why"))).toBe("Server says why");
    expect(apiErrorMessage(t, new Error("boom"), "fallback")).toBe("fallback");
    expect(apiErrorMessage(t, "weird")).toBe(ar.errors.generic);
  });
});
