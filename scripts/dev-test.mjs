// Starts the isolated TEST stack: Next.js on :3100 (build dir .next-test) + the worker,
// both with .env.test (flowline_test DB, FLOWLINE_ENV=test), plus the provider-boundary
// test doubles (fake SaaS APIs on :4010, fake OpenAI-compatible AI provider on :4011). Used by Playwright.
// Several stacks can run side by side (one per Playwright shard): FLOWLINE_TEST_PORT / FLOWLINE_TEST_FAKE_PORT /
// FLOWLINE_TEST_AI_PORT / FLOWLINE_TEST_DB pick this stack's ports and database, and scripts/test-stack.cjs derives
// every URL from them (DATABASE_URL, BETTER_AUTH_URL, FLOWLINE_PUBLIC_URL, the fake overrides and webhooks, the egress
// allowlist). The database is created when missing and migrated before seeding. Unset: the single default stack.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import pg from "pg";
import testStackEnv from "./test-stack.cjs";

process.loadEnvFile(".env.test");
// Also sets FLOWLINE_AI_TEST_OVERRIDE (AI hub test double: honoured only with FLOWLINE_ENV=test; the owner still enters
// a key in the UI). Fake ports default to the URLs in .env.test (4010 / 4011).
const stack = testStackEnv.applyTestStackEnv(process.env);
// A production build (FLOWLINE_TEST_NEXT=start) bakes in no port or URL, so every stack shares .next-test (build once,
// then FLOWLINE_TEST_SKIP_BUILD=1). `next dev` writes its build dir while it runs: a non-default stack gets its own.
process.env.NEXT_DIST_DIR = process.env.FLOWLINE_TEST_NEXT !== "start" && stack.port !== 3100 ? `.next-test-${stack.port}` : ".next-test";
const FAKE_PROVIDERS_PORT = stack.fakePort;
const FAKE_AI_PORT = stack.aiPort;
console.log(`test stack: app :${stack.port} · fakes :${FAKE_PROVIDERS_PORT}/:${FAKE_AI_PORT} · db ${stack.db} · build ${process.env.NEXT_DIST_DIR}`);
// Cloud-only + UI-managed keys: the test stack runs with NO model-provider env keys.
for (const k of ["FLOWLINE_AI_PROVIDER", "FLOWLINE_AI_MODEL", "OLLAMA_BASE_URL", "OLLAMA_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "OPENAI_API_KEY"]) delete process.env[k];

// Platform credentials are managed in the admin panel (DB) — never read from env at runtime. The E2E stack starts with
// .env.test's fake OAuth/billing values seeded into the DB (test-only script; the admin-panel spec uses the UI).
// The stack's database first: created when missing (a new shard's), then migrated.
{
  const admin = new URL(process.env.DATABASE_URL);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [stack.db]);
    if (!rowCount) {
      // stack.db matched /^flowline_test(_[a-z0-9]+)?$/ (scripts/test-stack.cjs), so it is safe to quote as-is.
      await client.query(`create database "${stack.db}"`);
      console.log(`test stack: created database ${stack.db}`);
    }
  } finally {
    await client.end();
  }
}
const migrate = spawnSync("npx tsx src/db/migrate.ts", { stdio: "inherit", shell: true, env: process.env });
if (migrate.status !== 0) process.exit(migrate.status ?? 1);
spawnSync("npx tsx scripts/test/seed-platform.mts", { stdio: "inherit", shell: true, env: process.env });

// FLOWLINE_TEST_NEXT=start runs a PRODUCTION build (`next build` once, then `next start`) instead of `next dev`, with the
// same fakes, worker, DB and FLOWLINE_ENV=test routes. Used to tell dev-server (on-demand compile) stalls apart from
// application defects (INTERMITTENT-02). Default: `next dev`.
// FLOWLINE_TEST_SKIP_BUILD=1 (prod mode only) reuses an existing .next-test build instead of rebuilding — scripts/gate.mjs
// builds it beforehand, in parallel with the integration suite. Without a build (no BUILD_ID) it still builds.
const prodMode = process.env.FLOWLINE_TEST_NEXT === "start";
const reuseBuild = prodMode && process.env.FLOWLINE_TEST_SKIP_BUILD === "1" && existsSync(`${process.env.NEXT_DIST_DIR}/BUILD_ID`);
if (reuseBuild) console.log(`reusing the existing ${process.env.NEXT_DIST_DIR} build (FLOWLINE_TEST_SKIP_BUILD=1)`);
else if (prodMode) {
  const build = spawnSync("npx next build", { stdio: "inherit", shell: true, env: process.env });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const procs = [
  spawn(`npx tsx e2e/fakes/provider-server.ts --port ${FAKE_PROVIDERS_PORT}`, { stdio: "inherit", shell: true, env: process.env }),
  spawn(`npx tsx e2e/fakes/ai-server.ts --port ${FAKE_AI_PORT}`, { stdio: "inherit", shell: true, env: process.env }),
  spawn(`npx next ${prodMode ? "start" : "dev"} -p ${stack.port}`, { stdio: "inherit", shell: true, env: process.env }),
  spawn(`npx tsx worker/index.ts --flowline-test-stack=${stack.port}`, { stdio: "inherit", shell: true, env: process.env }),
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
