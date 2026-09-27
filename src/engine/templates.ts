import type { FlowGraph } from "./types";

export interface LocalTemplate {
  id: string;
  name: string;
  description: string;
  category: "Sales" | "Support" | "Data ops" | "Finance" | "Marketing" | "Engineering";
  goal: "sales" | "support" | "data" | "engineering";
  graph: FlowGraph;
}

const X = [0, 300, 600, 900];

/** Templates that run entirely on Phase 1 local nodes. */
export const LOCAL_TEMPLATES: LocalTemplate[] = [
  {
    id: "lead-qualifier",
    name: "Lead Qualifier",
    description: "Normalise an inbound lead, check company size, and label it hot or nurture.",
    category: "Sales",
    goal: "sales",
    graph: {
      nodes: [
        {
          id: "trigger",
          type: "trigger.manual",
          position: { x: X[0], y: 120 },
          data: {
            label: "Inbound lead",
            config: { samplePayload: JSON.stringify({ lead: { name: "Ada Lovelace", email: "ada@analytical.io", employees: 120 } }, null, 2) },
          },
        },
        {
          id: "normalise",
          type: "transform.json",
          position: { x: X[1], y: 120 },
          data: {
            label: "Normalise lead",
            config: { expression: '{\n  "name": lead.name,\n  "domain": $substringAfter(lead.email, "@"),\n  "size": lead.employees\n}' },
          },
        },
        { id: "is-hot", type: "logic.condition", position: { x: X[2], y: 120 }, data: { label: "50+ employees?", config: { expression: "size >= 50" } } },
        { id: "hot", type: "output", position: { x: X[3], y: 36 }, data: { label: "Hot lead", config: { key: "hot_lead", expression: '{ "name": name, "domain": domain, "tier": "hot" }' } } },
        { id: "nurture", type: "output", position: { x: X[3], y: 216 }, data: { label: "Nurture", config: { key: "nurture", expression: '{ "name": name, "tier": "nurture" }' } } },
      ],
      edges: [
        { id: "e1", source: "trigger", target: "normalise", sourceHandle: "out" },
        { id: "e2", source: "normalise", target: "is-hot", sourceHandle: "out" },
        { id: "e3", source: "is-hot", target: "hot", sourceHandle: "true" },
        { id: "e4", source: "is-hot", target: "nurture", sourceHandle: "false" },
      ],
    },
  },
  {
    id: "ticket-priority",
    name: "Ticket Priority Router",
    description: "Score a support ticket by keywords and route urgent ones to an escalation output.",
    category: "Support",
    goal: "support",
    graph: {
      nodes: [
        {
          id: "trigger",
          type: "trigger.manual",
          position: { x: X[0], y: 120 },
          data: { label: "New ticket", config: { samplePayload: JSON.stringify({ ticket: { id: 4812, subject: "Checkout is down for all users", plan: "enterprise" } }, null, 2) } },
        },
        {
          id: "score",
          type: "transform.json",
          position: { x: X[1], y: 120 },
          data: {
            label: "Score urgency",
            config: {
              expression:
                '(\n  $s := $lowercase(ticket.subject);\n  {\n    "id": ticket.id,\n    "urgent": $contains($s, "down") or $contains($s, "outage") or ticket.plan = "enterprise"\n  }\n)',
            },
          },
        },
        { id: "urgent", type: "logic.condition", position: { x: X[2], y: 120 }, data: { label: "Urgent?", config: { expression: "urgent" } } },
        { id: "escalate", type: "output", position: { x: X[3], y: 36 }, data: { label: "Escalate", config: { key: "escalate", expression: "" } } },
        { id: "queue", type: "output", position: { x: X[3], y: 216 }, data: { label: "Standard queue", config: { key: "queue", expression: "" } } },
      ],
      edges: [
        { id: "e1", source: "trigger", target: "score", sourceHandle: "out" },
        { id: "e2", source: "score", target: "urgent", sourceHandle: "out" },
        { id: "e3", source: "urgent", target: "escalate", sourceHandle: "true" },
        { id: "e4", source: "urgent", target: "queue", sourceHandle: "false" },
      ],
    },
  },
  {
    id: "order-totals",
    name: "Order Totals Digest",
    description: "Sum line items, apply a discount rule, and flag orders above a threshold.",
    category: "Data ops",
    goal: "data",
    graph: {
      nodes: [
        {
          id: "trigger",
          type: "trigger.manual",
          position: { x: X[0], y: 120 },
          data: {
            label: "Order batch",
            config: { samplePayload: JSON.stringify({ items: [{ sku: "A-1", qty: 3, price: 19.5 }, { sku: "B-7", qty: 1, price: 240 }] }, null, 2) },
          },
        },
        { id: "sum", type: "transform.json", position: { x: X[1], y: 120 }, data: { label: "Sum items", config: { expression: '{ "total": $sum(items.(qty * price)), "lines": $count(items) }' } } },
        { id: "big", type: "logic.condition", position: { x: X[2], y: 120 }, data: { label: "Over $250?", config: { expression: "total > 250" } } },
        { id: "flag", type: "output", position: { x: X[3], y: 36 }, data: { label: "Flag for review", config: { key: "review", expression: "" } } },
        { id: "ok", type: "output", position: { x: X[3], y: 216 }, data: { label: "Auto-approve", config: { key: "approved", expression: "" } } },
      ],
      edges: [
        { id: "e1", source: "trigger", target: "sum", sourceHandle: "out" },
        { id: "e2", source: "sum", target: "big", sourceHandle: "out" },
        { id: "e3", source: "big", target: "flag", sourceHandle: "true" },
        { id: "e4", source: "big", target: "ok", sourceHandle: "false" },
      ],
    },
  },
];

export const BLANK_GRAPH: FlowGraph = { nodes: [], edges: [] };

/** Design-reference templates that need Phase 2 integrations. Shown, but not usable yet. */
export const INTEGRATION_TEMPLATES = [
  { id: "lead-enrichment", name: "Lead Enrichment Pipeline", description: "Score and enrich inbound form leads with an LLM, route hot ones to sales.", category: "Sales", chain: ["⚡ Hook", "✦ Enrich", "✦ Score", "▦ Sheets"], needs: "Webhook trigger, LLM node, Google Sheets" },
  { id: "support-triage", name: "Support Ticket Triage", description: "Classify Zendesk tickets by priority and team, post a digest every 15 min.", category: "Support", chain: ["🕐 15m", "⇄ Fetch", "✦ Classify", "# Slack"], needs: "Schedule trigger, Zendesk, LLM node, Slack" },
  { id: "invoice-extractor", name: "Invoice PDF Extractor", description: "Pull totals, vendors, and due dates from attachments into your AP ledger.", category: "Finance", chain: ["✉ Gmail", "✦ Extract", "▦ Ledger", "✉ Reply"], needs: "Gmail, LLM node" },
  { id: "price-watch", name: "Competitor Price Watch", description: "Monitor pricing pages hourly, Slack summary when anything material changes.", category: "Marketing", chain: ["🕐 1h", "⇄ Scrape", "✦ Diff", "# Alert"], needs: "Schedule trigger, HTTP fetch, LLM node, Slack" },
  { id: "kpi-digest", name: "Weekly KPI Digest", description: "Query the warehouse Monday, LLM writes the narrative, email it to leadership.", category: "Data ops", chain: ["🕐 Mon", "▮ SQL", "✦ Summarize", "✉ Email"], needs: "Schedule trigger, SQL connector, LLM node, email" },
  { id: "pr-router", name: "PR Review Router", description: "Summarize new pull requests, flag risky diffs, file follow-ups in Linear.", category: "Engineering", chain: ["🐙 PR", "✦ Review", "⑂ Filter", "📊 Linear"], needs: "GitHub, LLM node, Linear" },
] as const;
