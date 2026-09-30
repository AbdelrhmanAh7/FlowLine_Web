import { LOCAL_SCENARIOS } from "./local-scenarios";
import type { FlowGraph } from "./types";

export type TemplateGoal = "sales" | "support" | "data" | "engineering";

export interface LocalTemplate {
  id: string;
  name: string;
  description: string;
  /** What the trigger's editable sample contains (shown in the gallery). */
  sample: string;
  /** What a run saves as its result (shown in the gallery). */
  result: string;
  category: "Sales" | "Support" | "Data ops" | "Finance" | "Marketing" | "Engineering" | "Operations" | "Personal";
  goal: TemplateGoal;
  graph: FlowGraph;
}

const X = [0, 300, 600, 900];

/** Templates that run entirely on local nodes. The first three ids are relied on by tests, scripts and saved flows. */
export const LOCAL_TEMPLATES: LocalTemplate[] = [
  {
    id: "lead-qualifier",
    name: "Lead Qualifier",
    description: "Normalise an inbound lead, check company size, and label it hot or nurture.",
    sample: "One inbound lead with a name, an email and the company size.",
    result: "The lead labelled hot (50 or more employees) or nurture.",
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
    sample: "One support ticket with a subject and the customer's plan.",
    result: "The ticket saved as escalate or standard queue. Nobody is notified.",
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
    description: "Add up an order's line items and flag orders over $250 for review. No discount is applied.",
    sample: "One order with two lines, each with a quantity and a price.",
    result: "The order total and line count, saved as needing review or not.",
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
        { id: "ok", type: "output", position: { x: X[3], y: 216 }, data: { label: "No review needed", config: { key: "approved", expression: "" } } },
      ],
      edges: [
        { id: "e1", source: "trigger", target: "sum", sourceHandle: "out" },
        { id: "e2", source: "sum", target: "big", sourceHandle: "out" },
        { id: "e3", source: "big", target: "flag", sourceHandle: "true" },
        { id: "e4", source: "big", target: "ok", sourceHandle: "false" },
      ],
    },
  },
  ...LOCAL_SCENARIOS,
];

/** The few examples the landing page shows; the in-app gallery lists every template. */
export const LANDING_TEMPLATE_IDS = ["low-stock-list", "quote-calculator", "expense-category-summary", "weekly-task-plan", "support-backlog-summary", "event-attendee-summary"] as const;

export const LANDING_TEMPLATES: LocalTemplate[] = LANDING_TEMPLATE_IDS.map((id) => LOCAL_TEMPLATES.find((t) => t.id === id)!);

/** Onboarding offers a short list: templates for the chosen goal first, topped up with others, never more than `limit`. */
export function onboardingTemplates(goal: TemplateGoal | null, limit = 3): LocalTemplate[] {
  const suggested = goal ? LOCAL_TEMPLATES.filter((t) => t.goal === goal) : [];
  return [...suggested, ...LOCAL_TEMPLATES.filter((t) => !suggested.includes(t))].slice(0, limit);
}

export const BLANK_GRAPH: FlowGraph = { nodes: [], edges: [] };
