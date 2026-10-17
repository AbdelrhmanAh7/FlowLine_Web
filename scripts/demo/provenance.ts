// Which checkout a recording was made from. Written next to the frames when a clip is recorded and read back by
// `--skip-record`, so a later render (or a `--record-only` followed by `--skip-record`) never stamps its own HEAD.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FILE = "provenance.json";

export function writeProvenance(dir: string, uiCommit: string): void {
  writeFileSync(join(dir, FILE), JSON.stringify({ uiCommit }));
}

/** The commit the recording in `dir` was made from; throws for a recording that predates provenance. */
export function readProvenance(dir: string): string {
  const file = join(dir, FILE);
  if (!existsSync(file)) throw new Error(`${file} is missing: this recording has no recorded commit; re-record it (drop --skip-record)`);
  const { uiCommit } = JSON.parse(readFileSync(file, "utf8")) as { uiCommit?: unknown };
  if (typeof uiCommit !== "string" || !uiCommit) throw new Error(`${file} has no uiCommit; re-record it (drop --skip-record)`);
  return uiCommit;
}

/**
 * The commit of the checkout in `root`. Every failure signal throws with its reason — git that cannot start, a
 * nonzero exit (no HEAD, not a checkout) and empty output — so an empty SHA can never reach a recording's provenance.
 */
export function gitHead(root: string): string {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: null });
  if (r.error) throw new Error(`git rev-parse HEAD could not run: ${(r.error as Error).message}`);
  if (r.status !== 0) throw new Error(`git rev-parse HEAD failed (exit ${r.status}): ${String(r.stderr).trim()}`);
  const sha = r.stdout ? r.stdout.toString("utf8").trim() : "";
  if (!sha) throw new Error("git rev-parse HEAD printed nothing (no HEAD in this checkout)");
  return sha;
}
