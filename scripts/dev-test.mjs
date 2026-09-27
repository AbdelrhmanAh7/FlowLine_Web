// Starts the isolated TEST stack: Next.js on :3100 (build dir .next-test) + the worker,
// both with .env.test (flowline_test DB, FLOWLINE_ENV=test). Used by Playwright.
import { spawn } from "node:child_process";

process.loadEnvFile(".env.test");
process.env.NEXT_DIST_DIR = ".next-test";

const procs = [
  spawn("npx", ["next", "dev", "-p", "3100"], { stdio: "inherit", shell: true, env: process.env }),
  spawn("npx", ["tsx", "worker/index.ts"], { stdio: "inherit", shell: true, env: process.env }),
];

const stop = (code = 0) => {
  for (const p of procs) if (!p.killed) p.kill();
  process.exit(code);
};
for (const p of procs) p.on("exit", (code) => stop(code ?? 1));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
