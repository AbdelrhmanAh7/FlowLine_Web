import type { FlowNode, NodeConfigMap, NodeType } from "./types";

export interface NodeDefinition<T extends NodeType = NodeType> {
  type: T;
  title: string;
  /** Uppercase mono subtitle on the canvas card, e.g. "TRIGGER · MANUAL". */
  subtitle: string;
  description: string;
  icon: string;
  category: "trigger" | "transform" | "logic" | "output";
  inputs: number;
  /** Output handle ids. */
  outputs: string[];
  defaultConfig: () => NodeConfigMap[T];
}

export const NODE_DEFINITIONS: { [K in NodeType]: NodeDefinition<K> } = {
  "trigger.manual": {
    type: "trigger.manual",
    title: "Manual trigger",
    subtitle: "TRIGGER · MANUAL",
    description: "Starts the flow when you press Run. Sends the sample payload as input.",
    icon: "⚡",
    category: "trigger",
    inputs: 0,
    outputs: ["out"],
    defaultConfig: () => ({
      samplePayload: JSON.stringify({ lead: { name: "Ada Lovelace", email: "ada@example.com", employees: 120 } }, null, 2),
    }),
  },
  "transform.json": {
    type: "transform.json",
    title: "JSON transform",
    subtitle: "TRANSFORM · JSONATA",
    description: "Reshape data with a JSONata expression. Runs in a sandbox with a time limit.",
    icon: "⇄",
    category: "transform",
    inputs: 1,
    outputs: ["out"],
    defaultConfig: () => ({ expression: "$" }),
  },
  "logic.condition": {
    type: "logic.condition",
    title: "Condition",
    subtitle: "LOGIC · IF / ELSE",
    description: "Routes data down the true or false branch. The branch not taken is skipped.",
    icon: "⑂",
    category: "logic",
    inputs: 1,
    outputs: ["true", "false"],
    defaultConfig: () => ({ expression: "true" }),
  },
  output: {
    type: "output",
    title: "Output",
    subtitle: "OUTPUT · RESULT",
    description: "Stores a value in the run result under a key.",
    icon: "◎",
    category: "output",
    inputs: 1,
    outputs: [],
    defaultConfig: () => ({ key: "result", expression: "" }),
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
