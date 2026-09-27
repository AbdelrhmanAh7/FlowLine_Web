import type { FlowEdge, FlowGraph, FlowNode } from "./types";

/**
 * The six templates from the design (slide 11), built from real nodes.
 * Each creates an independent flow. Connections start empty and target-specific
 * values are REPLACE_WITH_… placeholders, so validation lists exactly what to set up
 * before the flow can run. No usage counts are shown (none exist yet).
 */
export interface DesignTemplate {
  id: string;
  name: string;
  description: string;
  category: "Sales" | "Support" | "Finance" | "Marketing" | "Data ops" | "Engineering";
  goal: "sales" | "support" | "data" | "engineering";
  /** Apps (and runtime features) the flow needs. */
  requires: { provider: string; purpose: string }[];
  /** Human-readable setup checklist. */
  setup: string[];
  graph: FlowGraph;
}

const J = (v: unknown) => JSON.stringify(v, null, 2);
let e = 0;
const edge = (source: string, target: string, sourceHandle: string | null = null): FlowEdge => ({ id: `te${++e}-${source}-${target}`, source, target, sourceHandle });
function n(id: string, type: FlowNode["type"], label: string, x: number, y: number, config: Record<string, unknown>): FlowNode {
  return { id, type, position: { x, y }, data: { label, config: config as never } };
}
const act = (id: string, label: string, x: number, y: number, actionId: string, inputMapping: string, extra: Record<string, unknown> = {}) =>
  n(id, "integration.action", label, x, y, { actionId, connectionId: "", inputMapping, requireApproval: false, retry: { maxAttempts: 3 }, ...extra });

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: "lead-enrichment",
    name: "Lead Enrichment Pipeline",
    description: "Score and enrich inbound form leads with AI, add hot ones to a sheet and alert sales in Slack.",
    category: "Sales",
    goal: "sales",
    requires: [
      { provider: "ai", purpose: "Enrich and score the lead" },
      { provider: "google_sheets", purpose: "Append hot leads" },
      { provider: "slack", purpose: "Notify the sales channel" },
    ],
    setup: ["Choose Google Sheets and Slack connections", "Set your spreadsheet ID and sales channel ID", "Publish, then point your form's webhook at the flow's URL"],
    graph: {
      nodes: [
        n("hook", "trigger.webhook", "Form submitted", 0, 160, {
          signatureScheme: "flowline",
          samplePayload: J({ body: { lead: { name: "Ada Lovelace", email: "ada@analytical.io", company: "Analytical Engines Ltd", employees: 250, industry: "Fintech", role: "VP Operations" } } }),
        }),
        n("enrich", "ai.extract", "Enrich lead", 260, 160, {
          instructions: "From the lead form, extract company, domain (from the email), industry, headcount and title. Use only the provided text; leave unknowns as \"unknown\" or 0.",
          source: '"Company: " & body.lead.company & "\\nDomain: " & $substringAfter(body.lead.email, "@") & "\\nIndustry: " & body.lead.industry & "\\nHeadcount: " & $string(body.lead.employees) & "\\nTitle: " & body.lead.role',
          schema: J({ type: "object", properties: { company: { type: "string" }, domain: { type: "string" }, industry: { type: "string" }, headcount: { type: "integer" }, title: { type: "string" } }, required: ["company", "domain", "industry", "headcount", "title"], additionalProperties: false }),
          maxTokens: 300,
          model: "",
        }),
        n("score", "ai.classify", "Score lead", 520, 160, {
          instructions: "Score the lead for a B2B automation product. hot = 100+ employees in software/fintech; warm = 20–99 employees or adjacent industry; cold = otherwise.",
          source: "$string($)",
          labels: "hot,warm,cold",
          model: "",
        }),
        n("isHot", "logic.condition", "Hot lead?", 780, 160, { expression: 'label = "hot"' }),
        act("sheet", "Sheets — Add row", 1040, 60, "google_sheets.append_row", '{\n  "spreadsheetId": "REPLACE_WITH_SPREADSHEET_ID",\n  "range": "Leads!A1",\n  "row": [$steps.hook.body.lead.name, $steps.hook.body.lead.email, $steps.enrich.company, $string($steps.enrich.headcount), $steps.score.label]\n}'),
        act("slack", "Slack — Notify", 1300, 60, "slack.post_message", '{\n  "channel": "REPLACE_WITH_CHANNEL_ID",\n  "text": "Hot lead: " & $steps.hook.body.lead.name & " (" & $steps.enrich.company & ", " & $string($steps.enrich.headcount) & " people)"\n}'),
        n("nurture", "output", "Nurture", 1040, 280, { key: "nurture", expression: '{ "name": $steps.hook.body.lead.name, "score": $steps.score.label }' }),
      ],
      edges: [edge("hook", "enrich"), edge("enrich", "score"), edge("score", "isHot"), edge("isHot", "sheet", "true"), edge("sheet", "slack"), edge("isHot", "nurture", "false")],
    },
  },
  {
    id: "support-triage",
    name: "Support Ticket Triage",
    description: "Every 15 minutes, pull open Zendesk tickets, have AI write a prioritized digest, and post it to Slack.",
    category: "Support",
    goal: "support",
    requires: [
      { provider: "zendesk", purpose: "Read open tickets" },
      { provider: "ai", purpose: "Write the triage digest" },
      { provider: "slack", purpose: "Post the digest" },
    ],
    setup: ["Choose Zendesk and Slack connections", "Set the Slack channel ID", "Publish to start the schedule"],
    graph: {
      nodes: [
        n("tick", "trigger.schedule", "Every 15 min", 0, 160, { cron: "*/15 * * * *", timezone: "UTC", missedPolicy: "skip" }),
        act("fetch", "Zendesk — Open tickets", 260, 160, "zendesk.list_tickets", '{ "query": "status<solved", "limit": 25 }'),
        n("any", "logic.condition", "Any tickets?", 520, 160, { expression: "$count(tickets) > 0" }),
        n("digest", "ai.generate", "Write digest", 780, 60, {
          instructions: "Write a short triage digest: list urgent/high tickets first with the likely owning team, then a one-line count of the rest.",
          source: '$join(tickets.("#" & $string(id) & " [" & (priority ? priority : "none") & "] " & subject), "\\n")',
          maxTokens: 400,
          model: "",
        }),
        act("post", "Slack — Post digest", 1040, 60, "slack.post_message", '{\n  "channel": "REPLACE_WITH_CHANNEL_ID",\n  "text": "Ticket triage (" & $string($count($steps.fetch.tickets)) & " open)\\n" & text\n}'),
        n("quiet", "output", "Nothing open", 780, 280, { key: "status", expression: '"no open tickets"' }),
      ],
      edges: [edge("tick", "fetch"), edge("fetch", "any"), edge("any", "digest", "true"), edge("digest", "post"), edge("any", "quiet", "false")],
    },
  },
  {
    id: "invoice-extractor",
    name: "Invoice PDF Extractor",
    description: "Hourly: find the newest invoice email, extract vendor, totals and due date from the PDF, log it to your ledger sheet, and reply (after approval).",
    category: "Finance",
    goal: "data",
    requires: [
      { provider: "gmail", purpose: "Find invoices, read the attachment, send the reply" },
      { provider: "ai", purpose: "Extract invoice fields" },
      { provider: "google_sheets", purpose: "Append to the ledger" },
    ],
    setup: ["Choose Gmail and Google Sheets connections", "Set the ledger spreadsheet ID", "Replies need approval each time"],
    graph: {
      nodes: [
        n("tick", "trigger.schedule", "Hourly", 0, 160, { cron: "0 * * * *", timezone: "UTC", missedPolicy: "run_once" }),
        act("search", "Gmail — Find invoices", 240, 160, "gmail.search_messages", '{ "q": "has:attachment filename:pdf newer_than:1d", "maxResults": 5 }'),
        n("has", "logic.condition", "Found one?", 480, 160, { expression: "$count(messages) > 0" }),
        act("msg", "Gmail — Read message", 720, 60, "gmail.get_message", '{ "messageId": messages[0].id }'),
        act("att", "Gmail — Download PDF", 960, 60, "gmail.get_attachment", '{ "messageId": id, "attachmentId": attachments[mimeType = "application/pdf"][0].attachmentId }'),
        n("pdf", "data.file", "Read PDF", 1200, 60, { from: "input", fileId: "", source: "data", as: "pdf_text" }),
        n("extract", "ai.extract", "Extract fields", 1440, 60, {
          instructions: "Extract the invoice number, vendor, total amount, currency and due date (YYYY-MM-DD) from the invoice text.",
          source: "text",
          schema: J({ type: "object", properties: { invoice_number: { type: "string" }, vendor: { type: "string" }, total: { type: "number" }, currency: { type: "string" }, due_date: { type: "string" } }, required: ["invoice_number", "vendor", "total", "due_date"], additionalProperties: false }),
          maxTokens: 300,
          model: "",
        }),
        act("ledger", "Sheets — Ledger row", 1680, 60, "google_sheets.append_row", '{\n  "spreadsheetId": "REPLACE_WITH_LEDGER_SPREADSHEET_ID",\n  "range": "Ledger!A1",\n  "row": [invoice_number, vendor, $string(total), currency ? currency : "", due_date, $steps.msg.from]\n}'),
        act("reply", "Gmail — Reply", 1920, 60, "gmail.send", '{\n  "to": $steps.msg.from,\n  "subject": "Re: " & $steps.msg.subject,\n  "body": "Thanks — we received invoice " & $steps.extract.invoice_number & " for " & $string($steps.extract.total) & " (due " & $steps.extract.due_date & ")."\n}', { requireApproval: true }),
        n("none", "output", "No invoices", 720, 280, { key: "status", expression: '"no new invoices"' }),
      ],
      edges: [edge("tick", "search"), edge("search", "has"), edge("has", "msg", "true"), edge("msg", "att"), edge("att", "pdf"), edge("pdf", "extract"), edge("extract", "ledger"), edge("ledger", "reply"), edge("has", "none", "false")],
    },
  },
  {
    id: "price-watch",
    name: "Competitor Price Watch",
    description: "Hourly: fetch a competitor pricing page you're allowed to monitor, extract the price, compare with last time, and alert Slack on a material change.",
    category: "Marketing",
    goal: "data",
    requires: [
      { provider: "http", purpose: "Fetch the public pricing page (egress-protected)" },
      { provider: "ai", purpose: "Extract the price" },
      { provider: "slack", purpose: "Alert on changes" },
    ],
    setup: ["Set the pricing page URL (only pages you are permitted to monitor)", "Choose a Slack connection and channel", "Publish to start the schedule"],
    graph: {
      nodes: [
        n("tick", "trigger.schedule", "Hourly", 0, 160, { cron: "0 * * * *", timezone: "UTC", missedPolicy: "skip" }),
        n("fetch", "http.request", "Fetch pricing page", 240, 160, { method: "GET", url: "'REPLACE_WITH_PRICING_URL'", headers: "", body: "", timeoutMs: 15000, sideEffect: "none", retry: { maxAttempts: 3 } }),
        n("price", "ai.extract", "Extract price", 480, 160, {
          instructions: "Find the monthly price of the main paid plan on this pricing page.",
          source: '$substring($string(body), 0, 20000)',
          schema: J({ type: "object", properties: { plan: { type: "string" }, price: { type: "number" }, currency: { type: "string" } }, required: ["plan", "price"], additionalProperties: false }),
          maxTokens: 200,
          model: "",
        }),
        n("last", "data.store", "Last seen price", 720, 160, { op: "get", namespace: "price-watch", key: "'competitor'", value: "$" }),
        n("changed", "logic.condition", "Material change?", 960, 160, { expression: "found = false or $abs(input.price - value.price) > value.price * 0.05" }),
        n("save", "data.store", "Save new price", 1200, 60, { op: "set", namespace: "price-watch", key: "'competitor'", value: "input" }),
        act("alert", "Slack — Alert", 1440, 60, "slack.post_message", '{\n  "channel": "REPLACE_WITH_CHANNEL_ID",\n  "text": "Competitor price changed: " & $steps.price.plan & " now " & $string($steps.price.price) & ($steps.last.found ? " (was " & $string($steps.last.value.price) & ")" : " (first observation)")\n}'),
        n("same", "output", "No change", 1200, 280, { key: "status", expression: '"unchanged"' }),
      ],
      edges: [edge("tick", "fetch"), edge("fetch", "price"), edge("price", "last"), edge("last", "changed"), edge("changed", "save", "true"), edge("save", "alert"), edge("changed", "same", "false")],
    },
  },
  {
    id: "kpi-digest",
    name: "Weekly KPI Digest",
    description: "Mondays 09:00: query your warehouse, have AI write the narrative, and email it to leadership (after approval).",
    category: "Data ops",
    goal: "data",
    requires: [
      { provider: "postgres", purpose: "Query KPI rows (or swap in Snowflake)" },
      { provider: "ai", purpose: "Write the narrative" },
      { provider: "gmail", purpose: "Email leadership" },
    ],
    setup: ["Choose a Postgres (or Snowflake) connection and adjust the SQL", "Set the leadership email", "Pick your time zone on the schedule", "Each send needs approval"],
    graph: {
      nodes: [
        n("tick", "trigger.schedule", "Mondays 09:00", 0, 160, { cron: "0 9 * * 1", timezone: "UTC", missedPolicy: "run_once" }),
        act("query", "Query KPIs", 260, 160, "postgres.query", '{ "sql": "select metric, value from kpi_weekly order by metric", "params": [] }'),
        n("story", "ai.generate", "Write narrative", 520, 160, { instructions: "Write a 3-sentence KPI summary for leadership. Mention the biggest change first. No invented numbers.", source: '$join(rows.(metric & ": " & $string(value)), "\\n")', maxTokens: 300, model: "" }),
        act("email", "Email leadership", 780, 160, "gmail.send", '{\n  "to": "REPLACE_WITH_LEADERSHIP_EMAIL",\n  "subject": "Weekly KPI digest",\n  "body": text\n}', { requireApproval: true }),
      ],
      edges: [edge("tick", "query"), edge("query", "story"), edge("story", "email")],
    },
  },
  {
    id: "pr-review-router",
    name: "PR Review Router",
    description: "On new GitHub pull requests: summarize the diff with AI, flag risky changes, and file a follow-up issue in Linear.",
    category: "Engineering",
    goal: "engineering",
    requires: [
      { provider: "github", purpose: "Read the pull request and its files" },
      { provider: "ai", purpose: "Summarize and assess risk" },
      { provider: "linear", purpose: "File follow-ups for risky PRs" },
    ],
    setup: ["Choose GitHub and Linear connections", "Set the Linear team ID", "Publish, then add the webhook URL + secret in GitHub (pull_request events)"],
    graph: {
      nodes: [
        n("hook", "trigger.webhook", "PR opened (GitHub)", 0, 160, { signatureScheme: "github", samplePayload: J({ body: { action: "opened", number: 7, pull_request: { number: 7 }, repository: { name: "app", owner: { login: "acme" } } } }) }),
        n("opened", "logic.condition", "Opened?", 220, 160, { expression: 'body.action = "opened"' }),
        act("pr", "GitHub — Get PR", 440, 60, "github.get_pull_request", '{ "owner": body.repository.owner.login, "repo": body.repository.name, "number": body.pull_request.number }'),
        act("files", "GitHub — Changed files", 660, 60, "github.list_pr_files", '{ "owner": $steps.hook.body.repository.owner.login, "repo": $steps.hook.body.repository.name, "number": number }'),
        n("review", "ai.extract", "Assess risk", 880, 60, {
          instructions: "Summarize the pull request in two sentences and decide if it is risky (schema/data migrations, auth, secrets, destructive SQL). Give short reasons.",
          source: '"Title: " & $steps.pr.title & "\\nFiles:\\n" & $join(files.(filename & " +" & $string(additions) & " -" & $string(deletions) & "\\n" & (patch ? $substring(patch, 0, 2000) : "")), "\\n")',
          schema: J({ type: "object", properties: { summary: { type: "string" }, risky: { type: "boolean" }, reasons: { type: "string" } }, required: ["summary", "risky", "reasons"], additionalProperties: false }),
          maxTokens: 300,
          model: "",
        }),
        n("isRisky", "logic.condition", "Risky?", 1100, 60, { expression: "risky = true" }),
        act("issue", "Linear — Follow-up", 1320, -20, "linear.create_issue", '{\n  "teamId": "REPLACE_WITH_LINEAR_TEAM_ID",\n  "title": "Review risky PR #" & $string($steps.pr.number) & ": " & $steps.pr.title,\n  "description": $steps.review.summary & "\\n\\nWhy: " & $steps.review.reasons\n}'),
        n("fine", "output", "Low risk", 1320, 140, { key: "review", expression: "$steps.review" }),
        n("ignored", "output", "Not an opened PR", 440, 280, { key: "ignored", expression: "true" }),
      ],
      edges: [edge("hook", "opened"), edge("opened", "pr", "true"), edge("pr", "files"), edge("files", "review"), edge("review", "isRisky"), edge("isRisky", "issue", "true"), edge("isRisky", "fine", "false"), edge("opened", "ignored", "false")],
    },
  },
];
