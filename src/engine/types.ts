/** Node types. Local nodes run in the engine; integration/AI/HTTP/code nodes run through worker handlers. */
export const NODE_TYPES = [
  "trigger.manual",
  "trigger.webhook",
  "trigger.schedule",
  "transform.json",
  "logic.condition",
  "output",
  "data.filter",
  "data.map",
  "data.merge",
  "data.csv",
  "data.file",
  "data.store",
  "logic.loop",
  "flow.subflow",
  "http.request",
  "ai.generate",
  "ai.extract",
  "ai.classify",
  "code.js",
  "integration.action",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];
export const TRIGGER_TYPES: NodeType[] = ["trigger.manual", "trigger.webhook", "trigger.schedule"];

export interface RetryConfig {
  /** Total attempts for retryable errors (1 = no retry). */
  maxAttempts?: number;
}

export interface ManualTriggerConfig {
  /** JSON text used as the run input when the user runs from the canvas. */
  samplePayload: string;
}
export interface WebhookTriggerConfig {
  /** JSON text used as input for test runs from the canvas. */
  samplePayload: string;
  /**
   * "flowline": x-flowline-signature (t=,v1=HMAC of "t.body") + x-flowline-event-id.
   * "github":   X-Hub-Signature-256 (sha256=HMAC of body) + X-GitHub-Delivery as the event id.
   */
  signatureScheme?: "flowline" | "github";
}
export interface ScheduleTriggerConfig {
  cron: string;
  timezone: string;
  missedPolicy: "skip" | "run_once" | "run_all";
}
export interface JsonTransformConfig {
  expression: string;
}
export interface ConditionConfig {
  expression: string;
}
export interface OutputConfig {
  key: string;
  expression: string;
}
export interface FilterConfig {
  /** JSONata predicate evaluated per item (`$` is the item). */
  predicate: string;
  /** Optional JSONata selecting the array from the input (default `$`). */
  source: string;
}
export interface MapConfig {
  fields: { key: string; expression: string }[];
}
export interface MergeConfig {
  /** object: { <label>: value } per upstream; array: [values]; first: first non-skipped. */
  mode: "object" | "array" | "first";
}
export interface CsvConfig {
  mode: "parse" | "build";
  /** JSONata selecting the CSV text (parse) or the array of rows (build). */
  source: string;
  delimiter: string;
}
export interface FileConfig {
  /** "upload": a stored file id; "input": base64 data from upstream (e.g. an email attachment); "url": fetched with egress protection. */
  from: "upload" | "input" | "url";
  fileId: string;
  /** JSONata for base64 data (from=input) or URL (from=url). */
  source: string;
  /** How to read it. */
  as: "text" | "json" | "csv" | "pdf_text";
}
export interface StoreConfig {
  op: "get" | "set";
  namespace: string;
  /** JSONata producing the key. */
  key: string;
  /** JSONata producing the value to store (set). */
  value: string;
}
export interface LoopConfig {
  /** JSONata selecting the array to iterate. */
  items: string;
  /** Subflow executed once per item. */
  flowId: string;
  version: number;
  maxItems: number;
}
export interface SubflowConfig {
  flowId: string;
  /** Pinned published version number of the subflow. */
  version: number;
  /** JSONata producing the subflow input. */
  input: string;
}
export interface HttpConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSONata producing the URL string. */
  url: string;
  /** JSONata producing a headers object (optional). */
  headers: string;
  /** JSONata producing the JSON body (optional). */
  body: string;
  timeoutMs: number;
  /** Declared side effect: GET defaults to none; others default to non_idempotent. */
  sideEffect: "none" | "idempotent" | "non_idempotent";
  retry?: RetryConfig;
}
/** AI hub route pinned on a step: a workspace AI connection + model id (never a secret). Null/absent = workspace default. */
export interface AiRouteConfig {
  connectionId: string;
  modelId: string;
}
export interface AiGenerateConfig {
  /** Instructions (system). */
  instructions: string;
  /** JSONata producing the text to work on. */
  source: string;
  maxTokens: number;
  /** Pre-hub model override (legacy; honoured only if the default connection lists it). */
  model: string;
  route?: AiRouteConfig | null;
}
export interface AiExtractConfig {
  instructions: string;
  source: string;
  /** JSON Schema (as JSON text) the output must satisfy. */
  schema: string;
  maxTokens: number;
  /** Pre-hub model override (legacy; honoured only if the default connection lists it). */
  model: string;
  route?: AiRouteConfig | null;
}
export interface AiClassifyConfig {
  instructions: string;
  source: string;
  /** Allowed labels, comma-separated. */
  labels: string;
  model: string;
  route?: AiRouteConfig | null;
}
export interface CodeConfig {
  /** JavaScript body; receives `input`, must `return` a JSON-serializable value. Runs in an isolated container. */
  code: string;
  timeoutMs: number;
}
export interface IntegrationActionConfig {
  actionId: string;
  connectionId: string;
  /** JSONata producing the action input object. `$steps.<nodeId>` references upstream outputs. */
  inputMapping: string;
  /** Require human approval (defaults to the action's `sensitive` flag). */
  requireApproval: boolean;
  retry?: RetryConfig;
}

export interface NodeConfigMap {
  "trigger.manual": ManualTriggerConfig;
  "trigger.webhook": WebhookTriggerConfig;
  "trigger.schedule": ScheduleTriggerConfig;
  "transform.json": JsonTransformConfig;
  "logic.condition": ConditionConfig;
  output: OutputConfig;
  "data.filter": FilterConfig;
  "data.map": MapConfig;
  "data.merge": MergeConfig;
  "data.csv": CsvConfig;
  "data.file": FileConfig;
  "data.store": StoreConfig;
  "logic.loop": LoopConfig;
  "flow.subflow": SubflowConfig;
  "http.request": HttpConfig;
  "ai.generate": AiGenerateConfig;
  "ai.extract": AiExtractConfig;
  "ai.classify": AiClassifyConfig;
  "code.js": CodeConfig;
  "integration.action": IntegrationActionConfig;
}

export interface FlowNode<T extends NodeType = NodeType> {
  id: string;
  type: T;
  position: { x: number; y: number };
  data: { label: string; config: NodeConfigMap[T] };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** Condition nodes emit on "true" / "false"; others use "out" or null. */
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface ValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export type StepResultStatus = "succeeded" | "failed" | "skipped" | "reused" | "waiting_approval" | "uncertain" | "cancelled";

export interface StepResult {
  nodeId: string;
  nodeType: NodeType;
  nodeLabel: string;
  position: number;
  status: StepResultStatus;
  input?: unknown;
  output?: unknown;
  error?: { code: string; message: string; retryable?: boolean; retryAfterMs?: number };
  skipReason?: string;
  meta?: Record<string, unknown>;
  log?: string[];
  attempts?: number;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
}
