// Starts the isolated TEST stack: Next.js on :3100 (build dir .next-test) + the worker,
// both with .env.test (flowline_test DB, FLOWLINE_ENV=test), plus the provider-boundary
// test doubles (fake SaaS APIs on :4010, fake Ollama on :4011). Used by Playwright.
import { spawn, spawnSync } from "node:child_process";

process.loadEnvFile(".env.test");
process.env.NEXT_DIST_DIR = ".next-test";

const procs = [
  spawn("npx tsx e2e/fakes/provider-server.ts --port 4010", { stdio: "inherit", shell: true, env: process.env }),
  spawn("npx tsx e2e/fakes/ai-server.ts --port 4011", { stdio: "inherit", shell: true, env: process.env }),
  spawn("npx next dev -p 3100", { stdio: "inherit", shell: true, env: process.env }),
  spawn("npx tsx worker/index.ts", { stdio: "inherit", shell: true, env: process.env }),
];

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (p.exitCode !== null || !p.pid) continue;
    // shell:true wraps the command; kill the whole tree so no orphan server/worker survives.
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
    else p.kill("SIGTERM");
  }
  process.exit(code);
};
for (const p of procs) p.on("exit", (code) => stop(code ?? 1));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
