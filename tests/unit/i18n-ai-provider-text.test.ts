import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOGUE } from "@/ai/hub/catalogue";
import { PROVIDERS, RETIRED_NOT_ADDED } from "@/ai/hub/registry";
import { ltrPieces } from "@/components/ai/ltr-runs";
import {
  aiProviderEnglish,
  MODEL_FREE_NOTES_EN,
  modelFreeNote,
  optionsOf,
  proseOf,
  providerFreeTierNote,
  providerNotes,
  providerOptionLabel,
  providerPrivacyNote,
  providerTermsNotes,
  providerVerdictEvidence,
  retiredEvidence,
  type ProseField,
} from "@/i18n/ai-provider-text";
import { ar as arMessages } from "@/i18n/messages/ar";
import { en as enMessages } from "@/i18n/messages/en";
import { createTranslator, type Translator } from "@/i18n/translate";

/**
 * CXQ-01: the AI provider registry's prose (free use, data use, terms, verdict evidence, research notes, retired
 * services, descriptive connection options, per-model free notes) is Arabic in Arabic. These checks walk the real
 * registry and catalogue, so a new provider or a changed sentence can't silently stay English — and English output is
 * exactly the registry text.
 */

const en = createTranslator("en");
const ar = createTranslator("ar");
const ARABIC = /[؀-ۿ]/;

const RENDER: Record<ProseField, (t: Translator, p: (typeof PROVIDERS)[number]) => string | null> = {
  freeTier: providerFreeTierNote,
  privacy: providerPrivacyNote,
  terms: providerTermsNotes,
  verdict: providerVerdictEvidence,
  notes: providerNotes,
};

/** Tokens that must survive translation unchanged: section numbers, URLs, `code`, and quoted English. */
function technicalTokens(text: string): string[] {
  const sections = text.match(/§[0-9A-Z][\w.]*(?:\([a-z0-9]+\))*/gi) ?? [];
  const urls = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  const code = text.match(/`[^`]+`/g) ?? [];
  return [...sections, ...urls, ...code].map((s) => s.replace(/[.,;:]+$/, ""));
}

function leafPaths(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
}

describe("AI provider prose", () => {
  for (const p of PROVIDERS) {
    it(`${p.id}: every prose field is Arabic in Arabic and exactly the registry text in English`, () => {
      const prose = proseOf(p);
      expect(Object.keys(prose).length).toBeGreaterThanOrEqual(3);
      for (const [field, source] of Object.entries(prose) as [ProseField, string][]) {
        const key = `aiProviderText.providers.${p.id}.${field}`;
        expect(ar.has(key), `missing Arabic ${key}`).toBe(true);
        const arabic = RENDER[field](ar, p)!;
        expect(arabic, key).toMatch(ARABIC);
        expect(RENDER[field](en, p), key).toBe(source);
        for (const token of technicalTokens(source)) expect(arabic, `${key} keeps "${token}"`).toContain(token);
      }
      for (const f of p.connectionFields ?? []) {
        for (const o of f.options ?? []) {
          expect(providerOptionLabel(en, p.id, f.key, o)).toBe(o.label);
          const described = optionsOf(p)[f.key]?.[o.value];
          if (described) expect(providerOptionLabel(ar, p.id, f.key, o), `${p.id}.${f.key}.${o.value}`).toMatch(ARABIC);
          else expect(providerOptionLabel(ar, p.id, f.key, o)).toBe(o.label); // a bare API name stays as-is
        }
      }
    });
  }

  for (const r of RETIRED_NOT_ADDED) {
    it(`retired ${r.id}: evidence is Arabic in Arabic and exactly the registry text in English`, () => {
      expect(retiredEvidence(ar, r)).toMatch(ARABIC);
      expect(retiredEvidence(en, r)).toBe(r.evidence);
    });
  }

  it("the Arabic catalogue has exactly the generated English keys (no entries for removed providers or fields)", () => {
    const arKeys = leafPaths((arMessages as unknown as Record<string, unknown>).aiProviderText).sort();
    expect(leafPaths(aiProviderEnglish()).sort()).toEqual(arKeys);
    expect(leafPaths((enMessages as unknown as Record<string, unknown>).aiProviderText).sort()).toEqual(arKeys);
  });

  it("the QA examples (CXQ-01) are Arabic, with section numbers kept", () => {
    const openai = PROVIDERS.find((p) => p.id === "openai")!;
    const anthropic = PROVIDERS.find((p) => p.id === "anthropic")!;
    expect(providerFreeTierNote(ar, openai)).toBe("لا توجد فئة مجانية للاستدلال (النموذج المجاني الوحيد هو omni-moderation-latest)؛ والفوترة برصيد مدفوع مسبقًا.");
    expect(providerPrivacyNote(ar, openai)).toMatch(/^لا تُستخدم بيانات الواجهة البرمجية لتدريب نماذج OpenAI/);
    expect(providerTermsNotes(ar, openai)).toMatch(/^OSA §3\.1: /);
    expect(providerFreeTierNote(ar, anthropic)).toMatch(/^يحصل المستخدمون الجدد على قدر صغير من الرصيد المجاني/);
  });

  it("unknown providers and changed registry sentences fall back to the text being shown", () => {
    const stranger = { id: "acme", freeTier: { note: "Free forever" }, privacy: { note: "Unknown" }, verdictEvidence: "Fine", termsNotes: "None", notes: "n/a" };
    expect(providerFreeTierNote(ar, stranger)).toBe("Free forever");
    expect(providerVerdictEvidence(ar, stranger)).toBe("Fine");
    expect(providerTermsNotes(ar, { id: "openai", termsNotes: null })).toBeNull();
    expect(providerNotes(ar, { id: "openai", notes: null })).toBeNull();
    // An edited English sentence is shown in English until its Arabic is updated (never a stale translation).
    expect(providerFreeTierNote(ar, { id: "openai", freeTier: { note: "A new sentence." } })).toBe("A new sentence.");
    expect(retiredEvidence(ar, { id: "github-models", evidence: "Changed." })).toBe("Changed.");
    expect(providerOptionLabel(ar, "dashscope", "region", { value: "us-east-1", label: "Virginia" })).toBe("Virginia");
  });
});

describe("model free-use notes (model picker)", () => {
  const catalogueSource = readFileSync("src/ai/hub/catalogue.ts", "utf8");

  it("the English notes are exactly what the catalogue writes", () => {
    expect(catalogueSource).toContain(JSON.stringify(MODEL_FREE_NOTES_EN.verifiedZero));
    expect(catalogueSource).toContain("`Zero-priced in ${def.name}'s model list (${def.freeTier.note})`");
    const notes = new Set(CATALOGUE.map((e) => e.freeTierNote).filter(Boolean));
    const known = new Set(Object.values(MODEL_FREE_NOTES_EN));
    for (const n of notes) expect(known.has(n!), `catalogue note without a translation: ${n}`).toBe(true);
  });

  it("every catalogue note is Arabic in Arabic and unchanged in English", () => {
    for (const e of CATALOGUE.filter((x) => x.freeTierNote || x.zeroPriced)) {
      const note = e.freeTierNote ?? MODEL_FREE_NOTES_EN.verifiedZero;
      const def = PROVIDERS.find((p) => p.id === e.provider)!;
      const m = { provider: e.provider, providerName: def.name, freeTierNote: note };
      expect(modelFreeNote(en, m)).toBe(note);
      expect(modelFreeNote(ar, m), e.modelId).toMatch(ARABIC);
    }
  });

  it("a zero-priced model found in a listing names the provider and translates its free-tier note", () => {
    for (const def of PROVIDERS) {
      const note = `Zero-priced in ${def.name}'s model list (${def.freeTier.note})`;
      const m = { provider: def.id, providerName: def.name, freeTierNote: note };
      expect(modelFreeNote(en, m)).toBe(note);
      const arabic = modelFreeNote(ar, m)!;
      expect(arabic).toContain(def.name);
      expect(arabic).toContain(providerFreeTierNote(ar, def));
      expect(arabic).toMatch(/^بسعر صفري في قائمة نماذج /);
    }
  });

  it("unknown or older notes are shown as stored", () => {
    expect(modelFreeNote(ar, { provider: "zai", providerName: "Z.ai (GLM)", freeTierNote: "Something else" })).toBe("Something else");
    expect(modelFreeNote(ar, { provider: "zai", providerName: "Z.ai (GLM)", freeTierNote: null })).toBeNull();
    expect(modelFreeNote(ar, { provider: "openrouter", providerName: "OpenRouter", freeTierNote: "Zero-priced in OpenRouter's model list (old note)" })).toBe("Zero-priced in OpenRouter's model list (old note)");
  });
});

describe("LTR islands in Arabic prose", () => {
  const islands = (text: string) => ltrPieces(text).filter((p) => p.ltr).map((p) => p.text);

  it("keeps section numbers, names, URLs and quotes as LTR runs; the text is unchanged", () => {
    for (const p of PROVIDERS) {
      for (const field of Object.keys(proseOf(p)) as ProseField[]) {
        const text = RENDER[field](ar, p)!;
        expect(ltrPieces(text).map((x) => x.text).join("")).toBe(text);
      }
    }
    expect(islands("OSA §3.1: لا مشاركة لبيانات الاعتماد؛ §16.12: الدول المدعومة فقط")).toEqual(["OSA §3.1", "§16.12"]);
    expect(islands("تحظر شروط الخدمة (ToS §7(4)) إعادة البيع")).toEqual(["ToS §7(4)"]);
    expect(islands("«إلى طرف ثالث أو معه» (\"to or with a third party\") — وهي")).toEqual(['"to or with a third party"']);
    expect(islands("العنوان https://opencode.ai/zen/v1 (Responses لنماذج OpenAI، وChat للنماذج)")).toEqual(["https://opencode.ai/zen/v1", "Responses", "OpenAI", "Chat"]);
  });

  it("paired parentheses inside an LTR run stay with it; unpaired ones stay in the sentence", () => {
    const pieces = ltrPieces("مفاتيح (Coding Plan) فقط");
    expect(pieces).toEqual([
      { text: "مفاتيح (", ltr: false },
      { text: "Coding Plan", ltr: true },
      { text: ") فقط", ltr: false },
    ]);
  });
});
