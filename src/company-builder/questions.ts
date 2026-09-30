import type { Department, Facts } from "./model";

/**
 * Reviewed question bank (versioned). Questions are chosen by deterministic rules, never invented by a model.
 * Copy lives in the i18n catalogue: `companyBuilder.q.<id>.title|reason` and `companyBuilder.opt.<option>`.
 *
 * Every question declares: the fact it fills, when it is shown, why it is asked, the answer schema, how sensitive the
 * answer is, whether "don't know yet" is allowed, and whether it is essential for the stop rule.
 */
export const QUESTION_BANK_VERSION = 1;

export type AnswerKind = "single" | "multi" | "text";
export type Sensitivity = "none" | "business" | "financial" | "personal";

export interface Question {
  id: string;
  /** Fact key this question fills. */
  target: string;
  kind: AnswerKind;
  options?: readonly string[];
  /** Max characters for text answers. */
  maxLength?: number;
  /** Shown only when true (facts already known). */
  when: (f: FactView) => boolean;
  sensitivity: Sensitivity;
  allowUnknown: boolean;
  /** Department this question belongs to (null = core). */
  department: Department | null;
  /** Needed before the plan can be called complete. */
  essential: boolean;
  /** Asking order: 0 core, 1 department essentials, 2 team/tools, 3 department details, 4 other areas (then index). */
  stage: 0 | 1 | 2 | 3 | 4;
  /** Optional: skip even when shown by `when` (e.g. the plan no longer changes). */
  skipIf?: (f: FactView) => boolean;
}

/** Read-only view of facts for conditions: the value of a fact that is confirmed or inferred (not unknown). */
export interface FactView {
  get(key: string): string | string[] | null;
  has(key: string, value: string): boolean;
  departments(): Department[];
}

export function factView(facts: Facts): FactView {
  const get = (key: string) => {
    const f = facts[key];
    if (!f || f.status === "unknown") return null;
    return f.value;
  };
  const has = (key: string, value: string) => {
    const v = get(key);
    return Array.isArray(v) ? v.includes(value) : v === value;
  };
  return {
    get,
    has,
    departments: () => activeDepartments(facts),
  };
}

export const DEPARTMENT_OPTIONS = ["customer", "finance", "content", "recruitment"] as const;
export const TOOL_OPTIONS = ["gmail", "google_sheets", "slack", "hubspot", "zendesk", "airtable", "notion", "stripe", "none", "other"] as const;
export const CURRENCY_OPTIONS = ["SAR", "AED", "EGP", "USD", "EUR", "other"] as const;

/** Departments the plan covers: the first outcome plus any other areas the person chose (deduplicated, ordered). */
export function activeDepartments(facts: Facts): Department[] {
  const out: Department[] = [];
  const first = facts.first_outcome;
  if (first && first.status !== "unknown" && typeof first.value === "string" && (DEPARTMENT_OPTIONS as readonly string[]).includes(first.value)) out.push(first.value as Department);
  const other = facts.other_areas;
  if (other && other.status !== "unknown" && Array.isArray(other.value)) {
    for (const d of other.value) if ((DEPARTMENT_OPTIONS as readonly string[]).includes(d) && !out.includes(d as Department)) out.push(d as Department);
  }
  return out;
}

const inDept = (d: Department) => (f: FactView) => f.departments().includes(d);

export const QUESTIONS: readonly Question[] = [
  { id: "situation", stage: 0, target: "situation", kind: "single", options: ["start", "improve", "client"], when: () => true, sensitivity: "none", allowUnknown: false, department: null, essential: true },
  { id: "client_name", stage: 0, target: "client_name", kind: "text", maxLength: 80, when: (f) => f.has("situation", "client"), sensitivity: "business", allowUnknown: false, department: null, essential: true },
  { id: "offering", stage: 0, target: "offering", kind: "text", maxLength: 600, when: () => true, sensitivity: "business", allowUnknown: true, department: null, essential: false },
  { id: "first_outcome", stage: 0, target: "first_outcome", kind: "single", options: [...DEPARTMENT_OPTIONS, "other"], when: () => true, sensitivity: "none", allowUnknown: true, department: null, essential: true },
  { id: "team", stage: 2, target: "team_size", kind: "single", options: ["solo", "small", "medium", "large"], when: () => true, sensitivity: "business", allowUnknown: true, department: null, essential: false },
  { id: "tools", stage: 2, target: "tools", kind: "multi", options: TOOL_OPTIONS, when: () => true, sensitivity: "none", allowUnknown: true, department: null, essential: false },
  { id: "tools_other", stage: 2, target: "tools_other", kind: "text", maxLength: 200, when: (f) => f.has("tools", "other"), sensitivity: "none", allowUnknown: true, department: null, essential: false },

  // Customer follow-up: where requests arrive, what happens next, who approves replies.
  { id: "cust_channel", stage: 1, target: "customer.channel", kind: "single", options: ["email", "form", "chat", "phone"], when: inDept("customer"), sensitivity: "none", allowUnknown: true, department: "customer", essential: true },
  { id: "cust_next", stage: 3, target: "customer.next", kind: "single", options: ["reply", "route", "ticket"], when: inDept("customer"), sensitivity: "none", allowUnknown: true, department: "customer", essential: false },
  { id: "cust_reviewer", stage: 1, target: "customer.reviewer", kind: "single", options: ["owner", "team_member"], when: inDept("customer"), sensitivity: "none", allowUnknown: true, department: "customer", essential: true },
  { id: "cust_info", stage: 3, target: "customer.approved_info", kind: "text", maxLength: 1200, when: inDept("customer"), skipIf: (f) => f.has("customer.next", "route") || f.has("customer.next", "ticket"), sensitivity: "business", allowUnknown: true, department: "customer", essential: false },

  // Finance: where documents live, extraction vs ledger/report, reviewer. Currency is never guessed.
  { id: "fin_location", stage: 1, target: "finance.location", kind: "single", options: ["email", "drive", "paper", "accounting_software"], when: inDept("finance"), sensitivity: "financial", allowUnknown: true, department: "finance", essential: true },
  { id: "fin_need", stage: 3, target: "finance.need", kind: "single", options: ["extraction", "ledger", "report"], when: inDept("finance"), sensitivity: "financial", allowUnknown: true, department: "finance", essential: false },
  { id: "fin_currency", stage: 1, target: "finance.currency", kind: "multi", options: CURRENCY_OPTIONS, when: inDept("finance"), sensitivity: "financial", allowUnknown: true, department: "finance", essential: true },
  { id: "fin_reviewer", stage: 1, target: "finance.reviewer", kind: "single", options: ["owner", "accountant", "team_member"], when: inDept("finance"), sensitivity: "financial", allowUnknown: true, department: "finance", essential: true },

  // Recruitment: planned (not operational) — one question tells the plan which coordination need it is.
  { id: "rec_need", stage: 1, target: "recruitment.need", kind: "single", options: ["job_description", "scheduling", "applicant_summary"], when: inDept("recruitment"), sensitivity: "personal", allowUnknown: true, department: "recruitment", essential: true },
  { id: "hiring", stage: 3, target: "hiring", kind: "single", options: ["hiring_now", "later", "no"], when: inDept("recruitment"), sensitivity: "business", allowUnknown: true, department: "recruitment", essential: false },

  // Content/design: the output type decides what is actually supported.
  { id: "content_output", stage: 1, target: "content.output", kind: "multi", options: ["copy_text", "social_posts", "images", "design_files", "video"], when: inDept("content"), sensitivity: "none", allowUnknown: true, department: "content", essential: true },
  { id: "content_reviewer", stage: 1, target: "content.reviewer", kind: "single", options: ["owner", "team_member"], when: inDept("content"), sensitivity: "none", allowUnknown: true, department: "content", essential: true },

  // Asked after the first outcome's questions: other areas extend the plan (their questions follow).
  { id: "other_areas", stage: 4, target: "other_areas", kind: "multi", options: [...DEPARTMENT_OPTIONS, "none"], when: (f) => f.get("first_outcome") !== null, sensitivity: "none", allowUnknown: true, department: null, essential: false },
] as const;

export const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

/** Hard cap: the interview never asks more than this many questions (no unlimited questioning). */
export const MAX_QUESTIONS = 18;
