/**
 * Fault injection for the TEST ENVIRONMENT ONLY (FLOWLINE_ENV=test).
 * In any other environment every function here is inert and the
 * /api/test/* routes return 404.
 */
export type FaultKind = "save" | "load" | "run";

interface FaultState {
  pending: Record<FaultKind, { count: number; status: number }>;
}

const g = globalThis as unknown as { __flowlineFaults?: FaultState };

export function testFeaturesEnabled() {
  return process.env.FLOWLINE_ENV === "test";
}

function state(): FaultState {
  g.__flowlineFaults ??= { pending: { save: { count: 0, status: 500 }, load: { count: 0, status: 500 }, run: { count: 0, status: 500 } } };
  return g.__flowlineFaults;
}

export function setFault(kind: FaultKind, count: number, status = 500) {
  if (!testFeaturesEnabled()) return;
  state().pending[kind] = { count, status };
}

export function consumeFault(kind: FaultKind): { status: number } | null {
  if (!testFeaturesEnabled()) return null;
  const f = state().pending[kind];
  if (f.count <= 0) return null;
  f.count -= 1;
  return { status: f.status };
}

export function resetFaults() {
  if (!testFeaturesEnabled()) return;
  delete g.__flowlineFaults;
}
