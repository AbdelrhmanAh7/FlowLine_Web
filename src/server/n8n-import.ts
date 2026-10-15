import { z } from "zod";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import type { FlowGraph, FlowNode, HttpConfig } from "@/engine/types";
import { MAX_EDGES, MAX_NODES } from "@/engine/validate";
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
// The code.js config validator caps code at 20,000 characters (src/engine/validate.ts); longer code is not stored.
const MAX_CODE_LENGTH = 20000;
// The same serialized-size ceiling graphSchema enforces on other save paths (src/server/flows.ts).
const MAX_GRAPH_BYTES = 512 * 1024;

function invalid(message: string): never {
  throw new HttpError(400, "INVALID_N8N_JSON", message);
}

/**
 * A replacement placeholder for an n8n node FlowLine cannot map. The config keeps a `REPLACE_WITH_…`
 * marker, which `validateGraph` reports as SETUP_REQUIRED, so a flow holding one cannot run until replaced.
 */
function unsupported(id: string, n8nType: string, position: { x: number; y: number }, note?: string): FlowNode<"transform.json"> {
  const shortType = n8nType.slice(0, 50);
  const token = n8nType.replace(/[^A-Za-z0-9]/g, "_").toUpperCase();
  const expression = note ? `"REPLACE_WITH_${token} — ${note}"` : `"REPLACE_WITH_${token}"`;
  return {
    id,
    type: "transform.json",
    position,
    data: { label: `Unsupported n8n node: ${shortType} — replace`, config: { expression } },
  };
}

/** True when an n8n HTTP node carries body, header, query or auth config this importer cannot preserve faithfully. */
function hasUnpreservedHttpConfig(params: Record<string, unknown>): boolean {
  if (params.sendBody === true || params.sendHeaders === true || params.sendQuery === true) return true;
  if (typeof params.authentication === "string" && params.authentication && params.authentication !== "none") return true;
  const set = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === "object") {
      const inner = (v as { parameters?: unknown }).parameters;
      return Array.isArray(inner) && inner.length > 0;
    }
    return v !== undefined && v !== null && v !== "";
  };
  for (const key of ["bodyParameters", "headerParameters", "queryParameters", "jsonBody", "body", "requestBody"]) if (set(params[key])) return true;
  const options = params.options;
  if (options && typeof options === "object") {
    const o = options as Record<string, unknown>;
    for (const key of ["bodyParameters", "headerParameters", "queryParameters"]) if (set(o[key])) return true;
  }
  return false;
}

/** Extracts HTTP body from n8n parameters when it's a plain JSON value (no expressions). */
function extractBody(params: Record<string, unknown>): string {
  // n8n V3: jsonBody (object) or body (string). Also check bodyParameters array for single raw value.
  if (params.jsonBody !== undefined && params.jsonBody !== null && typeof params.jsonBody === "object") {
    const v = params.jsonBody;
    // Ensure no expressions in the object
    const str = JSON.stringify(v);
    if (!/\{\{[^}]*\}\}/.test(str)) return str;
  }
  if (typeof params.body === "string" && params.body && !/\{\{[^}]*\}\}/.test(params.body)) return params.body;
  // Fallback: bodyParameters with a single raw value
  if (Array.isArray(params.bodyParameters) && params.bodyParameters.length === 1) {
    const bp = params.bodyParameters[0];
    if (bp && typeof bp === "object" && "value" in bp && bp.value !== undefined && bp.value !== null && typeof bp.value !== "object") {
      const str = String(bp.value);
      if (!/\{\{[^}]*\}\}/.test(str)) return str;
    }
  }
  return "";
}

/** Extracts HTTP headers from n8n parameters when they're plain key-value pairs (no expressions). */
function extractHeaders(params: Record<string, unknown>): string {
  // n8n V3: headerParameters array of {name, value} or headers object
  if (Array.isArray(params.headerParameters) && params.headerParameters.length > 0) {
    const headers: Record<string, string> = {};
    let ok = true;
    for (const hp of params.headerParameters) {
      if (hp && typeof hp === "object" && "name" in hp && "value" in hp) {
        const name = String(hp.name);
        const value = String(hp.value);
        if (/\{\{[^}]*\}\}/.test(value)) { ok = false; break; }
        headers[name] = value;
      } else { ok = false; break; }
    }
    if (ok) return JSON.stringify(headers);
  }
  if (params.headers && typeof params.headers === "object" && !Array.isArray(params.headers)) {
    const headers = params.headers as Record<string, unknown>;
    const out: Record<string, string> = {};
    let ok = true;
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === "string") {
        if (/\{\{[^}]*\}\}/.test(v)) { ok = false; break; }
        out[k] = v;
      } else { ok = false; break; }
    }
    if (ok) return JSON.stringify(out);
  }
  return "";
}

function mapNode(n: z.infer<typeof workflowSchema>["nodes"][number], id: string, position: { x: number; y: number }, branchNote?: string): FlowNode {
  const label = n.name.slice(0, 80);
  const params = n.parameters ?? {};

  if (n.type === "n8n-nodes-base.webhook") {
    return { id, type: "trigger.webhook", position, data: { label, config: NODE_DEFINITIONS["trigger.webhook"].defaultConfig() } };
  }

  if (["n8n-nodes-base.function", "n8n-nodes-base.functionItem", "n8n-nodes-base.code"].includes(n.type)) {
    const code = CODE_PARAMETERS.map((key) => params[key]).find((v): v is string => typeof v === "string");
    if (code !== undefined) {
      if (code.length + CODE_WARNING.length > MAX_CODE_LENGTH) return unsupported(id, n.type, position, `code is longer than ${MAX_CODE_LENGTH} characters - replace the node`);
      return { id, type: "code.js", position, data: { label, config: { code: CODE_WARNING + code, timeoutMs: 5000 } } };
    }
  }

  if (n.type === "n8n-nodes-base.httpRequest") {
    // Current n8n HTTP Request (V3) stores the verb in `method`; older exports use `requestMethod`.
    const method = String(params.method ?? params.requestMethod ?? "GET").toUpperCase() as HttpConfig["method"];
    const url = params.url;
    if (typeof url === "string" && HTTP_METHODS.includes(method)) {
      // URL with n8n expressions or credential refs must become a placeholder — the run would call a bogus URL.
      const urlHasExpr = /\{\{[^}]*\}\}/.test(url) || /\[CREDENTIAL:[^\]]*\]/.test(url);
      // Body, header, query or auth config that cannot be preserved faithfully → placeholder.
      if (urlHasExpr || hasUnpreservedHttpConfig(params)) {
        return unsupported(id, n.type, position, urlHasExpr
          ? "HTTP URL contains n8n expressions or credentials - replace and re-enter the request"
          : "HTTP body, headers or auth not imported - replace and re-enter the request");
      }
      const safe = method === "GET";
      // Map supported plain values for body and headers when present.
      const body = extractBody(params);
      const headers = extractHeaders(params);
      const config: HttpConfig = {
        method,
        url: JSON.stringify(url),
        headers,
        body,
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
  const seenEdges = new Set<string>();
  for (const [source, outputs] of Object.entries(workflow.connections ?? {})) {
    const sourceId = ids.get(source);
    if (!sourceId) invalid(`Connection starts at "${source}", which is not a node`);
    // Only the first output is imported; branches from other outputs are not supported yet.
    for (const conn of outputs.main?.[0] ?? []) {
      if (!conn) continue;
      const targetId = ids.get(conn.node);
      if (!targetId) invalid(`Connection goes to "${conn.node}", which is not a node`);
      if (sourceId === targetId) invalid(`Node "${source}" is connected to itself`);
      const key = `${sourceId}->${targetId}`;
      if (seenEdges.has(key)) continue; // the same connection twice is one edge
      seenEdges.add(key);
      edges.push({ id: `e${edges.length}`, source: sourceId, target: targetId, sourceHandle: "out", targetHandle: null });
    }
  }
  if (edges.length > MAX_EDGES) invalid(`Too many connections (max ${MAX_EDGES})`);

  const graph: FlowGraph = {
    nodes: nodes.map(({ n, id, position }) => {
      const branches = workflow.connections?.[n.name]?.main?.length ?? 0;
      const isBranchNode = ["n8n-nodes-base.if", "n8n-nodes-base.switch"].includes(n.type);
      const note = isBranchNode && branches > 1 ? "Additional branches not imported in MVP - manual replacement needed" : undefined;
      return mapNode(n, id, position, note);
    }),
    edges,
  };
  // Same size ceiling other save paths enforce (graphSchema): refuse a graph too large to store.
  if (JSON.stringify(graph).length >= MAX_GRAPH_BYTES) invalid("This workflow is too large to import (512 KB max)");

  return { name: workflow.name?.trim().slice(0, 80) || "Imported n8n workflow", graph };
}
