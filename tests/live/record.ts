import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The live/sandbox suite records an honest status per check in
 * artifacts/phase-4/live-certification/live-results.json (Phase 2 results are frozen in artifacts/phase-2): PASS, FAIL, or BLOCKED (with the reason,
 * e.g. missing sandbox credentials). BLOCKED is never reported as PASS.
 * N/A marks a check that does not exist for a provider (e.g. a write on a
 * read-only provider). Callers may pass another output file (the phase-3
 * certification suite writes artifacts/phase-4/live-certification/live-results.json and, in
 * dry-run mode, artifacts/phase-4/live-certification/live-dryrun-results.json).
 */
// Phase 2 and Phase 3 evidence is frozen (artifacts/phase-2, artifacts/phase-3); runs from Phase 4 on record here.
const FILE = "artifacts/phase-4/live-certification/live-results.json";

export type LiveStatus = "PASS" | "FAIL" | "BLOCKED" | "N/A" | "DRYRUN_PASS" | "DRYRUN_FAIL";

export function record(id: string, status: LiveStatus, detail: Record<string, unknown> = {}, file: string = FILE) {
  mkdirSync(dirname(file), { recursive: true });
  let all: Record<string, unknown> = {};
  try {
    all = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    /* first write */
  }
  all[id] = { status, at: new Date().toISOString(), ...detail };
  writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
}

/** Runs a live check and records PASS/FAIL (rethrowing so vitest fails too). */
export async function live<T>(id: string, fn: () => Promise<T>, detail: (r: T) => Record<string, unknown> = () => ({}), file: string = FILE): Promise<T> {
  try {
    const r = await fn();
    record(id, "PASS", detail(r), file);
    return r;
  } catch (e) {
    record(id, "FAIL", { error: e instanceof Error ? e.message : String(e) }, file);
    throw e;
  }
}
