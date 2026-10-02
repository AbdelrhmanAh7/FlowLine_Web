// Gate runner: the pre-commit gate (AGENTS.md "Gates before commit") with everything that can safely run at once in
// parallel. Two tiers:
//
//   pnpm gate        (--tier=fast, every commit; ≈3–4 min on a 4-CPU machine)
//   pnpm gate:full   (--tier=full, before merging to main; adds every Chromium spec, Firefox and WebKit)
//   options: [--only=a,b] [--skip=a,b] [--out=<dir>] [--stacks=K (max(3, CPUs/2), default ≤4, ≤6)] [--shards=N (4)]
//            [--browsers=sequential|parallel] [--fail-fast] [--group=product,auth,editor,platform] [--list-groups]
//   Small gates: --only=static (lint,typecheck,evidence) | unit | contract | integration | build; browser groups with
//   --group (implies --only=chromium; name other projects with --only). Groups run every test of concrete spec files
//   from scripts/gate-groups.mjs (validated: each e2e/*.spec.ts in exactly one group). See docs/implementation/SMALL_GATES.md.
//
// Steps (names for --only/--skip), by phase:
//   1. lint (cached), typecheck, evidence, unit, contract — in parallel; none uses a database or a fixed port (contract
//      tests start their fakes on ephemeral ports).
//   2. integration — scripts/test-integration-sharded.mjs: N vitest shards at once, each on its own database
//      (flowline_test_s<i>). In parallel: build (the stacks' production build into .next-test, no DB), then stack —
//      K isolated test stacks on that build, each with its own app/fake ports and database (scripts/test-stack.cjs):
//      stack 1 = 3100/4010/4011 + flowline_test, stack k = 3k00/4k10/4k11 + flowline_test_e<k>.
//   3. chromium, firefox, webkit — each project runs as Playwright shards at once (--shard=i/n), one per stack, via
//      e2e/tools/browser-docker.sh. Fast tier: Chromium's @critical/@cross-browser specs on K stacks. Full tier: all
//      Chromium specs on K stacks, Firefox and WebKit on ceil(K/2) each, all three projects at once on disjoint stacks
//      on machines with ≥8 CPUs; below that (or --browsers=sequential) the projects run one after another on stacks 1..K.
//      Measured on 4 CPUs: fast ≈3m20s; full ≈9m45s sequential (all-at-once ≈8m40s but load-flaky there).
// Selecting any browser implies `stack`. A step whose prerequisite failed (build → stack → browsers) is "blocked".
//
// Not fail-fast by default. All test stacks stop at the end; screenshots use isolated artifact directories.
// Output (default artifacts/gates/<short sha>-<UTC timestamp>, git-ignored): <step>.log, per-shard logs,
// progress.log, summary.json (sha, dirty flag, tier, per-step status/rc/duration and summed test totals).
// Exit code: 0 only when every selected step passed.
import { execSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import testStackEnv from "./test-stack.cjs";
import { GROUPS, checkManifest, expandSteps, resolveGroups } from "./gate-groups.mjs";
import { DEFAULT_POOL_MAX, PG_MAX_CONNECTIONS, PG_RESERVED_CONNECTIONS, selectGateSteps, stackConnections, stackPoolMax } from "./gate-selection.mjs";

const BROWSERS = ["chromium", "firefox", "webkit"];
const ALL = ["lint", "typecheck", "evidence", "unit", "contract", "integration", "build", "stack", ...BROWSERS];
const STACK_TIMEOUT_MS = 180_000;
// Company-builder browser coverage requires its test feature flag. This process only launches isolated test stacks;
// never rely on the private development .env to decide which shipped feature the gate exercises.
process.env.FLOWLINE_COMPANY_BUILDER ??= "on";

// ---- options ----
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!m) {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
    return [m[1], m[2] ?? true];
  }),
);
for (const k of Object.keys(args)) {
  if (!["only", "skip", "out", "browsers", "fail-fast", "tier", "stacks", "shards", "group", "list-groups"].includes(k)) {
    console.error(`unknown option --${k}`);
    process.exit(2);
  }
}
const list = (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const manifestProblems = checkManifest();
if (manifestProblems.length) {
  console.error(`browser group manifest is inconsistent:\n  ${manifestProblems.join("\n  ")}`);
  process.exit(2);
}
if (args["list-groups"]) {
  for (const [name, g] of Object.entries(GROUPS)) console.log(`${name} (${g.specs.length} specs): ${g.description}\n  ${g.specs.join(", ")}`);
  process.exit(0);
}
// --group=a,b narrows the browser steps to those groups' spec files. Without --only it implies --only=chromium (the
// other projects run only when named, e.g. --only=chromium,firefox --group=auth).
let groupSel = null;
if (args.group !== undefined) {
  try {
    groupSel = resolveGroups(list(args.group));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
const only = expandSteps(list(args.only));
const skip = expandSteps(list(args.skip));
for (const n of [...only, ...skip]) {
  if (!ALL.includes(n)) {
    console.error(`unknown step "${n}" (steps: ${ALL.join(", ")}, static)`);
    process.exit(2);
  }
}
if (groupSel && only.length === 0) only.push("chromium");
if (groupSel && !only.some((n) => BROWSERS.includes(n))) {
  console.error("--group selects browser specs, but --only names no browser project (chromium, firefox, webkit)");
  process.exit(2);
}
const groupFilesList = groupSel?.files ?? [];
// The three projects at once need ~2 CPUs per browser container + stack: on 4 CPUs it was load-flaky (a 10 s wait timed
// out in 1 of 2 runs), so it is the default only from 8 CPUs; below that the projects run one after another (each still
// split across the stacks).
const browsersMode = args.browsers ?? (args.tier === "full" && availableParallelism() >= 8 ? "parallel" : "sequential");
if (!["sequential", "parallel"].includes(browsersMode)) {
  console.error("--browsers must be sequential or parallel");
  process.exit(2);
}
const failFast = args["fail-fast"] === true;
const tier = args.tier ?? "fast";
if (!["fast", "full"].includes(tier)) {
  console.error("--tier must be fast or full");
  process.exit(2);
}
const intNum = (v, d, max) => {
  if (v === undefined) return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    console.error(`expected an integer 1..${max}, got ${v}`);
    process.exit(2);
  }
  return n;
};
// K isolated stacks (own app/fake ports and database each) and N integration shards (own database each).
// Default: 3 stacks per project on a 4-CPU machine, more on bigger ones (each stack + browser container needs ~1 CPU).
// A group run never starts more stacks than it has spec files (a shard with no files would fail with "no tests found").
// Default ≤4 stacks: docker-compose.yml caps the test Postgres at max_connections=50; the pool size of every stack is
// derived from that budget below (stackPoolMax), for the total number of stacks of the tier, so 6 stacks never exhaust
// it again ("too many clients", GATE-03). --stacks=K still allows up to 6.
const STACKS = intNum(args.stacks, Math.min(4, Math.max(3, Math.floor(availableParallelism() / 2))), 6);
const BROWSER_STACKS = groupSel ? Math.min(STACKS, groupFilesList.length) : STACKS;
const INT_SHARDS = intNum(args.shards, 4, 16);
// Fast tier (every commit): Chromium's @critical/@cross-browser specs only. Full tier (before merging to main): every
// Chromium spec plus Firefox and WebKit. An explicit --only=firefox still runs Firefox in the fast tier.
const FAST_GREP = "@critical|@cross-browser";
let selection;
try {
  selection = selectGateSteps({ all: ALL, browsers: BROWSERS, only, skip, tier, browserStacks: BROWSER_STACKS, browsersMode });
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(2);
}
const { selected, parallelProjects, stackCount } = selection;
// Each stack holds two pools (next + worker) plus a LISTEN connection. The pool size comes from the connection budget
// for the TOTAL number of stacks of this tier (parallel full tier: Chromium K + Firefox ceil(K/2) + WebKit ceil(K/2)),
// so the sum stays under max_connections=50 (docker-compose.yml) with room for the integration shards and fixtures.
let POOL_MAX;
try {
  POOL_MAX = stackPoolMax(stackCount);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(2);
}

// ---- identity ----
const sh = (cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};
const sha = sh("git rev-parse HEAD") || "unknown";
const shortSha = sha.slice(0, 7);
const dirtyCount =sh("git status --porcelain").split("\n").filter(Boolean).length;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const out = typeof args.out === "string" ? args.out : join("artifacts", "gates", `${shortSha}-${stamp}`);
mkdirSync(out, { recursive: true });
const identity = { sha, shortSha, dirty: dirtyCount > 0, dirtyCount, node: process.version, pnpm: sh("pnpm --version") || "unknown" };
console.log(`gate: ${sha}${identity.dirty ? ` (dirty: ${dirtyCount} changed)` : ""} · node ${identity.node} · pnpm ${identity.pnpm}`);
const poolNote = `${stackCount} stack(s) in total, pool ${POOL_MAX ?? DEFAULT_POOL_MAX} → ≤${stackConnections(stackCount, POOL_MAX ?? DEFAULT_POOL_MAX)} of ${PG_MAX_CONNECTIONS - PG_RESERVED_CONNECTIONS} connections`;
console.log(`gate: tier ${tier} · steps ${[...selected].join(", ") || "(none)"} · ${BROWSER_STACKS} stack(s) per project (${poolNote}) · ${INT_SHARDS} integration shard(s) · browsers ${browsersMode} · out ${out}`);
if (groupSel) console.log(`gate: browser group(s) ${groupSel.groups.join(", ")} · ${groupFilesList.length} spec file(s): ${groupFilesList.join(" ")}`);

const progress = join(out, "progress.log");
const logLine = (s) => appendFileSync(progress, `${new Date().toISOString()} ${s}\n`);
logLine(`GATE sha=${sha} dirty=${dirtyCount} node=${identity.node} pnpm=${identity.pnpm} tier=${tier} stacks=${BROWSER_STACKS} totalStacks=${stackCount} poolMax=${POOL_MAX ?? DEFAULT_POOL_MAX} intShards=${INT_SHARDS} steps=${[...selected].join(",")} browsers=${browsersMode} groups=${groupSel?.groups.join(",") ?? "all"}`);

// Stack 1 is the default stack (3100/4010/4011, flowline_test); stack k>1 uses app 3100+10(k-1), fakes 4500+10(k-1)
// and +1, database flowline_test_e<k>.
// Sequential browsers share stacks 1..K. Parallel browsers get disjoint stacks per project so two projects never share a
// database or fake-provider state: Chromium (the largest, 128 specs) gets K, Firefox and WebKit (62 each) ceil(K/2) each.
const makeStack = (k) => {
  const env = k === 1 ? { FLOWLINE_TEST_SHARD: "1" } : { FLOWLINE_TEST_SHARD: String(k), FLOWLINE_TEST_PORT: String(3100 + 10 * (k - 1)), FLOWLINE_TEST_FAKE_PORT: String(4500 + 10 * (k - 1)), FLOWLINE_TEST_AI_PORT: String(4501 + 10 * (k - 1)), FLOWLINE_TEST_DB: `flowline_test_e${k}` };
  if (POOL_MAX !== null) env.FLOWLINE_DB_POOL_MAX = String(POOL_MAX);
  const base = { ...(existsSync(".env.test") ? parseEnv(readFileSync(".env.test", "utf8")) : {}), ...process.env, ...env };
  if (k === 1) for (const v of ["FLOWLINE_TEST_PORT", "FLOWLINE_TEST_FAKE_PORT", "FLOWLINE_TEST_AI_PORT", "FLOWLINE_TEST_DB"]) delete base[v];
  const st = testStackEnv.testStack(base);
  return { k, env, port: st.port, fakePort: st.fakePort, aiPort: st.aiPort, healthUrl: st.healthUrl };
};
const stackDefs = Array.from({ length: stackCount }, (_, i) => makeStack(i + 1));
const stacksFor = new Map();
if (parallelProjects.length > 1) {
  let next = 0;
  for (const b of parallelProjects) {
    const n = b === "chromium" ? BROWSER_STACKS : Math.ceil(BROWSER_STACKS / 2);
    stacksFor.set(b, stackDefs.slice(next, next + n));
    next += n;
  }
} else for (const b of BROWSERS) stacksFor.set(b, stackDefs);
const shellEnv = (env) => Object.entries(env).map(([k, v]) => `${k}=${v}`).join(" ");

// ---- env for the test-stack build: the same env scripts/dev-test.mjs gives `next build` (keep the two in sync) ----
// .env.test is parsed into a copy (not loaded into this process) so the other steps keep the caller's env.
const testEnv = () => {
  const env = { ...parseEnv(readFileSync(".env.test", "utf8")), ...process.env }; // like loadEnvFile: set vars win
  env.NEXT_DIST_DIR = ".next-test";
  testStackEnv.applyTestStackEnv(env); // ports, URLs, database: exactly as dev-test.mjs
  for (const k of ["FLOWLINE_AI_PROVIDER", "FLOWLINE_AI_MODEL", "OLLAMA_BASE_URL", "OLLAMA_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "OPENAI_API_KEY"]) delete env[k];
  return env;
};

// ---- running steps ----
const results = new Map(); // name -> { name, phase, status, rc, durationMs, log, totals, note }
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

const run = (name, phase, cmd, env = process.env) =>
  new Promise((resolve) => {
    const log = join(out, `${name}.log`);
    const fd = openSync(log, "w");
    writeFileSync(fd, `$ ${cmd}\n`);
    const t0 = Date.now();
    logLine(`START ${name}`);
    console.log(`▶ ${name}`);
    const child = spawn(cmd, { shell: true, env, stdio: ["ignore", fd, fd] });
    const done = (rc) => {
      closeSync(fd);
      const durationMs = Date.now() - t0;
      const r = { name, phase, status: rc === 0 ? "pass" : "fail", rc, durationMs, log, totals: parseTotals(name, log) };
      results.set(name, r);
      logLine(`END ${name} rc=${rc} ${(durationMs / 1000).toFixed(1)}s`);
      console.log(`${rc === 0 ? "✓" : "✗"} ${name} rc=${rc} ${(durationMs / 1000).toFixed(1)}s`);
      resolve(r);
    };
    child.on("error", () => done(127));
    child.on("exit", (code, signal) => done(code ?? (signal ? 128 : 1)));
  });

const mark = (name, phase, status, note) => {
  results.set(name, { name, phase, status, rc: null, durationMs: 0, log: null, totals: null, note });
  logLine(`${status.toUpperCase()} ${name}: ${note}`);
  console.log(`- ${name} ${status}: ${note}`);
};

const readText = (f) => {
  try {
    return readFileSync(f, "utf8").replace(ANSI, "");
  } catch {
    return "";
  }
};
// vitest: "Tests  3 failed | 120 passed | 2 skipped (125)"; playwright line reporter: "  12 passed (3.4m)", "  1 flaky".
function parseTotals(name, log) {
  if (["unit", "contract"].includes(name)) {
    const line = readText(log).match(/^\s*Tests\s+(.+)$/m)?.[1];
    if (!line) return null;
    const t = {};
    for (const m of line.matchAll(/(\d+) (passed|failed|skipped|todo)/g)) t[m[2]] = Number(m[1]);
    return t;
  }
  if (BROWSERS.includes(name)) {
    const t = {};
    for (const d of stacksFor.get(name) ?? []) {
      const report = `test-results/${name}-${d.k}-report.txt`;
      for (const m of readText(report).matchAll(/^\s*(\d+) (passed|failed|flaky|skipped|interrupted|did not run)\b/gm)) t[m[2]] = (t[m[2]] ?? 0) + Number(m[1]);
    }
    return Object.keys(t).length ? t : null;
  }
  if (name === "integration") {
    const line = readText(log).match(/TOTAL tests: (.+?);/)?.[1];
    if (!line) return null;
    const t = {};
    for (const m of line.matchAll(/(\d+) (passed|failed|skipped)/g)) t[m[2]] = Number(m[1]);
    return t;
  }
  return null;
}

const phaseFailed = (names) => names.some((n) => results.get(n)?.status === "fail");
const stopFailFast = (phase, names) => {
  if (!failFast || !phaseFailed(names)) return false;
  for (const n of ALL) if (selected.has(n) && !results.has(n)) mark(n, phase + 1, "skipped", "--fail-fast after a failure");
  return true;
};
// Non-default stacks first (each frees only its own ports/processes), the default stack last (its stop sweeps).
const stopStack = () => {
  logLine("STOP test stacks");
  for (const d of stackDefs.slice(1)) sh(`node scripts/stop-test-stack.mjs --port=${d.port} --fake-port=${d.fakePort} --ai-port=${d.aiPort}`);
  sh("pnpm stop:test");
};

const stackProcs = [];
// Starts every stack on this run's build (dev-test creates and migrates each stack's database) and waits until all are
// healthy. One step ("stack") for all of them; each stack logs to stack-<k>.log.
async function startStacks() {
  const name = "stack";
  const log = join(out, `${name}.log`);
  const t0 = Date.now();
  logLine(`START ${name}`);
  console.log(`▶ ${name} (${stackDefs.length})`);
  const reuse = results.get("build")?.status === "pass";
  writeFileSync(log, `${stackDefs.length} stack(s), ${reuse ? "reusing this run's build" : "dev-test builds"}\n`);
  const fail = (rc, why) => {
    appendFileSync(log, `\n[gate] ${why}\n`);
    const r = { name, phase: 3, status: "fail", rc, durationMs: Date.now() - t0, log, totals: null, note: why };
    results.set(name, r);
    logLine(`END ${name} rc=${rc} ${(r.durationMs / 1000).toFixed(1)}s (${why})`);
    console.log(`✗ ${name} rc=${rc}: ${why}`);
    return r;
  };
  if (!reuse && stackDefs.length > 1) return fail(1, "several stacks need this run's build (next build must not run twice at once)");
  const exited = new Map();
  for (const d of stackDefs) {
    const env = { ...process.env, ...d.env, FLOWLINE_TEST_NEXT: "start", ...(reuse ? { FLOWLINE_TEST_SKIP_BUILD: "1" } : {}) };
    if (d.k === 1) for (const v of ["FLOWLINE_TEST_PORT", "FLOWLINE_TEST_FAKE_PORT", "FLOWLINE_TEST_AI_PORT", "FLOWLINE_TEST_DB"]) delete env[v];
    appendFileSync(log, `stack ${d.k}: app :${d.port}, fakes :${d.fakePort}/:${d.aiPort}, ${d.env.FLOWLINE_TEST_DB ?? "flowline_test"}\n`);
    const fd = openSync(join(out, `stack-${d.k}.log`), "w");
    // Own process group so the whole tree (shell, next, worker, fakes) can be signalled at the end.
    const p = spawn("node scripts/dev-test.mjs", { shell: true, env, detached: true, stdio: ["ignore", fd, fd] });
    closeSync(fd);
    p.on("exit", (code) => exited.set(d.k, code ?? 1));
    stackProcs.push(p);
  }
  const deadline = Date.now() + STACK_TIMEOUT_MS + (reuse ? 0 : 600_000); // a fresh build takes longer
  const healthy = new Set();
  while (Date.now() < deadline) {
    for (const [k, code] of exited) if (!healthy.has(k)) return fail(code, `stack ${k} exited (rc=${code}) before it was healthy (stack-${k}.log)`);
    for (const d of stackDefs) {
      if (healthy.has(d.k)) continue;
      try {
        if ((await fetch(d.healthUrl, { signal: AbortSignal.timeout(5000) })).ok) healthy.add(d.k);
      } catch {
        /* not up yet */
      }
    }
    if (healthy.size === stackDefs.length) {
      const r = { name, phase: 3, status: "pass", rc: 0, durationMs: Date.now() - t0, log, totals: null, note: `${stackDefs.length} stack(s)${reuse ? " on this run's build" : ""}` };
      results.set(name, r);
      logLine(`END ${name} rc=0 ${(r.durationMs / 1000).toFixed(1)}s`);
      console.log(`✓ ${name} ${stackDefs.length} healthy ${(r.durationMs / 1000).toFixed(1)}s`);
      return r;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return fail(124, `not every stack was healthy within the deadline (${stackDefs.filter((d) => !healthy.has(d.k)).map((d) => d.port).join(", ")})`);
}

const cleanup = () => {
  for (const p of stackProcs) {
    if (!p.pid || p.exitCode !== null) continue;
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else process.kill(-p.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  if (selected.has("stack") || selected.has("integration") || selected.has("build")) stopStack();
};
let interrupted = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (interrupted) return;
    interrupted = true;
    console.log(`\ngate: ${sig}, stopping the test stack`);
    logLine(`INTERRUPTED ${sig}`);
    cleanup();
    process.exit(130);
  });
}

// ---- phases ----
const startedAt = new Date().toISOString();
const sel = (names) => names.filter((n) => selected.has(n));

main: {
  // Phase 1: static checks + DB-free suites.
  const p1 = sel(["lint", "typecheck", "evidence", "unit", "contract"]);
  const cmd1 = { lint: "pnpm lint", typecheck: "pnpm typecheck", evidence: "pnpm check:evidence", unit: "pnpm test", contract: "pnpm test:contract" };
  await Promise.all(p1.map((n) => run(n, 1, cmd1[n])));
  if (stopFailFast(1, p1)) break main;

  // Phase 2: integration, sharded over its own databases (flowline_test_s<i>), beside the stacks' production build and
  // then the stacks themselves (flowline_test / flowline_test_e<k>). No step shares a database or a port with another.
  const p2 = sel(["integration", "build"]);
  if (p2.length || selected.has("stack")) stopStack();
  const integration = selected.has("integration") ? run("integration", 2, `node scripts/test-integration-sharded.mjs --shards=${INT_SHARDS} --log-dir=${join(out, "integration")}`) : null;
  const buildAndStacks = (async () => {
    if (selected.has("build")) await run("build", 2, "npx next build", testEnv());
    if (stopFailFast(2, sel(["build"]))) return;
    if (selected.has("stack")) {
      if (results.get("build")?.status === "fail") mark("stack", 3, "blocked", "build failed");
      else await startStacks();
    }
  })();
  // Integration and the browsers could share the machine (no database or port in common), but on a 4-CPU machine the
  // overlap pushed a browser wait past its timeout; the browsers start after integration so results stay reliable.
  await Promise.all([integration, buildAndStacks]);
  if (stopFailFast(3, sel(["integration", "build", "stack"]))) break main;

  // Phase 3: browsers. Each project runs as one Playwright shard per stack, all shards at once (--shard=k/K).
  const p4 = sel(BROWSERS);
  if (p4.length) {
    const stack = results.get("stack");
    if (stack && stack.status !== "pass") {
      for (const b of p4) mark(b, 4, "blocked", "test stacks did not start");
    } else if (!existsSync("e2e/tools/browser-docker.sh")) {
      for (const b of p4) mark(b, 4, "blocked", "e2e/tools/browser-docker.sh not found");
    } else {
      const runBrowser = (b) => {
        // A group run executes every test in the group's concrete files (no grep); otherwise the tier decides as before.
        const grep = groupSel ? ` ${groupFilesList.join(" ")}` : tier === "fast" && b === "chromium" ? ` --grep="${FAST_GREP}"` : "";
        const mine = stacksFor.get(b);
        // Cloud Docker mounts cannot use Windows pnpm symlinks. Run the installed native
        // Playwright browsers here; keep identical projects, shards, reporters and zero retries.
        if (process.platform === "win32") {
          return run(b, 4, `node scripts/gate-browser-native.mjs ${b}${grep}`, {
            ...process.env,
            FLOWLINE_GATE_STACKS: JSON.stringify(mine),
            FLOWLINE_GATE_OUT: out,
          });
        }
        const parts = mine.map((d, i) => {
          rmSync(`test-results/${b}-${d.k}-report.txt`, { force: true }); // never parse a previous run's totals
          const shotDir = `/tmp/pw-shots-${b}-${d.k}`; // keep the committed screenshots untouched; shards never share a dir
          return `(${shellEnv(d.env)} E2E_SCREENSHOT_DIR=${shotDir} bash e2e/tools/browser-docker.sh ${b}${grep} --shard=${i + 1}/${mine.length} > ${join(out, `${b}-${d.k}.log`)} 2>&1) & p${d.k}=$!`;
        });
        const waits = mine.map((d) => `wait $p${d.k} || rc=1`).join("; ");
        return run(b, 4, `rc=0; ${parts.join("; ")}; ${waits}; exit $rc`);
      };
      if (browsersMode === "parallel") await Promise.all(p4.map(runBrowser));
      else for (const b of p4) await runBrowser(b);
      // Both browser runners isolate screenshots; never reset tracked files during verification.
    }
  }
}

cleanup();

// ---- report ----
const steps = ALL.filter((n) => results.has(n)).map((n) => results.get(n));
const ok = steps.length > 0 && steps.every((s) => s.status === "pass");
const finishedAt = new Date().toISOString();
writeFileSync(
  join(out, "summary.json"),
  `${JSON.stringify({ ...identity, tier, group: groupSel ? { groups: groupSel.groups, files: groupFilesList } : null, stacks: BROWSER_STACKS, totalStacks: stackCount, poolMax: POOL_MAX ?? DEFAULT_POOL_MAX, integrationShards: INT_SHARDS, startedAt, finishedAt, browsersMode, failFast, out, ok, steps }, null, 2)}\n`,
);
logLine(`GATE ${ok ? "PASS" : "FAIL"}`);

const fmtTotals = (t) => (t ? Object.entries(t).map(([k, v]) => `${v} ${k}`).join(", ") : "");
const rows = steps.map((s) => [s.name, s.status, s.rc ?? "-", s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : "-", [fmtTotals(s.totals) || s.note || "", groupSel && BROWSERS.includes(s.name) ? `[group ${groupSel.groups.join("+")}: ${groupFilesList.length} files]` : ""].filter(Boolean).join(" ")]);
const head = ["step", "status", "rc", "time", "totals"];
const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
const fmt = (r) => r.map((c, i) => String(c).padEnd(w[i])).join("  ").trimEnd();
console.log(`\n${fmt(head)}\n${w.map((n) => "-".repeat(n)).join("  ")}`);
for (const r of rows) console.log(fmt(r));
console.log(`\ngate ${ok ? "PASSED" : "FAILED"} · ${sha.slice(0, 7)}${identity.dirty ? " (dirty)" : ""} · ${out}/summary.json`);
process.exit(ok ? 0 : 1);
