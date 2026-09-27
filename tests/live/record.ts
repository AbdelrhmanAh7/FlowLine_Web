import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/**
 * The live/sandbox suite records an honest status per check in
 * artifacts/phase-2/live-results.json: PASS, FAIL, or BLOCKED (with the reason,
 * e.g. missing sandbox credentials). BLOCKED is never reported as PASS.
 */
const FILE = "artifacts/phase-2/live-results.json";

export type LiveStatus = "PASS" | "FAIL" | "BLOCKED";

export function record(id: string, status: LiveStatus, detail: Record<string, unknown> = {}) {
  mkdirSync("artifacts/phase-2", { recursive: true });
  let all: Record<string, unknown> = {};
  try {
    all = JSON.parse(readFileSync(FILE, "utf8")) as Record<string, unknown>;
  } catch {
    /* first write */
  }
  all[id] = { status, at: new Date().toISOString(), ...detail };
  writeFileSync(FILE, JSON.stringify(all, null, 2) + "\n");
}

/** Runs a live check and records PASS/FAIL (rethrowing so vitest fails too). */
export async function live<T>(id: string, fn: () => Promise<T>, detail: (r: T) => Record<string, unknown> = () => ({})): Promise<T> {
  try {
    const r = await fn();
    record(id, "PASS", detail(r));
    return r;
  } catch (e) {
    record(id, "FAIL", { error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
