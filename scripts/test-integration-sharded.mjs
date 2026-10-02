// Sharded integration gate: runs the vitest "integration" project as N concurrent shards, each against its OWN database.
//
//   node scripts/test-integration-sharded.mjs [--shards=N] [--prefix=flowline_test_s] [--log-dir=<dir>]
//
// - Env comes from .env.test (parsed with util.parseEnv; values already set in the shell win, as in scripts/with-env.mjs).
//   Only the children's env is built from it; process.env is not modified.
// - Shard i (1..N) uses DATABASE_URL = .env.test's DATABASE_URL with the database name replaced by `${prefix}${i}`
//   (e.g. flowline_test_s1, which still satisfies tests/integration/global-setup.ts). Missing shard databases are created
//   from the `postgres` maintenance DB (falls back to the base test DB). Nothing is ever dropped by this script.
//   Each child's globalSetup migrates and seeds its own database; tests that need a throwaway DB derive it from the
//   shard name (flowline_test_s1_rot, _upg, _cxh01), so those don't collide either.
// - Children: `vitest run --project integration --shard=i/N --no-cache`. `--no-cache` because the N processes would
//   otherwise all rewrite node_modules/.vite/vitest/results.json at once (a corrupt file breaks the next vitest start).
// - Output lines are prefixed `[int i/N]`; with --log-dir each shard's full output also goes to <dir>/shard-<i>.log.
// - Exit code: 0 only when every shard passed. Totals (tests passed/failed/skipped, files, wall time) are printed last.
//
// Note: the worker-heartbeat guard in global-setup checks the shard's own DB. A test-stack worker runs against
// flowline_test, so it cannot claim runs from a shard DB; the shards use no fixed ports either.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import pg from "pg";
import { resolveIntegrationBaseEnv } from "./test-integration-env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, ".env.test");
const VITEST = join(ROOT, "node_modules", "vitest", "vitest.mjs");
const SHARD_DB = /^flowline_test_[a-z0-9]+$/; // must also satisfy global-setup's /flowline_test(_[a-z0-9]+)?/

// ---- options ----
const opts = { shards: String(Math.min(4, availableParallelism())), prefix: "flowline_test_s", "log-dir": "" };
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z-]+)=(.*)$/);
  if (!m || !(m[1] in opts)) {
    console.error(`unknown argument: ${a}\nusage: node scripts/test-integration-sharded.mjs [--shards=N] [--prefix=flowline_test_s] [--log-dir=<dir>]`);
    process.exit(2);
  }
  opts[m[1]] = m[2];
}
const N = Number(opts.shards);
if (!Number.isInteger(N) || N < 1 || N > 16) {
  console.error(`--shards must be an integer 1..16 (got ${opts.shards})`);
  process.exit(2);
}
const prefix = opts.prefix;
if (!/^flowline_test_[a-z0-9]*$/.test(prefix)) {
  console.error(`--prefix must look like flowline_test_<lowercase letters/digits> (got ${prefix})`);
  process.exit(2);
}
const logDir = opts["log-dir"] ? resolve(opts["log-dir"]) : "";

// ---- env ----
if (!existsSync(ENV_FILE)) {
  console.error(".env.test not found — copy .env.example");
  process.exit(2);
}
const fileEnv = parseEnv(readFileSync(ENV_FILE, "utf8"));
let baseEnv;
try {
  baseEnv = resolveIntegrationBaseEnv(fileEnv, process.env); // shell values win, like process.loadEnvFile in with-env.mjs
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(2);
}
const redact = (u) => u.replace(/\/\/[^@]*@/, "//***@");
const withDb = (url, name) => {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
};
const baseUrl = baseEnv.DATABASE_URL;
const baseName = decodeURIComponent(new URL(baseUrl).pathname.slice(1));
const shards = Array.from({ length: N }, (_, k) => {
  const i = k + 1;
  const db = `${prefix}${i}`;
  if (!SHARD_DB.test(db) || db === baseName) throw new Error(`refusing shard database name ${db}`);
  return { i, db, url: withDb(baseUrl, db) };
});

// ---- databases ----
async function adminClient() {
  for (const url of [withDb(baseUrl, "postgres"), baseUrl]) {
    const c = new pg.Client({ connectionString: url });
    try {
      await c.connect();
      return c;
    } catch (e) {
      await c.end().catch(() => {});
      console.error(`[int] could not connect to ${redact(url)}: ${e.message}`);
    }
  }
  throw new Error("no maintenance connection (tried postgres and the base test DB)");
}

async function ensureDatabases() {
  const c = await adminClient();
  try {
    for (const s of shards) {
      const { rowCount } = await c.query("select 1 from pg_database where datname = $1", [s.db]);
      if (rowCount) continue;
      try {
        await c.query(`create database "${s.db}"`); // name validated against SHARD_DB above
        console.log(`[int] created database ${s.db}`);
      } catch (e) {
        if (e.code !== "42P04") throw e; // duplicate_database: created concurrently, fine
      }
    }
  } finally {
    await c.end();
  }
}

// ---- run ----
const strip = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

function runShard(s) {
  const tag = `[int ${s.i}/${N}]`;
  const log = logDir ? createWriteStream(join(logDir, `shard-${s.i}.log`)) : null;
  let all = "";
  const env = { ...baseEnv, DATABASE_URL: s.url };
  const args = [VITEST, "run", "--project", "integration", `--shard=${s.i}/${N}`, "--no-cache"];
  const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const pipe = (stream, out) => {
    let buf = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      all += chunk;
      log?.write(chunk);
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) out.write(`${tag} ${l}\n`);
    });
    stream.on("end", () => {
      if (buf) out.write(`${tag} ${buf}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  const started = Date.now();
  return { child, done: new Promise((res) => {
    child.on("error", (e) => {
      all += `\nspawn error: ${e.message}\n`;
    });
    child.on("close", (code, signal) => {
      const finish = () => res({ ...s, code: code ?? 1, signal, ms: Date.now() - started, ...parseTotals(all) });
      if (log) log.end(finish);
      else finish();
    });
  }) };
}

function parseTotals(out) {
  const text = strip(out);
  const count = (line) => {
    const r = { passed: 0, failed: 0, skipped: 0, todo: 0 };
    if (!line) return null;
    for (const m of line.matchAll(/(\d+) (passed|failed|skipped|todo)/g)) r[m[2]] += Number(m[1]);
    return r;
  };
  return { tests: count(text.match(/^\s*Tests\s+(.*)$/m)?.[1]), files: count(text.match(/^\s*Test Files\s+(.*)$/m)?.[1]) };
}

const t0 = Date.now();
if (logDir) mkdirSync(logDir, { recursive: true });
console.log(`[int] ${N} shard(s) on ${shards.map((s) => s.db).join(", ")} on ${new URL(baseUrl).host}`);
try {
  await ensureDatabases();
} catch (e) {
  console.error(`[int] database setup failed: ${e.message}`);
  process.exit(1);
}

const running = shards.map(runShard);
const stop = (sig) => {
  for (const r of running) r.child.kill(sig);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
const results = await Promise.all(running.map((r) => r.done));

// ---- summary ----
const sum = { passed: 0, failed: 0, skipped: 0, todo: 0 };
const files = { passed: 0, failed: 0 };
let bad = 0;
console.log("\n[int] ---- shard results ----");
for (const r of results) {
  const ok = r.code === 0 && r.tests !== null && r.tests.failed === 0;
  if (!ok) bad++;
  if (r.tests) for (const k of Object.keys(sum)) sum[k] += r.tests[k];
  if (r.files) {
    files.passed += r.files.passed;
    files.failed += r.files.failed;
  }
  const t = r.tests ? `${r.tests.passed} passed, ${r.tests.failed} failed, ${r.tests.skipped} skipped` : "no test summary";
  console.log(`[int ${r.i}/${N}] ${ok ? "PASS" : "FAIL"} rc=${r.code}${r.signal ? ` (${r.signal})` : ""} ${t} in ${(r.ms / 1000).toFixed(1)}s (db ${r.db})`);
}
const wall = ((Date.now() - t0) / 1000).toFixed(1);
console.log(
  `[int] TOTAL tests: ${sum.passed} passed, ${sum.failed} failed, ${sum.skipped} skipped${sum.todo ? `, ${sum.todo} todo` : ""}; ` +
    `files: ${files.passed} passed, ${files.failed} failed; shards failed: ${bad}/${N}; wall ${wall}s${logDir ? `; logs in ${logDir}` : ""}`,
);
process.exit(bad ? 1 : 0);
