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
    expect(apiErrorMessage(t, new ApiError(403, "PLATFORM_MFA_REQUIRED", "Sign in again and complete your authenticator challenge"))).toBe(ar.errors.PLATFORM_MFA_REQUIRED);
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

describe("template localization consistency and RTL typography (findings 08bddb2f551f, 9c8bf91e0489, #340, #454)", () => {
  it("src/i18n/messages/ar.json:364: deal-won-mizano-quote title uses em-dash (—) and no directional arrows for RTL layout consistency (findings 08bddb2f551f, 9c8bf91e0489, #340, #454)", () => {
    const templates = (ar as unknown as { localTemplates?: Record<string, { name?: string; description?: string; nodes?: Record<string, string> }> }).localTemplates;
    const item = templates?.["deal-won-mizano-quote"];
    expect(item).toBeDefined();
    expect(item?.name).toBe("صفقة مكسوبة — عرض سعر Mizano");
    expect(item?.name).toContain("\u2014");
    expect(item?.name).not.toContain("\u2192");
    expect(item?.name).not.toContain("\u2190");
    expect(item?.name).not.toContain(" - ");
  });

  it("src/i18n/messages/ar.json:365: deal-won-mizano-quote description uses em-dash (—) in RTL parenthetical and no directional arrows (#454)", () => {
    const templates = (ar as unknown as { localTemplates?: Record<string, { description?: string }> }).localTemplates;
    const desc = templates?.["deal-won-mizano-quote"]?.description;
    expect(desc).toBeDefined();
    expect(desc).toContain("(الصفقة فازت — عرض ميزانو)");
    expect(desc).toContain("\u2014");
    expect(desc).not.toContain("\u2192");
    expect(desc).not.toContain("\u2190");
  });

  it("src/i18n/messages/ar.json:369-373: deal-won-mizano-quote nodes consistently use em-dash (—) and strictly no regular hyphen (-) in Arabic labels (#454)", () => {
    const templates = (ar as unknown as { localTemplates?: Record<string, { nodes?: Record<string, string> }> }).localTemplates;
    const nodes = templates?.["deal-won-mizano-quote"]?.nodes ?? {};
    expect(nodes["customer"]).toBe("Mizano — إنشاء عميل (يحتاج موافقة)");
    expect(nodes["quote"]).toBe("Mizano — إنشاء مسودة عرض سعر");
    expect(nodes["notify"]).toBe("Slack — عرض السعر جاهز");
    for (const [key, label] of Object.entries(nodes)) {
      if (["customer", "quote", "notify"].includes(key)) {
        expect(label, `node ${key} must contain em-dash \u2014`).toContain("\u2014");
        expect(label, `node ${key} must not contain regular hyphen \u002D`).not.toContain("\u002D");
      }
    }
  });

  it("no local template titles contain misplaced right-pointing arrows (→) in Arabic (#454)", () => {
    const templates = (ar as unknown as { localTemplates?: Record<string, { name?: string }> }).localTemplates ?? {};
    for (const [id, tpl] of Object.entries(templates)) {
      if (tpl.name) {
        expect(tpl.name, `template ${id} contains rightwards arrow → in Arabic`).not.toContain("→");
        expect(tpl.name, `template ${id} contains rightwards arrow \u2192 in Arabic`).not.toContain("\u2192");
      }
    }
  });
});

describe("Arabic typography and em-dash consistency (findings 232f2a67a05a, 9d0db94dd27d, 4357ac834349, #434)", () => {
  it("src/i18n/messages/ar.json: account.security.twoFactor.backupCodes uses em-dash (—) and strictly no regular hyphen (-) (finding 9d0db94dd27d)", () => {
    // Finding 9d0db94dd27d / 232f2a67a05a: Regular hyphen (-) used instead of em-dash (—) for account.security.twoFactor.backupCodes
    const arAccount = (ar as unknown as Record<string, unknown>).account as Record<string, unknown>;
    const arSecurity = arAccount?.security as Record<string, unknown> | undefined;
    const arTwoFactor = arSecurity?.twoFactor as Record<string, unknown> | undefined;
    const arBackupCodes = arTwoFactor?.backupCodes as string | undefined;

    expect(arBackupCodes, "account.security.twoFactor.backupCodes must be defined in ar.json").toBeDefined();
    expect(arBackupCodes).toBe("رموز النسخ الاحتياطي — تُعرض مرة واحدة فقط، احتفظ بها خارج الإنترنت.");
    // Strict Unicode check: em-dash (U+2014) is present
    expect(arBackupCodes).toContain("\u2014");
    // Strict prohibition: no ASCII hyphen-minus (U+002D) or en-dash (U+2013)
    expect(arBackupCodes).not.toContain("-");
    expect(arBackupCodes).not.toContain("\u2013");
    expect(arBackupCodes).not.toMatch(/[\u002D\u2010\u2011\u2012\u2013]/);
  });

  it("src/i18n/messages/en.json: account.security.twoFactor.backupCodes uses em-dash (—) and strictly no regular hyphen (-) (finding 4357ac834349)", () => {
    // Finding 4357ac834349: Regular hyphen (-) used instead of em-dash (—) for account.security.twoFactor.backupCodes in en.json
    const enAccount = (en as unknown as Record<string, unknown>).account as Record<string, unknown>;
    const enSecurity = enAccount?.security as Record<string, unknown> | undefined;
    const enTwoFactor = enSecurity?.twoFactor as Record<string, unknown> | undefined;
    const enBackupCodes = enTwoFactor?.backupCodes as string | undefined;

    expect(enBackupCodes, "account.security.twoFactor.backupCodes must be defined in en.json").toBeDefined();
    expect(enBackupCodes).toBe("Backup codes — shown only once, store them offline.");
    // Strict Unicode check: em-dash (U+2014) is present
    expect(enBackupCodes).toContain("\u2014");
    // Strict prohibition: no ASCII hyphen-minus (U+002D) or en-dash (U+2013)
    expect(enBackupCodes).not.toContain("-");
    expect(enBackupCodes).not.toContain("\u2013");
    expect(enBackupCodes).not.toMatch(/[\u002D\u2010\u2011\u2012\u2013]/);
  });

  it("account.security.twoFactor.backupCodes is structurally and typographically consistent between Arabic and English", () => {
    const arAccount = (ar as unknown as Record<string, unknown>).account as Record<string, unknown>;
    const arVal = ((arAccount?.security as Record<string, unknown>)?.twoFactor as Record<string, unknown>)?.backupCodes as string;
    const enAccount = (en as unknown as Record<string, unknown>).account as Record<string, unknown>;
    const enVal = ((enAccount?.security as Record<string, unknown>)?.twoFactor as Record<string, unknown>)?.backupCodes as string;

    expect(arVal).toBeDefined();
    expect(enVal).toBeDefined();

    // Both must use identical em-dash separator " — "
    expect(arVal).toContain(" — ");
    expect(enVal).toContain(" — ");

    // Neither contains regular hyphen or hyphen-with-spaces
    expect(arVal).not.toContain(" - ");
    expect(enVal).not.toContain(" - ");
    expect(arVal.includes("-")).toBe(false);
    expect(enVal.includes("-")).toBe(false);
  });

  it("all backupCodes messages across catalogues use em-dash (—) and not regular hyphen (-)", () => {
    expect(ar.platformAdmin.setup.backupCodes).toContain("—");
    expect(ar.platformAdmin.setup.backupCodes).not.toContain("-");
    expect(en.platformAdmin.setup.backupCodes).toContain("—");
    expect(en.platformAdmin.setup.backupCodes).not.toContain("-");

    function findBackupCodes(obj: unknown, path = ""): { path: string; val: string }[] {
      if (!obj || typeof obj !== "object") return [];
      const res: { path: string; val: string }[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const p = path ? `${path}.${k}` : k;
        if (k === "backupCodes" && typeof v === "string") {
          res.push({ path: p, val: v });
        } else if (typeof v === "object" && v !== null) {
          res.push(...findBackupCodes(v, p));
        }
      }
      return res;
    }

    const arCodes = findBackupCodes(ar);
    const enCodes = findBackupCodes(en);

    expect(arCodes.length).toBeGreaterThanOrEqual(2);
    expect(enCodes.length).toBeGreaterThanOrEqual(2);

    for (const item of arCodes) {
      expect(item.val, `Arabic key ${item.path} must contain em-dash (—)`).toContain("\u2014");
      expect(item.val, `Arabic key ${item.path} must not contain regular hyphen (-)`).not.toContain("-");
      expect(item.val, `Arabic key ${item.path} must not contain en-dash (–)`).not.toContain("\u2013");
    }

    for (const item of enCodes) {
      expect(item.val, `English key ${item.path} must contain em-dash (—)`).toContain("\u2014");
      expect(item.val, `English key ${item.path} must not contain regular hyphen (-)`).not.toContain("-");
      expect(item.val, `English key ${item.path} must not contain en-dash (–)`).not.toContain("\u2013");
    }
  });
});

describe("Mizano template Arabic em-dash consistency (#453)", () => {
  it("src/i18n/messages/ar.json: localTemplates.deal-won-mizano-quote.nodes.customer uses em-dash (—) and strictly no regular hyphen (-)", () => {
    // Finding from PR #445: Regular hyphen (-) used instead of em-dash (—) for Mizano template customer node label
    const arTemplates = (ar as unknown as Record<string, unknown>).localTemplates as Record<string, unknown> | undefined;
    const arMizano = arTemplates?.["deal-won-mizano-quote"] as Record<string, unknown> | undefined;
    const arNodes = arMizano?.nodes as Record<string, unknown> | undefined;
    const arCustomer = arNodes?.customer as string | undefined;

    expect(arCustomer, "localTemplates.deal-won-mizano-quote.nodes.customer must be defined in ar.json").toBeDefined();
    expect(arCustomer).toBe("Mizano — إنشاء عميل (يحتاج موافقة)");
    // Strict Unicode check: em-dash (U+2014) is present
    expect(arCustomer).toContain("\u2014");
    // Strict prohibition: no ASCII hyphen-minus (U+002D) or en-dash (U+2013)
    expect(arCustomer).not.toContain("-");
    expect(arCustomer).not.toContain("\u2013");
    expect(arCustomer).not.toMatch(/[\u002D\u2010\u2011\u2012\u2013]/);
  });

  it("src/i18n/messages/en.json: localTemplates.deal-won-mizano-quote.nodes.customer uses em-dash (—) and strictly no regular hyphen (-)", () => {
    const enTemplates = (en as unknown as Record<string, unknown>).localTemplates as Record<string, unknown> | undefined;
    const enMizano = enTemplates?.["deal-won-mizano-quote"] as Record<string, unknown> | undefined;
    const enNodes = enMizano?.nodes as Record<string, unknown> | undefined;
    const enCustomer = enNodes?.customer as string | undefined;

    expect(enCustomer, "localTemplates.deal-won-mizano-quote.nodes.customer must be defined in en.json").toBeDefined();
    expect(enCustomer).toBe("Mizano — Create customer (needs approval)");
    // Strict Unicode check: em-dash (U+2014) is present
    expect(enCustomer).toContain("\u2014");
    // Strict prohibition: no ASCII hyphen-minus (U+002D) or en-dash (U+2013)
    expect(enCustomer).not.toContain("-");
    expect(enCustomer).not.toContain("\u2013");
    expect(enCustomer).not.toMatch(/[\u002D\u2010\u2011\u2012\u2013]/);
  });

  it("all Mizano template node labels use em-dash (—) and not regular hyphen (-)", () => {
    const arTemplates = (ar as unknown as Record<string, unknown>).localTemplates as Record<string, unknown> | undefined;
    const arMizano = arTemplates?.["deal-won-mizano-quote"] as Record<string, unknown> | undefined;
    const arNodes = arMizano?.nodes as Record<string, unknown> | undefined;
    const enTemplates = (en as unknown as Record<string, unknown>).localTemplates as Record<string, unknown> | undefined;
    const enMizano = enTemplates?.["deal-won-mizano-quote"] as Record<string, unknown> | undefined;
    const enNodes = enMizano?.nodes as Record<string, unknown> | undefined;

    if (arNodes && enNodes) {
      for (const [key, arVal] of Object.entries(arNodes)) {
        if (typeof arVal === "string") {
          const enVal = enNodes[key] as string | undefined;
          if (enVal) {
            // Only check nodes that should have em-dash (Mizano/Slack provider prefixes)
            const shouldHaveEmDash = arVal.includes("Mizano") || arVal.includes("Slack") || enVal.includes("Mizano") || enVal.includes("Slack");
            if (shouldHaveEmDash) {
              // Both must use identical em-dash separator " — "
              expect(arVal, `Arabic node ${key} must contain em-dash (—)`).toContain("\u2014");
              expect(enVal, `English node ${key} must contain em-dash (—)`).toContain("\u2014");
              // Neither contains regular hyphen or hyphen-with-spaces
              expect(arVal, `Arabic node ${key} must not contain regular hyphen (-)`).not.toContain("-");
              expect(enVal, `English node ${key} must not contain regular hyphen (-)`).not.toContain("-");
              expect(arVal.includes("-")).toBe(false);
              expect(enVal.includes("-")).toBe(false);
            }
          }
        }
      }
    }
  });
});


