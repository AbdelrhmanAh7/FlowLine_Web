import type { FlowNode, NodeConfigMap, NodeType } from "./types";

export type NodeCategory = "trigger" | "data" | "logic" | "ai" | "integration" | "output" | "advanced";

export interface NodeDefinition<T extends NodeType = NodeType> {
  type: T;
  /** Bumped when config/behaviour changes incompatibly. Stored graphs keep working through migrations. */
  version: number;
  title: string;
  /** Uppercase mono subtitle on the canvas card. */
  subtitle: string;
  description: string;
  icon: string;
  category: NodeCategory;
  /** Number of input edges accepted ("many" = join). */
  inputs: 0 | 1 | "many";
  /** Output handle ids. */
  outputs: string[];
  /** External side effect class (integration actions declare their own per action). */
  sideEffect: "none" | "idempotent" | "non_idempotent" | "per_action";
  defaultConfig: () => NodeConfigMap[T];
}

const J = (v: unknown) => JSON.stringify(v, null, 2);

export const NODE_DEFINITIONS: { [K in NodeType]: NodeDefinition<K> } = {
  "trigger.manual": {
    type: "trigger.manual",
    version: 1,
    title: "Manual trigger",
    subtitle: "TRIGGER · MANUAL",
    description: "Starts the flow when you press Run. Sends the sample payload as input.",
    icon: "⚡",
    category: "trigger",
    inputs: 0,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ samplePayload: J({ lead: { name: "Ada Lovelace", email: "ada@example.com", employees: 120 } }) }),
  },
  "trigger.webhook": {
    type: "trigger.webhook",
    version: 1,
    title: "Webhook trigger",
    subtitle: "TRIGGER · WEBHOOK",
    description: "Starts the published flow when a signed HTTP POST arrives. Duplicate event ids are ignored.",
    icon: "⚡",
    category: "trigger",
    inputs: 0,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ samplePayload: J({ body: { event: "form.submitted", lead: { name: "Ada Lovelace", email: "ada@example.com" } } }) }),
  },
  "trigger.schedule": {
    type: "trigger.schedule",
    version: 1,
    title: "Schedule trigger",
    subtitle: "TRIGGER · SCHEDULE",
    description: "Starts the published flow on a cron schedule in a time zone (DST-aware).",
    icon: "🕐",
    category: "trigger",
    inputs: 0,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ cron: "0 9 * * 1", timezone: "UTC", missedPolicy: "skip" }),
  },
  "transform.json": {
    type: "transform.json",
    version: 1,
    title: "JSON transform",
    subtitle: "TRANSFORM · JSONATA",
    description: "Reshape data with a JSONata expression. `$steps.<id>` reads any upstream step.",
    icon: "⇄",
    category: "data",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ expression: "$" }),
  },
  "logic.condition": {
    type: "logic.condition",
    version: 1,
    title: "Condition",
    subtitle: "LOGIC · IF / ELSE",
    description: "Routes data down the true or false branch. The branch not taken is skipped.",
    icon: "⑂",
    category: "logic",
    inputs: 1,
    outputs: ["true", "false"],
    sideEffect: "none",
    defaultConfig: () => ({ expression: "true" }),
  },
  output: {
    type: "output",
    version: 1,
    title: "Output",
    subtitle: "OUTPUT · RESULT",
    description: "Stores a value in the run result under a key.",
    icon: "◎",
    category: "output",
    inputs: 1,
    outputs: [],
    sideEffect: "none",
    defaultConfig: () => ({ key: "result", expression: "" }),
  },
  "data.filter": {
    type: "data.filter",
    version: 1,
    title: "Filter",
    subtitle: "DATA · FILTER",
    description: "Keeps array items where the predicate is true.",
    icon: "⏷",
    category: "data",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ predicate: "true", source: "$" }),
  },
  "data.map": {
    type: "data.map",
    version: 1,
    title: "Map fields",
    subtitle: "DATA · MAPPING",
    description: "Builds an object field by field; each value is a JSONata expression.",
    icon: "↦",
    category: "data",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ fields: [{ key: "name", expression: "name" }] }),
  },
  "data.merge": {
    type: "data.merge",
    version: 1,
    title: "Merge",
    subtitle: "DATA · JOIN",
    description: "Waits for all incoming branches, then combines what they produced.",
    icon: "⋈",
    category: "data",
    inputs: "many",
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ mode: "object" }),
  },
  "data.csv": {
    type: "data.csv",
    version: 1,
    title: "CSV",
    subtitle: "DATA · CSV",
    description: "Parses CSV text into rows, or builds CSV from rows.",
    icon: "▦",
    category: "data",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ mode: "parse", source: "$", delimiter: "," }),
  },
  "data.file": {
    type: "data.file",
    version: 1,
    title: "Read file",
    subtitle: "DATA · FILE",
    description: "Reads an uploaded file, an upstream attachment, or a URL as text, JSON, CSV or PDF text (size-limited).",
    icon: "🗎",
    category: "data",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ from: "input", fileId: "", source: "data", as: "pdf_text" }),
  },
  "data.store": {
    type: "data.store",
    version: 1,
    title: "Store",
    subtitle: "DATA · KEY / VALUE",
    description: "Reads or writes a small workspace value (e.g. the last seen price) to compare across runs.",
    icon: "⛁",
    category: "data",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "idempotent",
    defaultConfig: () => ({ op: "get", namespace: "default", key: "'key'", value: "$" }),
  },
  "logic.loop": {
    type: "logic.loop",
    version: 1,
    title: "Loop",
    subtitle: "LOGIC · FOR EACH",
    description: "Runs a published subflow once per item (bounded by max items).",
    icon: "↻",
    category: "logic",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "per_action",
    defaultConfig: () => ({ items: "$", flowId: "", version: 1, maxItems: 50 }),
  },
  "flow.subflow": {
    type: "flow.subflow",
    version: 1,
    title: "Subflow",
    subtitle: "FLOW · SUBFLOW",
    description: "Runs a pinned published version of another flow and returns its output.",
    icon: "⊞",
    category: "logic",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "per_action",
    defaultConfig: () => ({ flowId: "", version: 1, input: "$" }),
  },
  "http.request": {
    type: "http.request",
    version: 1,
    title: "HTTP request",
    subtitle: "HTTP · REQUEST",
    description: "Calls a public HTTPS endpoint. Private/metadata addresses and unsafe redirects are blocked.",
    icon: "⇅",
    category: "integration",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "per_action",
    defaultConfig: () => ({ method: "GET", url: "'https://example.com'", headers: "", body: "", timeoutMs: 15000, sideEffect: "none", retry: { maxAttempts: 3 } }),
  },
  "ai.generate": {
    type: "ai.generate",
    version: 1,
    title: "AI · Generate",
    subtitle: "AI · TEXT",
    description: "Summarizes or writes text from the input using the configured AI provider.",
    icon: "✦",
    category: "ai",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ instructions: "Summarize the input in three sentences.", source: "$string($)", maxTokens: 400, model: "" }),
  },
  "ai.extract": {
    type: "ai.extract",
    version: 1,
    title: "AI · Extract",
    subtitle: "AI · STRUCTURED JSON",
    description: "Extracts fields into JSON that must match a JSON Schema. Output that doesn't match fails the step.",
    icon: "✦",
    category: "ai",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({
      instructions: "Extract the fields from the text.",
      source: "$string($)",
      schema: J({ type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false }),
      maxTokens: 400,
      model: "",
    }),
  },
  "ai.classify": {
    type: "ai.classify",
    version: 1,
    title: "AI · Classify",
    subtitle: "AI · LABEL",
    description: "Assigns exactly one of the allowed labels, with a confidence and short reason.",
    icon: "✦",
    category: "ai",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ instructions: "Classify the input.", source: "$string($)", labels: "high,medium,low", model: "" }),
  },
  "code.js": {
    type: "code.js",
    version: 1,
    title: "Code",
    subtitle: "CODE · JAVASCRIPT",
    description: "Runs JavaScript in an isolated container (no network, CPU/memory/time limits, no host secrets).",
    icon: "{}",
    category: "advanced",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "none",
    defaultConfig: () => ({ code: "return { count: Array.isArray(input) ? input.length : 1 };", timeoutMs: 5000 }),
  },
  "integration.action": {
    type: "integration.action",
    version: 1,
    title: "App action",
    subtitle: "INTEGRATION",
    description: "Calls an action on a connected app (Sheets, Slack, HubSpot…) using a workspace connection.",
    icon: "⬡",
    category: "integration",
    inputs: 1,
    outputs: ["out"],
    sideEffect: "per_action",
    defaultConfig: () => ({ actionId: "", connectionId: "", inputMapping: "{}", requireApproval: false, retry: { maxAttempts: 3 } }),
  },
};

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return (NODE_DEFINITIONS as Record<string, NodeDefinition>)[type];
}

let counter = 0;
export function newNodeId(existing: Iterable<string> = []): string {
  const taken = new Set(existing);
  let id: string;
  do {
    counter += 1;
    id = `n${Date.now().toString(36).slice(-4)}${counter.toString(36)}`;
  } while (taken.has(id));
  return id;
}

export function createNode<T extends NodeType>(type: T, position: { x: number; y: number }, existingIds: Iterable<string> = []): FlowNode<T> {
  const def = NODE_DEFINITIONS[type] as NodeDefinition<T>;
  return {
    id: newNodeId(existingIds),
    type,
    position,
    data: { label: def.title, config: def.defaultConfig() },
  };
}
