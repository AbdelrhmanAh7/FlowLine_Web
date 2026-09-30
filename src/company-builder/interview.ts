import type { AnswerRecord, Department, Fact, Facts, FactValue, InterviewState } from "./model";
import { activeDepartments, factView, MAX_QUESTIONS, QUESTION_BANK_VERSION, QUESTION_BY_ID, QUESTIONS, type Question } from "./questions";

/**
 * Deterministic interview engine: pure functions over InterviewState. The server persists the state; the UI only
 * renders the question this returns. Nothing here calls a model.
 */

export function emptyState(): InterviewState {
  return { bankVersion: QUESTION_BANK_VERSION, facts: {}, answers: [], path: [] };
}

export class AnswerError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const now = () => new Date().toISOString();

/** Normalises and validates an answer against the question's schema. Throws AnswerError. */
export function parseAnswer(q: Question, raw: unknown, unknown: boolean): FactValue {
  if (unknown) {
    if (!q.allowUnknown) throw new AnswerError("UNKNOWN_NOT_ALLOWED");
    return null;
  }
  if (q.kind === "text") {
    if (typeof raw !== "string") throw new AnswerError("INVALID_ANSWER");
    // Control characters are stripped; the text is data (never instructions) and is always rendered escaped.
    const v = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
    if (!v) throw new AnswerError("EMPTY_ANSWER");
    if (v.length > (q.maxLength ?? 200)) throw new AnswerError("ANSWER_TOO_LONG");
    return v;
  }
  if (q.kind === "single") {
    if (typeof raw !== "string" || !q.options!.includes(raw)) throw new AnswerError("INVALID_OPTION");
    return raw;
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.some((x) => typeof x !== "string" || !q.options!.includes(x))) throw new AnswerError("INVALID_OPTION");
  return [...new Set(raw as string[])];
}

function setFact(facts: Facts, key: string, value: FactValue, patch: Pick<Fact, "status" | "source" | "questionId">): Facts {
  const prev = facts[key];
  return { ...facts, [key]: { value, ...patch, version: (prev?.version ?? 0) + 1, at: now(), conflict: null } };
}

/**
 * Records an answer. An answer confirms its fact (unless "don't know yet"); free text in `offering` additionally
 * produces INFERRED facts that are only suggestions until the person answers the matching question.
 */
export function applyAnswer(state: InterviewState, questionId: string, raw: unknown, unknown = false, source: "answer" | "correction" = "answer"): InterviewState {
  const q = QUESTION_BY_ID.get(questionId);
  if (!q) throw new AnswerError("UNKNOWN_QUESTION");
  const value = parseAnswer(q, raw, unknown);
  let facts = setFact(state.facts, q.target, value, { status: unknown ? "unknown" : "confirmed", source, questionId });
  if (q.id === "offering") {
    // A new description replaces what the previous one implied (answers are never touched).
    facts = Object.fromEntries(Object.entries(facts).filter(([, f]) => !(f.source === "inference" && f.questionId === "offering")));
    if (typeof value === "string") facts = applyInferences(facts, inferFromText(value));
  }
  facts = markContradictions(facts);
  const record: AnswerRecord = { questionId, value, unknown, at: now() };
  const path = state.path.includes(questionId) ? state.path : [...state.path, questionId];
  return { ...state, facts, answers: [...state.answers, record], path };
}

/* ───────────── Free-text interpretation (deterministic keyword rules; Arabic + English) ───────────── */

const DEPT_KEYWORDS: Record<Department, string[]> = {
  customer: ["customer", "inquiry", "inquiries", "enquiry", "enquiries", "support", "order", "booking", "client request", "عملاء", "العملاء", "استفسار", "طلبات", "دعم", "حجوزات", "الطلبات"],
  finance: ["invoice", "receipt", "accounting", "bookkeeping", "expense", "ledger", "فاتورة", "فواتير", "محاسب", "مصروفات", "إيصال", "ايصال", "دفاتر"],
  content: ["content", "social media", "marketing", "social post", "copywriting", "newsletter", "محتوى", "تسويق", "منشورات", "إعلان", "اعلان"],
  recruitment: ["hiring", "hire", "recruit", "recruiting", "recruitment", "candidate", "job post", "applicant", "توظيف", "مرشحين", "وظيفة", "متقدمين"],
};
const TOOL_KEYWORDS: Record<string, string[]> = {
  gmail: ["gmail", "جيميل"],
  google_sheets: ["google sheets", "sheets", "spreadsheet", "جوجل شيت", "شيت"],
  slack: ["slack", "سلاك"],
  hubspot: ["hubspot"],
  zendesk: ["zendesk"],
  airtable: ["airtable"],
  notion: ["notion", "نوشن"],
  stripe: ["stripe"],
};
/** Tools people name that Flowline has no integration for — disclosed as gaps, never silently dropped. */
export const UNSUPPORTED_TOOL_KEYWORDS: Record<string, string[]> = {
  whatsapp: ["whatsapp", "واتساب", "واتس"],
  quickbooks: ["quickbooks"],
  xero: ["xero"],
  zoho: ["zoho"],
  odoo: ["odoo"],
  shopify: ["shopify"],
  salla: ["salla"],
  zid: ["zid.sa", "zid store"],
  instagram: ["instagram", "انستغرام", "انستقرام"],
  excel_desktop: ["excel", "اكسل", "إكسل"],
  canva: ["canva", "كانفا"],
};

export interface Inference {
  departments: Department[];
  tools: string[];
  unsupportedTools: string[];
}

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Word-start match: Latin words on \b; Arabic words at a token start, allowing the attached prefixes و ف ب ل ال. */
const hit = (text: string, words: string[]) =>
  words.some((w) => (/^[\x00-\x7f]+$/.test(w) ? new RegExp(`\\b${esc(w)}(?:s|es|ed|ing)?\\b`, "i") : new RegExp(`(?:^|[^\u0600-\u06FF])(?:و|ف|ب|ل|ال|وال|بال|لل)?${esc(w)}`)).test(text));

export function inferFromText(text: string): Inference {
  const t = text.toLowerCase();
  const departments = (Object.keys(DEPT_KEYWORDS) as Department[]).filter((d) => hit(t, DEPT_KEYWORDS[d]));
  const tools = Object.keys(TOOL_KEYWORDS).filter((k) => hit(t, TOOL_KEYWORDS[k]!));
  const unsupportedTools = Object.keys(UNSUPPORTED_TOOL_KEYWORDS).filter((k) => hit(t, UNSUPPORTED_TOOL_KEYWORDS[k]!));
  return { departments, tools, unsupportedTools };
}

/** Inferences only fill facts nobody has answered; an inference never overwrites or confirms an answer. */
function applyInferences(facts: Facts, inf: Inference): Facts {
  let out = facts;
  const free = (key: string) => !out[key] || out[key]!.source === "inference";
  if (inf.departments.length && free("first_outcome")) out = setFact(out, "first_outcome", inf.departments[0]!, { status: "inferred", source: "inference", questionId: "offering" });
  if (inf.departments.length > 1 && free("other_areas")) out = setFact(out, "other_areas", inf.departments.slice(1), { status: "inferred", source: "inference", questionId: "offering" });
  if (inf.tools.length && free("tools")) out = setFact(out, "tools", inf.tools, { status: "inferred", source: "inference", questionId: "offering" });
  if (inf.unsupportedTools.length && free("tools_mentioned_unsupported")) out = setFact(out, "tools_mentioned_unsupported", inf.unsupportedTools, { status: "inferred", source: "inference", questionId: "offering" });
  return out;
}

/* ───────────── Contradictions ───────────── */

/** Rules that make a fact contradictory (it must be clarified, never guessed). */
export function markContradictions(facts: Facts): Facts {
  const out: Facts = { ...facts };
  const clear = (k: string) => {
    const f = out[k];
    if (f?.status === "contradictory") out[k] = { ...f, status: f.source === "inference" ? "inferred" : "confirmed", conflict: null };
  };
  const flag = (k: string, rule: string) => {
    const f = out[k];
    if (f && f.status !== "unknown") out[k] = { ...f, status: "contradictory", conflict: rule };
  };
  const solo = out.team_size?.value === "solo" && out.team_size.status === "confirmed";
  for (const k of ["customer.reviewer", "content.reviewer", "finance.reviewer"]) {
    clear(k);
    if (solo && out[k]?.value === "team_member") flag(k, "solo_team_reviewer");
  }
  clear("tools");
  const tools = out.tools?.value;
  if (Array.isArray(tools) && tools.includes("none") && tools.length > 1) flag("tools", "none_and_tools");
  return out;
}

/* ───────────── Question selection ───────────── */

function needsAsking(facts: Facts, q: Question): boolean {
  const f = facts[q.target];
  if (!f) return true;
  // Inferred facts are asked as a confirmation; contradictory facts are asked again. Known facts are never re-asked.
  return f.status === "inferred" || f.status === "contradictory";
}

const rank = (state: InterviewState, q: Question) => (state.facts[q.target]?.status === "contradictory" ? -1 : q.stage);

export function eligibleQuestions(state: InterviewState): Question[] {
  const view = factView(state.facts);
  return QUESTIONS.map((q, i) => ({ q, i }))
    .filter(({ q }) => q.when(view) && !q.skipIf?.(view) && needsAsking(state.facts, q))
    // A contradiction is clarified first; then the normal asking order.
    .sort((a, b) => rank(state, a.q) - rank(state, b.q) || a.i - b.i)
    .map(({ q }) => q);
}

/** The next question, or null when nothing that would change the plan is left (or the cap is reached). */
export function nextQuestion(state: InterviewState): Question | null {
  if (state.path.length >= MAX_QUESTIONS) return null;
  return eligibleQuestions(state)[0] ?? null;
}

/** Back: the question answered before `current` (or the last one answered), for re-answering. */
export function previousQuestion(state: InterviewState, currentId: string | null): Question | null {
  const idx = currentId ? state.path.indexOf(currentId) : -1;
  const prevId = idx > 0 ? state.path[idx - 1] : idx === -1 ? state.path.at(-1) : undefined;
  return prevId ? (QUESTION_BY_ID.get(prevId) ?? null) : null;
}

/* ───────────── Stop rule ───────────── */

export interface Readiness {
  /** Outcome, data source, trigger, reviewer and a feasible capability are all known. */
  complete: boolean;
  /** Essential facts still unknown/unanswered/contradictory (fact keys). */
  missing: string[];
  departments: Department[];
}

export function readiness(state: InterviewState): Readiness {
  const view = factView(state.facts);
  const departments = activeDepartments(state.facts);
  const missing: string[] = [];
  for (const q of QUESTIONS) {
    if (!q.essential || !q.when(view)) continue;
    const f = state.facts[q.target];
    if (!f || f.status !== "confirmed") missing.push(q.target);
  }
  if (departments.length === 0 && !missing.includes("first_outcome")) missing.push("first_outcome");
  return { complete: missing.length === 0, missing, departments };
}

/** A correction from the review screen: new version of the fact, provenance "correction". */
export function correctFact(state: InterviewState, questionId: string, raw: unknown, unknown = false): InterviewState {
  return applyAnswer(state, questionId, raw, unknown, "correction");
}

/** Only the questions a person actually answered count (no fake fixed total for branching paths). */
export function answeredCount(state: InterviewState) {
  return state.path.length;
}
