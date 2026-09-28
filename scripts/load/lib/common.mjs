/** Shared helpers for the load scripts (scripts/load/run.mjs, scripts/load/beta.mjs). */
import { execFileSync } from "node:child_process";
import { percentile } from "../../release/lib/email-token.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Latency summary: n, p50/p95/p99/max (ms) and a status-code histogram (-1 = network error). */
export function summary(lat, statuses) {
  const counts = {};
  for (const s of statuses) counts[s] = (counts[s] ?? 0) + 1;
  return { n: lat.length, p50: percentile(lat, 50), p95: percentile(lat, 95), p99: percentile(lat, 99), max: lat.length ? Math.round(Math.max(...lat)) : null, statuses: counts };
}

/** Times a fetch until its body is fully read. Network errors report status -1. */
export async function timed(fn) {
  const t = performance.now();
  let status = 0;
  try {
    const r = await fn();
    status = r.status;
    await r.arrayBuffer();
  } catch {
    status = -1;
  }
  return { ms: performance.now() - t, status };
}

/** Memory / CPU of the containers whose name starts with `prefix` (docker stats, one sample). */
export function dockerStats(prefix = "flowline-staging") {
  try {
    const out = execFileSync("docker", ["stats", "--no-stream", "--format", "{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"], { encoding: "utf8" });
    return out
      .trim()
      .split("\n")
      .filter((l) => l.startsWith(prefix))
      .map((l) => {
        const [name, mem, cpu] = l.split("\t");
        return { name, mem: mem.split(" / ")[0], cpu };
      });
  } catch (e) {
    return [{ error: String(e.message).slice(0, 120) }];
  }
}
