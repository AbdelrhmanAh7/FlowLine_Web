import { inferFromText, readiness, UNSUPPORTED_TOOL_KEYWORDS } from "./interview";
import { CB_SCHEMA_VERSION, type Blocker, type CompanyBlueprint, type Department, type Facts, type InterviewState, type TaskPlan } from "./model";
import { customerTriagePack } from "./packs/customer-triage";
import { contentBriefPack } from "./packs/content-brief";
import { invoiceOrganiserPack } from "./packs/invoice-organiser";

/**
 * Deterministic blueprint composer (DETERMINISTIC_TEST mode and the fallback for every other mode). Roles and tasks
 * come only from registered packs; everything the plan can't do is listed as a blocker or an unavailable capability.
 */

export interface PlanContext {
  sessionId: string;
  profileVersion: number;
  /** Workspace connections (provider + status) — used only to report connection status, never credentials. */
  connections: { id: string; provider: string; status: string }[];
  /** UI language of the owner (sample data + template copy language). */
  language: "ar" | "en";
}

const str = (f: Facts, k: string) => {
  const v = f[k];
  return v && v.status !== "unknown" && typeof v.value === "string" ? v.value : null;
};
const list = (f: Facts, k: string) => {
  const v = f[k];
  return v && v.status !== "unknown" && Array.isArray(v.value) ? v.value : [];
};
const confirmed = (f: Facts, k: string) => f[k]?.status === "confirmed";

type Reviewer = TaskPlan["reviewer"];
const reviewerOf = (f: Facts, k: string): Reviewer => {
  const v = str(f, k);
  return confirmed(f, k) && (v === "owner" || v === "team_member" || v === "accountant") ? v : "unknown";
};

function connectionRef(ctx: PlanContext, provider: string): TaskPlan["connections"][number] {
  const c = ctx.connections.find((x) => x.provider === provider && x.status === "active");
  return { provider, status: c ? "connected" : "missing", connectionId: c?.id ?? null };
}

const BASE_LIMITS = { maxItemsPerRun: 50, maxRunsPerDay: 100 };

function customerTasks(f: Facts, ctx: PlanContext, blockers: Blocker[]): TaskPlan[] {
  const channel = str(f, "customer.channel");
  const info = str(f, "customer.approved_info") ?? "";
  const reviewer = reviewerOf(f, "customer.reviewer");
  const trigger: TaskPlan["trigger"] =
    channel === "email" ? { kind: "email", status: "needs_connection" } : channel === "form" ? { kind: "form", status: "ready" } : channel === "chat" || channel === "phone" ? { kind: channel === "chat" ? "chat" : "unknown", status: "unsupported" } : { kind: "unknown", status: "unknown" };
  const connections = channel === "email" ? [connectionRef(ctx, "gmail")] : [];
  const unavailable: string[] = [];
  if (trigger.status === "unsupported") {
    unavailable.push(channel === "chat" ? "chat_channel" : "phone_channel");
    blockers.push({ code: "channel_not_supported", department: "customer", params: { channel: channel ?? "" } });
  }
  if (!info.trim()) blockers.push({ code: "approved_info_missing", department: "customer", params: {} });
  const tasks: TaskPlan[] = [
    {
      id: "customer-triage",
      roleId: "customer-desk",
      department: "customer",
      packId: customerTriagePack.id,
      packVersion: customerTriagePack.version,
      kind: "workflow",
      availability: "operational",
      justification: "fixed_steps",
      trigger,
      inputContract: customerTriagePack.inputContract,
      outputContract: customerTriagePack.outputContract,
      reviewer,
      permissions: ["flow.run", "approval.decide"],
      limits: BASE_LIMITS,
      connections,
      unavailable,
      usage: "none",
      params: { approvedInfo: info.slice(0, 1200), language: ctx.language },
      acceptanceFixtures: customerTriagePack.fixtures({}).map((x) => x.id),
      dependsOn: [],
    },
  ];
  // A bounded agent only where interpretation adds value AND there is approved knowledge to ground it.
  if (info.trim() && str(f, "customer.next") !== "route") {
    tasks.push({
      id: "customer-answers",
      roleId: "customer-desk",
      department: "customer",
      packId: null,
      packVersion: null,
      kind: "agent",
      availability: "operational",
      justification: "interpretation_needs_agent",
      trigger: { kind: "manual_sample", status: "ready" },
      inputContract: "free_text_question_v1",
      outputContract: "answer_with_citations_v1",
      reviewer,
      permissions: ["agent.run"],
      limits: { maxItemsPerRun: 1, maxRunsPerDay: 50 },
      connections: [{ provider: "ai", status: "missing", connectionId: null }],
      unavailable: [],
      usage: "unknown",
      params: { approvedInfo: info.slice(0, 1200) },
      acceptanceFixtures: [],
      dependsOn: [],
    });
  }
  return tasks;
}

function financeTasks(f: Facts, ctx: PlanContext, blockers: Blocker[]): TaskPlan[] {
  const location = str(f, "finance.location");
  const currencies = list(f, "finance.currency").filter((c) => /^[A-Z]{3}$/.test(c));
  const unavailable: string[] = [];
  let trigger: TaskPlan["trigger"] = { kind: "upload", status: "ready" };
  const connections: TaskPlan["connections"] = [];
  if (location === "email") {
    trigger = { kind: "email", status: "needs_connection" };
    connections.push(connectionRef(ctx, "gmail"));
  } else if (location === "drive") {
    unavailable.push("drive_folder_watch");
    blockers.push({ code: "drive_not_supported", department: "finance", params: {} });
  } else if (location === "paper") {
    unavailable.push("ocr_scanned_paper");
    blockers.push({ code: "paper_needs_digital_copy", department: "finance", params: {} });
  } else if (location === "accounting_software") {
    unavailable.push("accounting_software_sync");
    blockers.push({ code: "accounting_software_not_supported", department: "finance", params: {} });
  } else if (!location) trigger = { kind: "unknown", status: "unknown" };
  if (currencies.length === 0) blockers.push({ code: "currency_unknown", department: "finance", params: {} });
  if (list(f, "finance.currency").includes("other")) blockers.push({ code: "currency_other_needs_code", department: "finance", params: {} });
  if (str(f, "finance.need") === "ledger") connections.push(connectionRef(ctx, "google_sheets"));
  return [
    {
      id: "invoice-organiser",
      roleId: "finance-desk",
      department: "finance",
      packId: invoiceOrganiserPack.id,
      packVersion: invoiceOrganiserPack.version,
      kind: "workflow",
      availability: "operational",
      justification: "fixed_steps",
      trigger,
      inputContract: invoiceOrganiserPack.inputContract,
      outputContract: invoiceOrganiserPack.outputContract,
      reviewer: reviewerOf(f, "finance.reviewer"),
      permissions: ["flow.run", "approval.decide"],
      limits: BASE_LIMITS,
      connections,
      unavailable: [...unavailable, "tax_filing", "payments"],
      usage: "none",
      params: { currencies, language: ctx.language },
      acceptanceFixtures: invoiceOrganiserPack.fixtures({}).map((x) => x.id),
      dependsOn: [],
    },
  ];
}

function contentTasks(f: Facts, ctx: PlanContext, blockers: Blocker[]): TaskPlan[] {
  const outputs = list(f, "content.output");
  const unsupported = outputs.filter((o) => o === "images" || o === "design_files" || o === "video");
  for (const o of unsupported) blockers.push({ code: "content_output_not_supported", department: "content", params: { output: o } });
  const textWanted = outputs.length === 0 || outputs.some((o) => o === "copy_text" || o === "social_posts");
  return [
    {
      id: "content-brief",
      roleId: "content-desk",
      department: "content",
      packId: contentBriefPack.id,
      packVersion: contentBriefPack.version,
      kind: "workflow",
      availability: textWanted ? "operational" : "unsupported",
      justification: "fixed_steps",
      trigger: { kind: "manual_sample", status: "ready" },
      inputContract: contentBriefPack.inputContract,
      outputContract: contentBriefPack.outputContract,
      reviewer: reviewerOf(f, "content.reviewer"),
      permissions: ["flow.run"],
      limits: BASE_LIMITS,
      connections: [],
      unavailable: unsupported,
      usage: "none",
      params: { language: ctx.language },
      acceptanceFixtures: contentBriefPack.fixtures({}).map((x) => x.id),
      dependsOn: [],
    },
  ];
}

function recruitmentTasks(f: Facts): TaskPlan[] {
  // No verified coordination pack exists: planned, not operational. No autonomous screening or rejection, ever.
  return [
    {
      id: "recruitment-coordination",
      roleId: "recruitment-desk",
      department: "recruitment",
      packId: null,
      packVersion: null,
      kind: "workflow",
      availability: "planned",
      justification: "no_verified_pack",
      trigger: { kind: "unknown", status: "unknown" },
      inputContract: "none",
      outputContract: "none",
      reviewer: "owner",
      permissions: [],
      limits: { maxItemsPerRun: 1, maxRunsPerDay: 1 },
      connections: [],
      unavailable: ["autonomous_candidate_rejection", "recruitment_pack"],
      usage: "none",
      params: { need: str(f, "recruitment.need") ?? "unknown" },
      acceptanceFixtures: [],
      dependsOn: [],
    },
  ];
}

const ROLE_OF: Record<Department, string> = { customer: "customer-desk", finance: "finance-desk", content: "content-desk", recruitment: "recruitment-desk" };

export function composeBlueprint(state: InterviewState, ctx: PlanContext): CompanyBlueprint {
  const f = state.facts;
  const ready = readiness(state);
  const blockers: Blocker[] = [];
  const departments = ready.departments;
  const tasks: TaskPlan[] = [];
  for (const d of departments) {
    if (d === "customer") tasks.push(...customerTasks(f, ctx, blockers));
    if (d === "finance") tasks.push(...financeTasks(f, ctx, blockers));
    if (d === "content") tasks.push(...contentTasks(f, ctx, blockers));
    if (d === "recruitment") {
      tasks.push(...recruitmentTasks(f));
      blockers.push({ code: "recruitment_planned_only", department: "recruitment", params: {} });
    }
  }
  if (str(f, "first_outcome") === "other") blockers.push({ code: "outcome_not_supported", department: null, params: {} });
  for (const key of ready.missing) blockers.push({ code: f[key]?.status === "contradictory" ? "fact_contradictory" : "fact_missing", department: null, params: { fact: key } });

  // Tools named that Flowline doesn't integrate with are disclosed up front (before any checkout).
  const named = new Set([...list(f, "tools_mentioned_unsupported"), ...inferFromText([str(f, "tools_other") ?? "", str(f, "offering") ?? ""].join(" ")).unsupportedTools]);
  for (const tool of named) if (tool in UNSUPPORTED_TOOL_KEYWORDS) blockers.push({ code: "tool_not_supported", department: null, params: { tool } });
  const otherTools = str(f, "tools_other");
  if (otherTools && named.size === 0) blockers.push({ code: "tool_unverified", department: null, params: { tool: otherTools.slice(0, 80) } });

  const tools = list(f, "tools");
  const sampleData = str(f, "situation") === "start" || tools.length === 0 || tools.includes("none");
  const roles = departments.map((d) => ({ id: ROLE_OF[d], department: d, tasks: tasks.filter((t) => t.department === d).map((t) => t.id), knowledge: d === "customer" && tasks.some((t) => t.id === "customer-answers") ? ["approved-customer-answers"] : [] }));

  return {
    schemaVersion: CB_SCHEMA_VERSION,
    sessionId: ctx.sessionId,
    profileVersion: ctx.profileVersion,
    generator: "deterministic",
    situation: (str(f, "situation") as CompanyBlueprint["situation"]) ?? "improve",
    clientName: str(f, "client_name"),
    outcomes: departments.map((d, i) => ({ department: d, primary: i === 0 })),
    roles,
    tasks,
    assumptions: Object.entries(f)
      .filter(([, v]) => v.status !== "confirmed")
      .map(([k, v]) => ({ fact: k, status: v.status, value: v.value })),
    blockers: dedupe(blockers),
    sampleData,
    complete: ready.complete,
  };
}

function dedupe(b: Blocker[]) {
  const seen = new Set<string>();
  return b.filter((x) => {
    const k = `${x.code}|${x.department}|${JSON.stringify(x.params)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
