import type { FlowGraph } from "@/engine/types";
import type { Department } from "../model";

export type PackParams = Record<string, string | number | boolean | string[]>;

export interface PackCheck {
  id: string;
  passed: boolean;
}

export interface PackFixture {
  id: string;
  /** Synthetic, labelled sample input (never a real customer). */
  input: unknown;
  /** Expected business result for this input (what "matched the requested outcome" means here). */
  expect: (output: Record<string, unknown>) => PackCheck[];
}

/**
 * A versioned, tested task pack. It compiles to a graph of REGISTERED local nodes only; params are data (embedded as
 * JSON literals), never code. `evaluate` checks a run's output for the business result, independently of exit status.
 */
export interface TaskPack {
  id: string;
  version: number;
  department: Department;
  /** Node types the compiled graph may contain (checked at compile time). */
  nodeTypes: readonly string[];
  /** Capabilities the pack actually provides (shown to the owner). */
  capabilities: readonly string[];
  inputContract: string;
  outputContract: string;
  /** Output keys a successful run must produce (one of them). */
  outputKeys: readonly string[];
  compile(params: PackParams, label: (nodeId: string) => string): FlowGraph;
  sample(params: PackParams): unknown;
  evaluate(output: Record<string, unknown>, input: unknown, params: PackParams): PackCheck[];
  fixtures(params: PackParams): PackFixture[];
}

/** Serialises data as a JSONata literal (JSON string/array/object literals are valid JSONata). */
export const lit = (v: unknown) => JSON.stringify(v);

/** Canonical JSON (object keys sorted, array order kept): stored run output is Postgres jsonb, which reorders keys. */
export const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

/** Deep equality for evaluator checks, independent of object key order. */
export const sameJson = (a: unknown, b: unknown) => canonical(a) === canonical(b);
