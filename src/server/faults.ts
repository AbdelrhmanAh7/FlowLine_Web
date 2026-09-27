/**
 * Fault injection for the TEST ENVIRONMENT ONLY (FLOWLINE_ENV=test).
 * Faults are scoped to the user who injected them, so parallel tests (and
 * other accounts) are never affected. In any other environment every function
 * here is inert and the /api/test/* routes return 404.
 */
export type FaultKind = "save" | "load" | "run";

type Pending = Record<FaultKind, { count: number; status: number }>;
const g = globalThis as unknown as { __flowlineFaults?: Map<string, Pending> };

export function testFeaturesEnabled() {
  return process.env.FLOWLINE_ENV === "test";
}

function forUser(userId: string): Pending {
  g.__flowlineFaults ??= new Map();
  let p = g.__flowlineFaults.get(userId);
  if (!p) {
    p = { save: { count: 0, status: 500 }, load: { count: 0, status: 500 }, run: { count: 0, status: 500 } };
    g.__flowlineFaults.set(userId, p);
  }
  return p;
}

export function setFault(userId: string, kind: FaultKind, count: number, status = 500) {
  if (!testFeaturesEnabled()) return;
  forUser(userId)[kind] = { count, status };
}

export function consumeFault(userId: string, kind: FaultKind): { status: number } | null {
  if (!testFeaturesEnabled()) return null;
  const f = g.__flowlineFaults?.get(userId)?.[kind];
  if (!f || f.count <= 0) return null;
  f.count -= 1;
  return { status: f.status };
}

export function resetFaults(userId?: string) {
  if (!testFeaturesEnabled()) return;
  if (userId) g.__flowlineFaults?.delete(userId);
  else delete g.__flowlineFaults;
}
