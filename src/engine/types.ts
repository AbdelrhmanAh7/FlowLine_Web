/** Node types implemented in Phase 1. All run locally — no external services or AI keys. */
export const NODE_TYPES = ["trigger.manual", "transform.json", "logic.condition", "output"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export interface ManualTriggerConfig {
  /** JSON text used as the run input when the user runs from the canvas. */
  samplePayload: string;
}
export interface JsonTransformConfig {
  /** JSONata expression evaluated against the upstream output. */
  expression: string;
}
export interface ConditionConfig {
  /** JSONata expression; its truthiness picks the `true` or `false` branch. */
  expression: string;
}
export interface OutputConfig {
  /** Key under which the value is stored in the run output. */
  key: string;
  /** Optional JSONata expression; defaults to passing the input through. */
  expression: string;
}

export interface NodeConfigMap {
  "trigger.manual": ManualTriggerConfig;
  "transform.json": JsonTransformConfig;
  "logic.condition": ConditionConfig;
  output: OutputConfig;
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

export type StepResultStatus = "succeeded" | "failed" | "skipped" | "reused";

export interface StepResult {
  nodeId: string;
  nodeType: NodeType;
  nodeLabel: string;
  position: number;
  status: StepResultStatus;
  input?: unknown;
  output?: unknown;
  error?: { code: string; message: string };
  skipReason?: string;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
}
