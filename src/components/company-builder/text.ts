import type { Fact } from "@/company-builder/model";
import { QUESTION_BY_TARGET, optionCopyId } from "@/company-builder/questions";
import type { Translator } from "@/i18n/translate";
import type { MessageKey } from "@/i18n/types";

/** Catalogue lookup for data-driven ids (question/option/task ids) with a visible fallback — never invented text. */
export const cbt = (t: Translator, key: string, vars?: Record<string, string | number>, fallback?: string) => {
  const full = `companyBuilder.${key}`;
  return t.has(full) ? t(full as MessageKey, vars) : (fallback ?? key);
};

/** Option label; "other" and a few clashing option values have question-specific copy (see optionCopyId). */
export function optionLabel(t: Translator, questionId: string | null, option: string) {
  return cbt(t, `opt.${optionCopyId(questionId, option)}`, undefined, option);
}

/** A fact's value for display: option ids are translated; free text stays exactly as typed (React escapes it). */
export function factText(t: Translator, key: string, fact: Fact | undefined | null): string {
  if (!fact || fact.status === "unknown" || fact.value == null) return cbt(t, "facts.status.unknown");
  const q = QUESTION_BY_TARGET.get(key);
  const one = (v: string) => (q?.options?.includes(v) ? optionLabel(t, q.id, v) : t.has(`companyBuilder.opt.${v}`) ? optionLabel(t, null, v) : v);
  return Array.isArray(fact.value) ? fact.value.map(one).join(", ") : one(fact.value);
}

export const fieldLabel = (t: Translator, key: string) => cbt(t, `facts.field.${key}`, undefined, key);
