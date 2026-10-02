import { inferFromText, readiness, UNSUPPORTED_TOOL_KEYWORDS } from "./interview";
import { CB_SCHEMA_VERSION, type Blocker, type CompanyBlueprint, type Department, type Facts, type InterviewState, type TaskPlan } from "./model";
import { contentBriefPack } from "./packs/content-brief";
import { customerFollowUpPack } from "./packs/customer-follow-up";
import { invoiceOrganiserPack } from "./packs/invoice-organiser";
import { leadQualificationPack } from "./packs/lead-qualification";
import { operationsSummaryPack } from "./packs/operations-summary";
import type { TaskPack } from "./packs/types";
import { activeDepartments } from "./questions";

/**
 * Deterministic blueprint composer — "outcome first, small verified team" (owner direction, 2026-09-30).
 *
 * - ONE primary outcome is prepared (the confirmed first outcome). Other areas the person mentions become "possible next
 *   improvements": listed, never installed or activated.
 * - The smallest useful automation: a tested workflow when the steps are fixed; ZERO agents by default. An agent is only
 *   a later improvement where interpretation adds value (and it needs an AI connection).
 * - A digital role exists only to group real tasks, and states what it does NOT do.
 * - Everything the plan can't do is a blocker or an unavailable capability, disclosed before any checkout.
 */

export interface PlanContext {
  sessionId: string;
  profileVersion: number;
  /** Workspace connections (provider + status) — used only to report connection status, never credentials. */
  connections: { id: string; provider: string; status: string }[];
  /** UI language of the owner (sample data + template copy language). */
  language: "ar" | "en";
  /** Workspace timezone (IANA), used for follow-up times. */
  timezone?: string;
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

function stepsOf(pack: TaskPack, params: TaskPlan["params"]) {
  // Repeated data steps ("facts", "facts-2", …) are one business step in the plan.
  return [...new Set(pack.compile(params, (id) => id).nodes.map((n) => n.id.replace(/^(facts)-\d+$/, "$1")))];
}

function packTask(pack: TaskPack, partial: Omit<TaskPlan, "packId" | "packVersion" | "department" | "inputContract" | "outputContract" | "acceptanceFixtures" | "dependsOn" | "steps" | "kind" | "justification">): TaskPlan {
  return {
    ...partial,
    packId: pack.id,
    packVersion: pack.version,
    department: pack.department,
    kind: "workflow",
    justification: "fixed_steps",
    inputContract: pack.inputContract,
    outputContract: pack.outputContract,
    acceptanceFixtures: pack.fixtures(partial.params).map((x) => x.id),
    dependsOn: [],
    steps: stepsOf(pack, partial.params),
  };
}

/** Services the person listed ("deep cleaning, office cleaning" / one per line) → pack service aliases. */
function servicesFrom(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[,،\n;]+/)
    // "office cleaning / تنظيف مكاتب": other names for the SAME service (aliases), stored as "a|b" for the pack.
    // Other names for the same service are separated by a SPACED slash or "|" ("office cleaning / تنظيف مكاتب");
    // a bare slash stays part of the name ("24/7 emergency plumbing", FB2-03). Each name must contain a letter.
    .map((s) => s.split(/\s+\/\s+|\|/).map((a) => a.trim().toLowerCase()).filter((a) => a.length > 1 && /\p{L}/u.test(a)).join("|").slice(0, 60))
    .filter((s) => s.length > 1)
    .slice(0, 12);
}

function customerTask(f: Facts, ctx: PlanContext, blockers: Blocker[]): TaskPlan {
  const channel = str(f, "customer.channel");
  const info = str(f, "customer.approved_info") ?? "";
  const trigger: TaskPlan["trigger"] =
    channel === "email" ? { kind: "email", status: "needs_connection" } : channel === "form" ? { kind: "form", status: "ready" } : channel === "chat" || channel === "phone" ? { kind: channel === "chat" ? "chat" : "unknown", status: "unsupported" } : { kind: "unknown", status: "unknown" };
  const unavailable: string[] = [];
  if (trigger.status === "unsupported") {
    unavailable.push(channel === "chat" ? "chat_channel" : "phone_channel");
    blockers.push({ code: "channel_not_supported", department: "customer", params: { channel: channel ?? "" } });
  }
  if (!info.trim()) blockers.push({ code: "approved_info_missing", department: "customer", params: {} });
  const detailsFact = f["customer.details"];
  const details = detailsFact && detailsFact.status === "confirmed" && Array.isArray(detailsFact.value) ? detailsFact.value : ["service", "date", "phone"];
  if (!detailsFact || detailsFact.status !== "confirmed") blockers.push({ code: "details_assumed", department: "customer", params: {} });
  return packTask(customerFollowUpPack, {
    id: "customer-follow-up",
    roleId: "customer-follow-up-assistant",
    availability: "operational",
    trigger,
    reviewer: reviewerOf(f, "customer.reviewer"),
    permissions: ["flow.run", "approval.decide"],
    limits: BASE_LIMITS,
    connections: channel === "email" ? [connectionRef(ctx, "gmail")] : [],
    unavailable,
    usage: "none",
    // recordScope: follow-up records belong to THIS interview, so two interviews in one workspace never overwrite each other.
    params: { approvedInfo: info.slice(0, 1200), services: servicesFrom(str(f, "customer.services")), requiredDetails: details, followUpHours: 24, timezone: ctx.timezone ?? "UTC", language: ctx.language, recordScope: ctx.sessionId },
    work: { automated: ["extract_request_facts", "detect_missing_details", "record_follow_up"], assisted: ["draft_reply_from_approved_info"], human: ["approve_and_send_reply", "complaints", "refund_and_cancellation_decisions", "prices_not_in_approved_info"] },
  });
}

function financeTask(f: Facts, ctx: PlanContext, blockers: Blocker[]): TaskPlan {
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
  return packTask(invoiceOrganiserPack, {
    id: "invoice-organiser",
    roleId: "finance-documents-assistant",
    availability: "operational",
    trigger,
    reviewer: reviewerOf(f, "finance.reviewer"),
    permissions: ["flow.run", "approval.decide"],
    limits: BASE_LIMITS,
    connections,
    unavailable: [...unavailable, "tax_filing", "payments"],
    usage: "none",
    params: { currencies, language: ctx.language },
    work: { automated: ["validate_document_fields", "recompute_totals", "per_currency_totals"], assisted: ["draft_ledger_rows", "flag_discrepancies"], human: ["approve_ledger_entries", "payments", "tax_filing"] },
  });
}

function operationsTask(f: Facts, ctx: PlanContext, blockers: Blocker[]): TaskPlan {
  const source = str(f, "operations.source");
  const unavailable: string[] = [];
  const connections: TaskPlan["connections"] = [];
  let trigger: TaskPlan["trigger"] = { kind: "manual_sample", status: "ready" };
  if (source === "spreadsheet") connections.push(connectionRef(ctx, "google_sheets"));
  else if (source === "project_tool") {
    connections.push(connectionRef(ctx, "linear"));
    blockers.push({ code: "project_tool_mapping_needed", department: "operations", params: {} });
  } else if (source === "email_updates") {
    unavailable.push("email_status_parsing");
    blockers.push({ code: "email_updates_not_supported", department: "operations", params: {} });
  } else if (source === "none") blockers.push({ code: "no_status_data_yet", department: "operations", params: {} });
  else trigger = { kind: "unknown", status: "unknown" };
  return packTask(operationsSummaryPack, {
    id: "operations-summary",
    roleId: "operations-reporting-assistant",
    availability: "operational",
    trigger,
    reviewer: reviewerOf(f, "operations.reviewer"),
    permissions: ["flow.run", "approval.decide"],
    limits: BASE_LIMITS,
    connections,
    unavailable,
    usage: "none",
    params: { language: ctx.language },
    work: { automated: ["deterministic_metrics", "flag_overdue"], assisted: ["summarise_changes"], human: ["approve_and_share_report", "performance_judgements"] },
  });
}

function salesTask(f: Facts, ctx: PlanContext, blockers: Blocker[]): TaskPlan {
  const source = str(f, "sales.source");
  const connections: TaskPlan["connections"] = [];
  let trigger: TaskPlan["trigger"] = { kind: "form", status: "ready" };
  if (source === "email") {
    trigger = { kind: "email", status: "needs_connection" };
    connections.push(connectionRef(ctx, "gmail"));
  } else if (source === "crm") connections.push(connectionRef(ctx, "hubspot"));
  else if (!source) trigger = { kind: "unknown", status: "unknown" };
  const min = Number(str(f, "sales.min_size") ?? "10");
  if (!confirmed(f, "sales.min_size")) blockers.push({ code: "lead_criteria_assumed", department: "sales", params: {} });
  return packTask(leadQualificationPack, {
    id: "lead-qualification",
    roleId: "lead-qualification-assistant",
    availability: "operational",
    trigger,
    reviewer: reviewerOf(f, "sales.reviewer"),
    permissions: ["flow.run", "approval.decide"],
    limits: BASE_LIMITS,
    connections,
    unavailable: ["crm_write_without_approval"],
    usage: "none",
    params: { minEmployees: Number.isFinite(min) && min > 0 ? min : 10, targetCountries: [], excludedDomains: [], language: ctx.language },
    work: { automated: ["normalise_lead", "score_against_criteria"], assisted: ["explain_score", "route_for_review"], human: ["contact_lead", "decline_lead"] },
  });
}

function contentTask(f: Facts, ctx: PlanContext, blockers: Blocker[]): TaskPlan {
  const outputs = list(f, "content.output");
  const unsupported = outputs.filter((o) => o === "images" || o === "design_files" || o === "video");
  for (const o of unsupported) blockers.push({ code: "content_output_not_supported", department: "content", params: { output: o } });
  const textWanted = outputs.length === 0 || outputs.some((o) => o === "copy_text" || o === "social_posts");
  return packTask(contentBriefPack, {
    id: "content-brief",
    roleId: "content-preparation-assistant",
    availability: textWanted ? "operational" : "unsupported",
    trigger: { kind: "manual_sample", status: "ready" },
    reviewer: reviewerOf(f, "content.reviewer"),
    permissions: ["flow.run"],
    limits: BASE_LIMITS,
    connections: [],
    unavailable: unsupported,
    usage: "none",
    params: { language: ctx.language },
    work: { automated: ["structure_brief"], assisted: ["template_copy_options"], human: ["approve_and_publish", "brand_decisions"] },
  });
}

function recruitmentTask(f: Facts): TaskPlan {
  // No verified coordination pack exists: planned, not operational. No autonomous screening or rejection, ever.
  return {
    id: "recruitment-coordination",
    roleId: "recruitment-coordination-assistant",
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
    steps: [],
    work: { automated: [], assisted: [], human: ["hiring_decisions", "candidate_contact"] },
  };
}

/** What each role never does (shown on the plan; i18n `companyBuilder.doesNot.<id>`). */
const DOES_NOT: Record<string, string[]> = {
  "customer-follow-up-assistant": ["send_without_approval", "quote_unapproved_prices", "legal_commitments", "issue_refunds", "data_outside_sources"],
  "finance-documents-assistant": ["move_money", "file_taxes", "post_without_review", "mix_currencies"],
  "operations-reporting-assistant": ["judge_performance", "share_without_review", "data_outside_sources"],
  "lead-qualification-assistant": ["contact_without_approval", "reject_automatically", "data_outside_sources"],
  "content-preparation-assistant": ["publish_without_review", "produce_images_or_video"],
  "recruitment-coordination-assistant": ["reject_candidates", "hiring_decisions"],
};

/** Later improvements per primary outcome (never installed now). */
const LATER: Partial<Record<Department, CompanyBlueprint["nextImprovements"]>> = {
  customer: [
    { id: "customer-answers-assistant", department: "customer", kind: "agent" },
    { id: "gmail-send-after-approval", department: "customer", kind: "pack" },
  ],
  finance: [{ id: "ledger-to-sheets-after-approval", department: "finance", kind: "pack" }],
  operations: [{ id: "scheduled-weekly-report", department: "operations", kind: "pack" }],
  sales: [{ id: "crm-update-after-approval", department: "sales", kind: "pack" }],
};

const EXECUTIONS: Record<string, [number, number]> = { under_20: [4, 90], "20_100": [80, 450], over_100: [400, 2000] };

export function composeBlueprint(state: InterviewState, ctx: PlanContext): CompanyBlueprint {
  const f = state.facts;
  const ready = readiness(state);
  const blockers: Blocker[] = [];
  // Confirmed outcomes only; an inferred outcome stays an assumption until answered.
  const departments = activeDepartments(Object.fromEntries(Object.entries(f).filter(([, v]) => v.status === "confirmed")));
  const primary = departments[0] ?? null;
  const tasks: TaskPlan[] = [];
  if (primary === "customer") tasks.push(customerTask(f, ctx, blockers));
  if (primary === "finance") tasks.push(financeTask(f, ctx, blockers));
  if (primary === "operations") tasks.push(operationsTask(f, ctx, blockers));
  if (primary === "sales") tasks.push(salesTask(f, ctx, blockers));
  if (primary === "content") tasks.push(contentTask(f, ctx, blockers));
  if (primary === "recruitment") {
    tasks.push(recruitmentTask(f));
    blockers.push({ code: "recruitment_planned_only", department: "recruitment", params: {} });
  }
  const outcome = str(f, "first_outcome");
  if (outcome === "other") blockers.push({ code: "outcome_not_supported", department: null, params: {} });
  if (!primary && outcome !== "other") blockers.push({ code: "choose_first_outcome", department: null, params: {} });
  for (const key of ready.missing) if (key !== "first_outcome") blockers.push({ code: f[key]?.status === "contradictory" ? "fact_contradictory" : "fact_missing", department: null, params: { fact: key } });

  // Tools named that Flowline doesn't integrate with are disclosed up front (before any checkout).
  const named = new Set([...list(f, "tools_mentioned_unsupported"), ...inferFromText([str(f, "tools_other") ?? "", str(f, "offering") ?? ""].join(" ")).unsupportedTools]);
  for (const tool of named) if (tool in UNSUPPORTED_TOOL_KEYWORDS) blockers.push({ code: "tool_not_supported", department: null, params: { tool } });
  const otherTools = str(f, "tools_other");
  if (otherTools && named.size === 0) blockers.push({ code: "tool_unverified", department: null, params: { tool: otherTools.slice(0, 80) } });

  const sampleData = true; // every trial uses labelled sample data until an account is connected and approved
  const roles = tasks.length ? [{ id: tasks[0]!.roleId, department: primary!, tasks: tasks.map((t) => t.id), knowledge: [], doesNot: DOES_NOT[tasks[0]!.roleId] ?? [] }] : [];
  const nextImprovements = [
    ...(primary ? (LATER[primary] ?? []) : []),
    ...departments.slice(1).map((d) => ({ id: `${d}-outcome`, department: d, kind: (d === "recruitment" ? "planned" : "pack") as "planned" | "pack" })),
  ].slice(0, 10);
  const external = [...new Set(tasks.flatMap((t) => t.connections.map((c) => c.provider)))];
  const volume = str(f, "customer.volume");

  return {
    schemaVersion: CB_SCHEMA_VERSION,
    sessionId: ctx.sessionId,
    profileVersion: ctx.profileVersion,
    generator: "deterministic",
    situation: (str(f, "situation") as CompanyBlueprint["situation"]) ?? "improve",
    clientName: str(f, "situation") === "client" ? str(f, "client_name") : null,
    outcomes: primary ? [{ department: primary, primary: true }] : [],
    roles,
    tasks,
    assumptions: Object.entries(f)
      .filter(([, v]) => v.status !== "confirmed")
      .map(([k, v]) => ({ fact: k, status: v.status, value: v.value })),
    blockers: dedupe(blockers),
    sampleData,
    complete: ready.complete && Boolean(primary),
    goal: { department: primary },
    nextImprovements,
    cost: {
      ai: "none",
      externalServices: external,
      executionsPerMonth: primary === "customer" && volume && EXECUTIONS[volume] ? EXECUTIONS[volume]! : null,
      unknown: [...(primary === "customer" && !volume ? ["execution_volume"] : []), ...(external.length ? ["external_service_plan"] : [])],
    },
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
