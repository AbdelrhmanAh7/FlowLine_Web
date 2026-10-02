import { checkExpressionSyntax, EXPRESSION_MAX_LENGTH } from "@/engine/expression";
import { NODE_TYPES, type FlowGraph } from "@/engine/types";
import { validateGraph } from "@/engine/validate";
import { PROVIDER_IDS } from "@/integrations/types";
import { isCapability } from "@/lib/permissions";
import { blueprintSchema, type CompanyBlueprint, type TaskPlan } from "./model";
import { getPack } from "./packs";

export interface BlueprintIssue {
  code: string;
  taskId?: string;
  detail?: string;
}

/** Compiles one operational workflow task from its registered pack. Throws nothing; returns issues instead. */
export function compileTask(task: TaskPlan, label: (nodeId: string) => string = (id) => id): { graph: FlowGraph | null; issues: BlueprintIssue[] } {
  const pack = getPack(task.packId, task.packVersion);
  if (!pack) return { graph: null, issues: [{ code: "UNKNOWN_PACK", taskId: task.id }] };
  if (pack.department !== task.department) return { graph: null, issues: [{ code: "PACK_DEPARTMENT_MISMATCH", taskId: task.id }] };
  const issues: BlueprintIssue[] = (pack.paramIssues?.(task.params) ?? []).map((code) => ({ code, taskId: task.id }));
  if (issues.length) return { graph: null, issues };
  const graph = pack.compile(task.params, label);
  for (const n of graph.nodes) {
    if (!(NODE_TYPES as readonly string[]).includes(n.type) || !pack.nodeTypes.includes(n.type)) issues.push({ code: "NODE_NOT_ALLOWED", taskId: task.id, detail: n.type });
    const cfg = n.data.config as unknown as Record<string, unknown>;
    for (const key of ["expression", "predicate", "source", "inputMapping"]) {
      const v = cfg[key];
      if (typeof v !== "string" || !v.trim()) continue;
      if (v.length > EXPRESSION_MAX_LENGTH) issues.push({ code: "EXPRESSION_TOO_LONG", taskId: task.id, detail: n.id });
      else if (checkExpressionSyntax(v)) issues.push({ code: "EXPRESSION_INVALID", taskId: task.id, detail: n.id });
    }
  }
  for (const i of validateGraph(graph)) issues.push({ code: `GRAPH_${i.code}`, taskId: task.id, detail: i.nodeId ?? i.edgeId });
  const outputs = graph.nodes.filter((n) => n.type === "output").map((n) => (n.data.config as { key: string }).key);
  if (!pack.outputKeys.every((k) => outputs.includes(k))) issues.push({ code: "OUTPUT_CONTRACT", taskId: task.id });
  return { graph: issues.length ? null : graph, issues };
}

const KNOWN_PROVIDERS = new Set<string>([...PROVIDER_IDS, "ai"]);

/**
 * Structural + safety validation of a blueprint, whoever produced it (rules, a CLI, an import). Business completeness
 * (missing facts, unsupported tools) is reported through `blockers`, not here.
 */
export function validateBlueprint(raw: unknown): { blueprint: CompanyBlueprint | null; issues: BlueprintIssue[] } {
  const parsed = blueprintSchema.safeParse(raw);
  if (!parsed.success) return { blueprint: null, issues: parsed.error.issues.slice(0, 10).map((i) => ({ code: "SCHEMA", detail: i.path.join(".").slice(0, 80) })) };
  const bp = parsed.data;
  const issues: BlueprintIssue[] = [];
  const taskIds = new Set<string>();
  for (const t of bp.tasks) {
    if (taskIds.has(t.id)) issues.push({ code: "DUPLICATE_TASK", taskId: t.id });
    taskIds.add(t.id);
  }
  const roleIds = new Set(bp.roles.map((r) => r.id));
  for (const r of bp.roles) {
    for (const tid of r.tasks) {
      const t = bp.tasks.find((x) => x.id === tid);
      if (!t) issues.push({ code: "ROLE_UNKNOWN_TASK", taskId: tid });
      else if (t.department !== r.department || t.roleId !== r.id) issues.push({ code: "ROLE_TASK_MISMATCH", taskId: tid });
    }
  }
  for (const t of bp.tasks) {
    if (!roleIds.has(t.roleId)) issues.push({ code: "TASK_UNKNOWN_ROLE", taskId: t.id });
    for (const p of t.permissions) if (!isCapability(p)) issues.push({ code: "UNKNOWN_PERMISSION", taskId: t.id, detail: p });
    for (const c of t.connections) if (!KNOWN_PROVIDERS.has(c.provider)) issues.push({ code: "UNKNOWN_PROVIDER", taskId: t.id, detail: c.provider });
    for (const d of t.dependsOn) if (!taskIds.has(d)) issues.push({ code: "UNKNOWN_DEPENDENCY", taskId: t.id, detail: d });
    if (t.availability === "operational" && t.kind === "workflow") issues.push(...compileTask(t).issues);
    if (t.kind === "agent" && t.packId) issues.push({ code: "AGENT_WITH_PACK", taskId: t.id });
    if (t.availability !== "operational" && t.packId && !getPack(t.packId, t.packVersion)) issues.push({ code: "UNKNOWN_PACK", taskId: t.id });
  }
  if (hasCycle(bp.tasks)) issues.push({ code: "DEPENDENCY_CYCLE" });
  return { blueprint: issues.length ? null : bp, issues };
}

function hasCycle(tasks: TaskPlan[]) {
  const deps = new Map(tasks.map((t) => [t.id, t.dependsOn]));
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const d of deps.get(id) ?? []) if (visit(d)) return true;
    state.set(id, 2);
    return false;
  };
  return tasks.some((t) => visit(t.id));
}
