// Which checkout a recording was made from. Written next to the frames when a clip is recorded and read back by
// `--skip-record`, so a later render (or a `--record-only` followed by `--skip-record`) never stamps its own HEAD.
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
