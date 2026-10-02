import type { FlowGraph } from "@/engine/types";
import { canonical } from "./packs/types";
import type { PackParams, TaskPack } from "./packs/types";

/**
 * A sample trial may only run a draft that still EXECUTES like the pack compiled it: same node ids and types, same
 * configs (data.store namespace/op/key/value and every upstream expression that computes the key), same wiring.
 * Labels and positions are the person's to change. The trigger's sample payload is ignored because a trial always
 * supplies its own input. Returns the drifted node/edge ids (empty = sample-safe).
 */
export function sampleTrialDrift(pack: TaskPack, params: PackParams, graph: FlowGraph): string[] {
  const compiled = pack.compile(params, (id) => id);
  const runtime = (n: FlowGraph["nodes"][number]) => {
    const config = { ...(n.data.config as unknown as Record<string, unknown>) };
    if (n.type === "trigger.manual") delete config.samplePayload;
    return canonical({ type: n.type, config });
  };
  const drift: string[] = [];
  const expected = new Map(compiled.nodes.map((n) => [n.id, n]));
  const actual = new Map<string, FlowGraph["nodes"][number]>();
  for (const node of graph.nodes) {
    if (actual.has(node.id) || !pack.nodeTypes.includes(node.type)) drift.push(node.id);
    actual.set(node.id, node);
  }
  for (const id of expected.keys()) if (!actual.has(id)) drift.push(id);
  for (const id of actual.keys()) if (!expected.has(id)) drift.push(id);

  const stores = compiled.nodes.filter((n) => n.type === "data.store");
  // Packs with no store node have no persistence side effect. Their registered local steps can be edited safely;
  // the node-type allowlist above still excludes network, integration, AI, and code nodes.
  if (stores.length === 0) return drift;

  // Store input references are JSONata step paths (for example `record.store_key`). Their root fields must survive
  // any narrowly allowed output-only merge around an upstream transform expression.
  const protectedRoots = new Set<string>();
  let overlayIsSafeToInspect = true;
  for (const store of stores) {
    const config = store.data.config as unknown as Record<string, unknown>;
    for (const field of ["key", "value"]) {
      const ref = config[field];
      if (typeof ref !== "string") continue;
      if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(ref)) protectedRoots.add(ref.split(".")[0]!);
      else overlayIsSafeToInspect = false;
    }
  }

  // The store and every node feeding its key/value are safety-critical. Keep their wiring fixed. Only a transform that
  // feeds a store DIRECTLY may wrap its original expression in a JSON merge that changes unrelated output fields: the
  // store reads that node's output roots, so `protectedRoots` covers everything the patch could reach. A transitive
  // upstream node (extract, facts, …) stays exact-match only — its outputs are rebuilt by the direct feeder under
  // other names (`sample` → `record.sample`, `id` → `record.store_key`), which the root check cannot see.
  const directFeeders = new Set<string>(compiled.edges.filter((e) => stores.some((s) => s.id === e.target)).map((e) => e.source));
  const critical = new Set<string>(stores.map((n) => n.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of compiled.edges) if (critical.has(edge.target) && !critical.has(edge.source)) {
      critical.add(edge.source);
      changed = true;
    }
  }
  const outputOnlyOverlay = (base: string, candidate: string) => {
    if (!overlayIsSafeToInspect) return false;
    const prefix = `$merge([(${base}), `;
    if (!candidate.startsWith(prefix) || !candidate.endsWith("])")) return false;
    let patch: unknown;
    try { patch = JSON.parse(candidate.slice(prefix.length, -2)); } catch { return false; }
    return Boolean(patch && typeof patch === "object" && !Array.isArray(patch) && Object.keys(patch).every((key) => !protectedRoots.has(key)));
  };
  for (const [id, wanted] of expected) {
    const found = actual.get(id);
    if (!found) continue;
    if (found.type !== wanted.type) {
      drift.push(id);
      continue;
    }
    if (found.type === "output") continue; // terminal output configuration cannot reach a side effect
    if (runtime(found) === runtime(wanted)) continue;
    if (!critical.has(id)) {
      drift.push(id);
      continue;
    }
    const wantConfig = wanted.data.config as unknown as Record<string, unknown>;
    const gotConfig = found.data.config as unknown as Record<string, unknown>;
    if (found.type === "transform.json" && directFeeders.has(id) && typeof wantConfig.expression === "string" && typeof gotConfig.expression === "string" && outputOnlyOverlay(wantConfig.expression, gotConfig.expression)) continue;
    drift.push(id);
  }

  const wire = (e: FlowGraph["edges"][number]) => canonical([e.source, e.target, e.sourceHandle ?? null, e.targetHandle ?? null]);
  const wantEdges = compiled.edges.filter((e) => critical.has(e.target)).map(wire).sort();
  const gotEdges = graph.edges.filter((e) => critical.has(e.target)).map(wire).sort();
  if (canonical(wantEdges) !== canonical(gotEdges)) drift.push("edges");
  return drift;
}
