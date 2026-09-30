import type { HostHandler } from "@/engine/execute";

/**
 * In-memory stand-in for the worker's data.store handler (unit tests only; the real handler is exercised by the
 * integration suites through the worker). Same semantics: `set` upserts and returns { key, stored, value }.
 */
export function memoryStore(): { handler: HostHandler; entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  const handler: HostHandler = async (node, input, env) => {
    const cfg = node.data.config as unknown as { op: string; namespace: string; key: string; value: string };
    if (node.type !== "data.store") throw new Error(`unexpected ${node.type}`);
    const key = String(await env.evaluate(cfg.key, input)).slice(0, 200);
    if (cfg.op === "get") return { kind: "ok", output: { key, found: entries.has(`${cfg.namespace}/${key}`), value: entries.get(`${cfg.namespace}/${key}`) ?? null, input } };
    const value = await env.evaluate(cfg.value, input);
    entries.set(`${cfg.namespace}/${key}`, value);
    return { kind: "ok", output: { key, stored: true, value } };
  };
  return { handler, entries };
}
