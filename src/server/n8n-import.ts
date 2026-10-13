import { z } from "zod";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import type { FlowGraph, FlowNode, HttpConfig } from "@/engine/types";
import { MAX_NODES } from "@/engine/validate";
import { HttpError } from "./http";

const connection = z.object({ node: z.string(), type: z.string().optional(), index: z.number().optional() });
const workflowSchema = z.object({
  name: z.string().optional(),
  nodes: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        type: z.string().min(1).max(120),
        position: z.tuple([z.number(), z.number()]).optional(),
        parameters: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(MAX_NODES),
  connections: z.record(z.string(), z.object({ main: z.array(z.array(connection).nullable()).optional() })).optional(),
});

const HTTP_METHODS: HttpConfig["method"][] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const CODE_PARAMETERS = ["functionCode", "jsCode"] as const;
const CODE_WARNING = "// Code uses n8n items API - review before running\n";

function invalid(message: string): never {
  throw new HttpError(400, "INVALID_N8N_JSON", message);
}

function unsupported(id: string, n8nType: string, position: { x: number; y: number }, branchNote?: string): FlowNode<"transform.json"> {
  const shortType = n8nType.slice(0, 50);
  const token = n8nType.replace(/[^A-Za-z0-9]/g, "_").toUpperCase();
  const expression = branchNote ? `"REPLACE_WITH_${token} — ${branchNote}"` : `"REPLACE_WITH_${token}"`;
  return {
    id,
    type: "transform.json",
    position,
    data: { label: `Unsupported n8n node: ${shortType} — replace`, config: { expression } },
  };
}

function mapNode(n: z.infer<typeof workflowSchema>["nodes"][number], id: string, position: { x: number; y: number }, branchNote?: string): FlowNode {
  const label = n.name.slice(0, 80);
  const params = n.parameters ?? {};

  if (n.type === "n8n-nodes-base.webhook") {
    return { id, type: "trigger.webhook", position, data: { label, config: NODE_DEFINITIONS["trigger.webhook"].defaultConfig() } };
  }

  if (["n8n-nodes-base.function", "n8n-nodes-base.functionItem", "n8n-nodes-base.code"].includes(n.type)) {
    const code = CODE_PARAMETERS.map((key) => params[key]).find((v): v is string => typeof v === "string");
    if (code !== undefined) return { id, type: "code.js", position, data: { label, config: { code: CODE_WARNING + code, timeoutMs: 5000 } } };
  }

  if (n.type === "n8n-nodes-base.httpRequest") {
    const method = String(params.requestMethod ?? "GET").toUpperCase() as HttpConfig["method"];
    const url = params.url;
    if (typeof url === "string" && HTTP_METHODS.includes(method)) {
      const safe = method === "GET";
      // Replace n8n expressions {{...}} and credential refs with placeholders that block runs.
      const safeUrl = url.replace(/\{\{[^}]*\}\}/g, "[EXPRESSION:={{...}}]").replace(/\[CREDENTIAL:[^\]]*\]/g, "[CREDENTIAL:name]");
      const config: HttpConfig = {
        method,
        url: JSON.stringify(safeUrl),
        headers: "",
        body: "",
        timeoutMs: 15000,
        sideEffect: safe ? "none" : "non_idempotent",
        ...(safe ? { retry: { maxAttempts: 3 } } : {}),
      };
      return { id, type: "http.request", position, data: { label, config } };
    }
  }

  return unsupported(id, n.type, position, branchNote);
}

/** Converts an n8n workflow export into a FlowLine graph. Unsupported nodes become labelled placeholders that block runs. */
export function n8nToFlow(json: unknown): { name: string; graph: FlowGraph } {
  const parsed = workflowSchema.safeParse(json);
  if (!parsed.success) invalid("This is not an n8n workflow export");
  const workflow = parsed.data;

  const ids = new Map<string, string>();
  const nodes = workflow.nodes.map((n, i) => {
    if (ids.has(n.name)) invalid(`Two nodes are named "${n.name}"`);
    const id = `n${i}`;
    ids.set(n.name, id);
    const position = { x: n.position?.[0] ?? 0, y: n.position?.[1] ?? 0 };
    return { n, id, position };
  });

  const edges: FlowGraph["edges"] = [];
  for (const [source, outputs] of Object.entries(workflow.connections ?? {})) {
    const sourceId = ids.get(source);
    if (!sourceId) invalid(`Connection starts at "${source}", which is not a node`);
    // Only the first output is imported; branches from other outputs are not supported yet.
    for (const conn of outputs.main?.[0] ?? []) {
      if (!conn) continue;
      const targetId = ids.get(conn.node);
      if (!targetId) invalid(`Connection goes to "${conn.node}", which is not a node`);
      edges.push({ id: `e${edges.length}`, source: sourceId, target: targetId, sourceHandle: "out", targetHandle: null });
    }
  }

  return {
    name: workflow.name?.trim().slice(0, 80) || "Imported n8n workflow",
    graph: {
      nodes: nodes.map(({ n, id, position }) => {
        const branches = workflow.connections?.[n.name]?.main?.length ?? 0;
        const isBranchNode = ["n8n-nodes-base.if", "n8n-nodes-base.switch"].includes(n.type);
        const note = isBranchNode && branches > 1 ? "Additional branches not imported in MVP - manual replacement needed" : undefined;
        return mapNode(n, id, position, note);
      }),
      edges,
    },
  };
}
