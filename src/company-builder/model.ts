import { z } from "zod";

/**
 * Company Builder domain model (versioned). Everything a model/CLI or an import proposes is parsed with these schemas
 * and re-validated by Flowline; nothing here is trusted because it parsed.
 */

export const CB_SCHEMA_VERSION = 1;

/** The three modes the brief keeps distinct. CUSTOMER_CLOUD is not enabled by this feature. */
export const CB_MODES = ["DETERMINISTIC_TEST", "OWNER_CLI_PROTOTYPE", "CUSTOMER_CLOUD"] as const;
export type CbMode = (typeof CB_MODES)[number];

export const DEPARTMENTS = ["customer", "finance", "operations", "sales", "content", "recruitment"] as const;
export type Department = (typeof DEPARTMENTS)[number];

/* ───────────── Facts ───────────── */

export const FACT_STATUSES = ["confirmed", "inferred", "contradictory", "unknown"] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

/** Where a fact came from. `inference` = derived from free text; never promoted to confirmed without an answer. */
export const FACT_SOURCES = ["answer", "inference", "correction", "sample", "import"] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

export const factValue = z.union([z.string().max(2000), z.array(z.string().max(200)).max(20), z.null()]);
export type FactValue = z.infer<typeof factValue>;

export const factSchema = z.object({
  value: factValue,
  status: z.enum(FACT_STATUSES),
  source: z.enum(FACT_SOURCES),
  questionId: z.string().max(64).nullable(),
  version: z.number().int().min(1),
  at: z.string(),
  /** Contradiction explanation (a rule id), set only when status = contradictory. */
  conflict: z.string().max(64).nullable().default(null),
});
export type Fact = z.infer<typeof factSchema>;
export type Facts = Record<string, Fact>;

/* ───────────── Interview ───────────── */

export const answerRecord = z.object({ questionId: z.string().max(64), value: factValue, unknown: z.boolean(), at: z.string() });
export type AnswerRecord = z.infer<typeof answerRecord>;

export interface InterviewState {
  bankVersion: number;
  facts: Facts;
  /** Chronological answers (history, never rewritten). */
  answers: AnswerRecord[];
  /** Question ids the person answered or skipped, in order — used for Back. */
  path: string[];
}

/* ───────────── Blueprint ───────────── */

export const TASK_KINDS = ["workflow", "agent"] as const;
export const TASK_AVAILABILITY = ["operational", "planned", "unsupported"] as const;

export const connectionRefSchema = z.object({
  provider: z.string().max(40),
  status: z.enum(["connected", "missing", "unsupported", "not_needed"]),
  connectionId: z.string().uuid().nullable().default(null),
});

export const taskPlanSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,48}$/),
  roleId: z.string().regex(/^[a-z0-9-]{1,48}$/),
  department: z.enum(DEPARTMENTS),
  packId: z.string().max(48).nullable(),
  packVersion: z.number().int().min(1).nullable(),
  kind: z.enum(TASK_KINDS),
  availability: z.enum(TASK_AVAILABILITY),
  /** Stable i18n justification id: why a workflow (fixed steps) or a bounded agent (interpretation). */
  justification: z.string().max(64),
  trigger: z.object({ kind: z.enum(["manual_sample", "email", "form", "chat", "upload", "schedule", "unknown"]), status: z.enum(["ready", "needs_connection", "unsupported", "unknown"]) }),
  inputContract: z.string().max(64),
  outputContract: z.string().max(64),
  reviewer: z.enum(["owner", "team_member", "accountant", "unknown"]),
  permissions: z.array(z.string().max(40)).max(10),
  limits: z.object({ maxItemsPerRun: z.number().int().min(1).max(500), maxRunsPerDay: z.number().int().min(1).max(1000) }),
  connections: z.array(connectionRefSchema).max(8),
  unavailable: z.array(z.string().max(48)).max(10),
  usage: z.enum(["none", "unknown"]),
  params: z.record(z.string(), z.union([z.string().max(1500), z.number(), z.boolean(), z.array(z.string().max(300)).max(20)])),
  acceptanceFixtures: z.array(z.string().max(48)).max(10),
  dependsOn: z.array(z.string().max(48)).max(5),
  /** Business-language steps (i18n ids `companyBuilder.node.<pack>.<step>`), in order. */
  steps: z.array(z.string().max(48)).max(12).default([]),
  /** Who does what: automated by Flowline, prepared for a person (assisted), or kept with a person (human only). */
  work: z
    .object({ automated: z.array(z.string().max(48)).max(10), assisted: z.array(z.string().max(48)).max(10), human: z.array(z.string().max(48)).max(10) })
    .default({ automated: [], assisted: [], human: [] }),
});
export type TaskPlan = z.infer<typeof taskPlanSchema>;

export const digitalRoleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,48}$/),
  department: z.enum(DEPARTMENTS),
  tasks: z.array(z.string()).max(6),
  /** Knowledge scoped to this role only (cross-department ACL). */
  knowledge: z.array(z.string().max(48)).max(5),
  /** What the role must never do (i18n ids `companyBuilder.doesNot.<id>`). A role is a responsibility, not an avatar. */
  doesNot: z.array(z.string().max(48)).max(8).default([]),
});
export type DigitalRole = z.infer<typeof digitalRoleSchema>;

export const blockerSchema = z.object({ code: z.string().max(48), department: z.enum(DEPARTMENTS).nullable(), params: z.record(z.string(), z.string().max(200)).default({}) });
export type Blocker = z.infer<typeof blockerSchema>;

export const assumptionSchema = z.object({ fact: z.string().max(64), status: z.enum(FACT_STATUSES), value: factValue });

export const blueprintSchema = z.object({
  schemaVersion: z.literal(CB_SCHEMA_VERSION),
  sessionId: z.string().uuid(),
  profileVersion: z.number().int().min(1),
  generator: z.enum(["deterministic", "cli_claude", "cli_codex", "cli_import"]),
  situation: z.enum(["start", "improve", "client"]),
  clientName: z.string().max(80).nullable(),
  outcomes: z.array(z.object({ department: z.enum(DEPARTMENTS), primary: z.boolean() })).max(4),
  roles: z.array(digitalRoleSchema).max(6),
  tasks: z.array(taskPlanSchema).max(12),
  assumptions: z.array(assumptionSchema).max(40),
  blockers: z.array(blockerSchema).max(30),
  sampleData: z.boolean(),
  complete: z.boolean(),
  /** The ONE primary outcome this plan prepares (outcome first, not company structure). */
  goal: z.object({ department: z.enum(DEPARTMENTS).nullable() }).default({ department: null }),
  /** Later opportunities — shown separately, never installed or activated automatically. */
  nextImprovements: z
    .array(z.object({ id: z.string().max(48), department: z.enum(DEPARTMENTS).nullable(), kind: z.enum(["pack", "agent", "planned"]) }))
    .max(10)
    .default([]),
  /** Cost disclosure before any trial decision or checkout. Unknowns are stated, never estimated. */
  cost: z
    .object({
      ai: z.enum(["none", "byok_unknown"]),
      externalServices: z.array(z.string().max(40)).max(8),
      executionsPerMonth: z.tuple([z.number().int().min(0), z.number().int().min(0)]).nullable(),
      unknown: z.array(z.string().max(48)).max(8),
    })
    .default({ ai: "none", externalServices: [], executionsPerMonth: null, unknown: [] }),
});
export type CompanyBlueprint = z.infer<typeof blueprintSchema>;

/* ───────────── Task lifecycle (Milestone C) ───────────── */

export const TASK_STATES = ["plan_draft", "requires_setup", "sample_verified", "live_verified", "approval_required", "active", "paused", "failed"] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** Provenance of a trial/result — never blurred together. */
export const PROVENANCE = ["deterministic_calculation", "mocked_integration", "real_cli", "real_service", "imported_cli_claim"] as const;
export type Provenance = (typeof PROVENANCE)[number];

/** Four results kept apart: graph validation, execution, objective checks, and the person's own acceptance. */
export interface TrialVerdict {
  structurallyValid: boolean;
  ranWithoutErrors: boolean;
  /** Objective business checks (independent re-computation). */
  matchedOutcome: boolean;
  checks: { id: string; passed: boolean }[];
}
export type UserVerdict = "accepted" | "rejected";
