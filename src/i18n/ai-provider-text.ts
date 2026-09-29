import { PROVIDERS, RETIRED_NOT_ADDED, type ProviderDefinition } from "@/ai/hub/registry";
import type { Translator } from "./translate";
import { dataText } from "./workspace-text";

/**
 * UI-layer text for the AI provider registry (`src/ai/hub/registry.ts`, shared with the server, stays English).
 * Product-authored prose — free-use notes, data-use notes, terms notes, verdict evidence, research notes, retired-service
 * evidence and descriptive connection-field options — is looked up by provider id and field
 * (`aiProviderText.providers.<id>.<field>`). The English catalogue is GENERATED from the registry (see
 * `aiProviderEnglish`), so English output is always exactly the registry text.
 *
 * A translation is only used while the text being shown is the English it was made for; anything else (an unknown
 * provider, a changed registry sentence, an older note stored in the database) is shown as-is, so nothing is hidden.
 * Brand names, model ids, URLs, headers and section numbers stay in Latin script inside the Arabic sentences.
 */

export const PROSE_FIELDS = ["freeTier", "privacy", "terms", "verdict", "notes"] as const;
export type ProseField = (typeof PROSE_FIELDS)[number];

/** Option labels that are only API names (no prose): shown as-is in every language. */
export const API_NAME_LABELS = new Set(["Chat Completions", "Responses"]);

/**
 * Free-use notes stored per model (`ai_model.free_tier_note`, written by `src/ai/hub/catalogue.ts`). English must equal
 * the catalogue's text exactly (pinned by tests/unit/i18n-ai-provider-text.test.ts). `zeroInListing` is the note written
 * for a zero-priced model found in a provider's listing; `{note}` is that provider's registry free-tier note.
 */
export const MODEL_FREE_NOTES_EN = {
  geminiFreeTier: "Free of charge on the Free tier (quota-limited; content used to improve Google products). Flowline can't confirm a key is on the free tier, so the paid price is used.",
  listedFree: 'Listed as "Free"; quota and durability are not stated.',
  verifiedZero: "Verified zero price on the official pricing page.",
  zeroInListing: "Zero-priced in {provider}'s model list ({note})",
};

type ProviderLike = Pick<ProviderDefinition, "freeTier" | "privacy" | "verdictEvidence"> & { termsNotes?: string | null; notes?: string | null };

/** The registry prose of one provider, by field (absent fields omitted). */
export function proseOf(p: ProviderLike): Partial<Record<ProseField, string>> {
  const out: Partial<Record<ProseField, string>> = { freeTier: p.freeTier.note, privacy: p.privacy.note };
  if (p.termsNotes) out.terms = p.termsNotes;
  out.verdict = p.verdictEvidence;
  if (p.notes) out.notes = p.notes;
  return out;
}

/** Descriptive option labels (not bare API names), by connection-field key and option value. */
export function optionsOf(p: Pick<ProviderDefinition, "connectionFields">): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const f of p.connectionFields ?? []) {
    for (const o of f.options ?? []) {
      if (API_NAME_LABELS.has(o.label)) continue;
      (out[f.key] ??= {})[o.value] = o.label;
    }
  }
  return out;
}

/** The English `aiProviderText` catalogue, generated from the registry so it can't drift from it. */
export function aiProviderEnglish() {
  const providers: Record<string, Record<string, unknown>> = {};
  for (const p of PROVIDERS) {
    const options = optionsOf(p);
    providers[p.id] = { ...proseOf(p), ...(Object.keys(options).length ? { options } : {}) };
  }
  const retired: Record<string, { evidence: string }> = {};
  for (const r of RETIRED_NOT_ADDED) retired[r.id] = { evidence: r.evidence };
  return { providers, retired, modelFree: { ...MODEL_FREE_NOTES_EN } };
}

const EN = aiProviderEnglish();

function enAt(path: string[]): unknown {
  let node: unknown = EN;
  for (const part of path) node = node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
  return node;
}

/** The translation of `shown` at `aiProviderText.<path>` — only when `shown` is the English it was written for. */
function translated(t: Translator, path: string[], shown: string): string {
  if (enAt(path) !== shown) return shown;
  const last = path[path.length - 1]!;
  return dataText(t, ["aiProviderText", ...path.slice(0, -1)].join("."), last, shown);
}

type ProviderDto = { id: string; freeTier: { note: string }; privacy: { note: string }; verdictEvidence: string; termsNotes?: string | null; notes?: string | null };

export function providerFreeTierNote(t: Translator, p: Pick<ProviderDto, "id" | "freeTier">): string {
  return translated(t, ["providers", p.id, "freeTier"], p.freeTier.note);
}

export function providerPrivacyNote(t: Translator, p: Pick<ProviderDto, "id" | "privacy">): string {
  return translated(t, ["providers", p.id, "privacy"], p.privacy.note);
}

export function providerTermsNotes(t: Translator, p: Pick<ProviderDto, "id" | "termsNotes">): string | null {
  return p.termsNotes ? translated(t, ["providers", p.id, "terms"], p.termsNotes) : null;
}

export function providerVerdictEvidence(t: Translator, p: Pick<ProviderDto, "id" | "verdictEvidence">): string {
  return translated(t, ["providers", p.id, "verdict"], p.verdictEvidence);
}

export function providerNotes(t: Translator, p: Pick<ProviderDto, "id" | "notes">): string | null {
  return p.notes ? translated(t, ["providers", p.id, "notes"], p.notes) : null;
}

export function providerOptionLabel(t: Translator, providerId: string, fieldKey: string, option: { value: string; label: string }): string {
  return translated(t, ["providers", providerId, "options", fieldKey, option.value], option.label);
}

export function retiredEvidence(t: Translator, r: { id: string; evidence: string }): string {
  return translated(t, ["retired", r.id, "evidence"], r.evidence);
}

const [ZERO_PREFIX, ZERO_MIDDLE, ZERO_SUFFIX] = (() => {
  const tpl = MODEL_FREE_NOTES_EN.zeroInListing;
  const a = tpl.indexOf("{provider}");
  const b = tpl.indexOf("{note}");
  return [tpl.slice(0, a), tpl.slice(a + "{provider}".length, b), tpl.slice(b + "{note}".length)];
})();

/** A model's stored free-use note (model picker) in the UI language; unknown or older notes are shown as-is. */
export function modelFreeNote(t: Translator, m: { provider: string; providerName: string; freeTierNote: string | null }): string | null {
  const note = m.freeTierNote;
  if (!note) return null;
  for (const [key, en] of Object.entries(MODEL_FREE_NOTES_EN)) {
    if (key !== "zeroInListing" && en === note) return translated(t, ["modelFree", key], note);
  }
  const head = `${ZERO_PREFIX}${m.providerName}${ZERO_MIDDLE}`;
  if (note.startsWith(head) && note.endsWith(ZERO_SUFFIX) && note.length > head.length + ZERO_SUFFIX.length) {
    const inner = note.slice(head.length, note.length - ZERO_SUFFIX.length);
    const def = PROVIDERS.find((p) => p.id === m.provider);
    if (!def || def.freeTier.note !== inner) return note;
    const text = dataText(t, "aiProviderText.modelFree", "zeroInListing", "", { provider: m.providerName, note: providerFreeTierNote(t, { id: m.provider, freeTier: { note: inner } }) });
    return text || note;
  }
  return note;
}
