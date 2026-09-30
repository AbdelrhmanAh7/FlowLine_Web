// Starts the isolated TEST stack: Next.js on :3100 (build dir .next-test) + the worker,
// both with .env.test (flowline_test DB, FLOWLINE_ENV=test), plus the provider-boundary
// test doubles (fake SaaS APIs on :4010, fake OpenAI-compatible AI provider on :4011). Used by Playwright.
import { spawn, spawnSync } from "node:child_process";

process.loadEnvFile(".env.test");
process.env.NEXT_DIST_DIR = ".next-test";
// AI hub test double: honoured only with FLOWLINE_ENV=test; the owner still enters a key in the UI.
process.env.FLOWLINE_AI_TEST_OVERRIDE ??= "http://127.0.0.1:4011";
// Fake ports follow the URLs in .env.test (defaults 4010 / 4011), so parallel worktrees can use their own.
const FAKE_PROVIDERS_PORT = new URL(process.env.FLOWLINE_PROVIDER_OVERRIDE ?? "http://127.0.0.1:4010").port || "4010";
const FAKE_AI_PORT = new URL(process.env.FLOWLINE_AI_TEST_OVERRIDE).port || "4011";
// Cloud-only + UI-managed keys: the test stack runs with NO model-provider env keys.
for (const k of ["FLOWLINE_AI_PROVIDER", "FLOWLINE_AI_MODEL", "OLLAMA_BASE_URL", "OLLAMA_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "OPENAI_API_KEY"]) delete process.env[k];

// Platform credentials are managed in the admin panel (DB) — never read from env at runtime. The E2E stack starts with
// .env.test's fake OAuth/billing values seeded into the DB (test-only script; the admin-panel spec uses the UI).
spawnSync("npx tsx scripts/test/seed-platform.mts", { stdio: "inherit", shell: true, env: process.env });

// FLOWLINE_TEST_NEXT=start runs a PRODUCTION build (`next build` once, then `next start`) instead of `next dev`, with the
// same fakes, worker, DB and FLOWLINE_ENV=test routes. Used to tell dev-server (on-demand compile) stalls apart from
// application defects (INTERMITTENT-02). Default: `next dev`.
const prodMode = process.env.FLOWLINE_TEST_NEXT === "start";
if (prodMode) {
  const build = spawnSync("npx next build", { stdio: "inherit", shell: true, env: process.env });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const procs = [
  spawn(`npx tsx e2e/fakes/provider-server.ts --port ${FAKE_PROVIDERS_PORT}`, { stdio: "inherit", shell: true, env: process.env }),
  spawn(`npx tsx e2e/fakes/ai-server.ts --port ${FAKE_AI_PORT}`, { stdio: "inherit", shell: true, env: process.env }),
  spawn(prodMode ? "npx next start -p 3100" : "npx next dev -p 3100", { stdio: "inherit", shell: true, env: process.env }),
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
