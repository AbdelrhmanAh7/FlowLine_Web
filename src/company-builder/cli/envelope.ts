import { z } from "zod";
import { activeDepartments } from "../questions";
import type { CompanyBlueprint, Facts, TaskPlan } from "../model";
import { PACKS } from "../packs";

/**
 * Typed job envelope for the OWNER_CLI_PROTOTYPE. It is the ONLY thing a CLI job receives: a minimal, sanitised
 * brief and the allowed catalogue. No credentials, file paths, executables, flags or working directories — those are
 * fixed on the server. The UI never supplies anything but a job kind and the interview id.
 */

export const CLI_KINDS = ["claude", "codex"] as const;
export type CliKind = (typeof CLI_KINDS)[number];
export const JOB_KINDS = ["blueprint", "text_trial"] as const;

export const MAX_ENVELOPE_BYTES = 16 * 1024;
export const MAX_OUTPUT_BYTES = 64 * 1024;
export const DEFAULT_TIMEOUT_MS = 180_000;
export const MAX_REPAIRS = 1;

/** Removes control characters, e-mail addresses and long digit runs (phones, IBANs, card numbers). */
export function sanitiseText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[number]")
    .trim()
    .slice(0, max);
}

const briefSchema = z.object({
  situation: z.string().max(16),
  departments: z.array(z.string().max(16)).max(4),
  offering: z.string().max(600),
  tools: z.array(z.string().max(32)).max(12),
  currencies: z.array(z.string().regex(/^[A-Z]{3}$/)).max(6),
  approvedInfo: z.string().max(1200),
});

export const envelopeSchema = z.discriminatedUnion("kind", [
  z.object({
    v: z.literal(1),
    kind: z.literal("blueprint"),
    jobId: z.string().uuid(),
    cli: z.enum(CLI_KINDS),
    brief: briefSchema,
    /** The base plan's task ids — the proposal may only include/exclude these and tune their params. */
    baseTasks: z.array(z.object({ id: z.string().max(48), packId: z.string().max(48).nullable(), department: z.string().max(16) })).max(12),
    catalogue: z.array(z.object({ id: z.string(), version: z.number(), department: z.string(), capabilities: z.array(z.string()) })).max(10),
  }),
  z.object({
    v: z.literal(1),
    kind: z.literal("text_trial"),
    jobId: z.string().uuid(),
    cli: z.enum(CLI_KINDS),
    taskId: z.enum(["customer-follow-up", "customer-triage"]),
    /** Synthetic, owner-supplied request text (sanitised). */
    text: z.string().min(1).max(2000),
  }),
]);
export type Envelope = z.infer<typeof envelopeSchema>;

/** Proposal a blueprint job may return. It can't add tasks, packs, tools or permissions — only choose and tune. */
export const blueprintProposalSchema = z
  .object({
    tasks: z
      .array(
        z
          .object({
            taskId: z.string().max(48),
            include: z.boolean(),
            /** Model-written rationale, shown labelled as unverified model text (never used as a fact or as reply content). */
            note: z.string().max(200).default(""),
            /** The owner's approved information and confirmed facts are NOT editable by a model; currencies can only be narrowed. */
            params: z
              .object({ currencies: z.array(z.string().regex(/^[A-Z]{3}$/)).max(6).optional() })
              .strict()
              .default({}),
          })
          .strict(),
      )
      .max(12),
    notes: z.string().max(300).default(""),
  })
  .strict();
export type BlueprintProposal = z.infer<typeof blueprintProposalSchema>;

/** Text-trial result: structured fields extracted from a free-form synthetic request. */
export const textTrialResultSchema = z
  .object({
    from: z.string().max(200),
    subject: z.string().max(200),
    body: z.string().max(2000),
    language: z.enum(["ar", "en"]),
  })
  .strict();

/** JSON Schemas handed to the CLIs' structured-output modes (derived from the same contract). */
export const PROPOSAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tasks", "notes"],
  properties: {
    tasks: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["taskId", "include", "note", "params"],
        properties: {
          taskId: { type: "string", maxLength: 48 },
          include: { type: "boolean" },
          note: { type: "string", maxLength: 200 },
          params: { type: "object", additionalProperties: false, properties: { currencies: { type: "array", maxItems: 6, items: { type: "string", pattern: "^[A-Z]{3}$" } } } },
        },
      },
    },
    notes: { type: "string", maxLength: 300 },
  },
} as const;

export const TEXT_TRIAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["from", "subject", "body", "language"],
  properties: { from: { type: "string", maxLength: 200 }, subject: { type: "string", maxLength: 200 }, body: { type: "string", maxLength: 2000 }, language: { type: "string", enum: ["ar", "en"] } },
} as const;

const factStr = (f: Facts, k: string) => (f[k] && f[k]!.status !== "unknown" && typeof f[k]!.value === "string" ? (f[k]!.value as string) : "");
const factList = (f: Facts, k: string) => (f[k] && f[k]!.status !== "unknown" && Array.isArray(f[k]!.value) ? (f[k]!.value as string[]) : []);

export function buildBlueprintEnvelope(jobId: string, cli: CliKind, facts: Facts, base: CompanyBlueprint): Envelope {
  return envelopeSchema.parse({
    v: 1,
    kind: "blueprint",
    jobId,
    cli,
    brief: {
      situation: factStr(facts, "situation").slice(0, 16),
      departments: activeDepartments(Object.fromEntries(Object.entries(facts).filter(([, v]) => v.status === "confirmed"))),
      offering: sanitiseText(factStr(facts, "offering"), 600),
      tools: factList(facts, "tools").slice(0, 12),
      currencies: factList(facts, "finance.currency").filter((c) => /^[A-Z]{3}$/.test(c)),
      approvedInfo: sanitiseText(factStr(facts, "customer.approved_info"), 1200),
    },
    baseTasks: base.tasks.map((t) => ({ id: t.id, packId: t.packId, department: t.department })),
    catalogue: PACKS.map((p) => ({ id: p.id, version: p.version, department: p.department, capabilities: [...p.capabilities] })),
  });
}

/**
 * Merges a validated proposal into the deterministic base plan. Unknown task ids are ignored (and reported), tasks
 * are never added, and parameters are re-sanitised. The result still goes through validateBlueprint + storeBlueprint.
 */
export function applyProposal(base: CompanyBlueprint, proposal: BlueprintProposal, generator: CompanyBlueprint["generator"]): { blueprint: CompanyBlueprint; ignored: string[] } {
  const ignored: string[] = [];
  const byId = new Map(proposal.tasks.map((t) => [t.taskId, t]));
  for (const t of proposal.tasks) if (!base.tasks.some((b) => b.id === t.taskId)) ignored.push(t.taskId);
  const tasks: TaskPlan[] = [];
  for (const t of base.tasks) {
    const p = byId.get(t.id);
    if (p && !p.include) continue;
    const params = { ...t.params };
    // Only a subset of the owner-confirmed currencies (a model can't introduce one).
    if (p?.params.currencies && Array.isArray(t.params.currencies)) {
      const confirmed = t.params.currencies as string[];
      const narrowed = p.params.currencies.filter((c) => confirmed.includes(c));
      // An empty list would disable the unexpected-currency check: keep the confirmed list instead.
      if (narrowed.length > 0) params.currencies = narrowed;
    }
    if (p?.note) params.modelNote = sanitiseText(p.note, 200);
    tasks.push({ ...t, params });
  }
  const ids = new Set(tasks.map((t) => t.id));
  const roles = base.roles.map((r) => ({ ...r, tasks: r.tasks.filter((x) => ids.has(x)) })).filter((r) => r.tasks.length > 0);
  return { blueprint: { ...base, generator, tasks, roles }, ignored };
}
