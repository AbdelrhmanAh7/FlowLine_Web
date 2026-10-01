// Fast gate runner: the full pre-commit gate (AGENTS.md "Gates before commit") with only the SAFE parts run in parallel.
//
//   pnpm gate [--only=a,b] [--skip=a,b] [--out=<dir>] [--browsers=sequential|parallel] [--fail-fast]
//
// Steps (names for --only/--skip), by phase:
//   1. lint, typecheck, evidence, unit, contract — in parallel. None of them touch the flowline_test DB or a fixed port:
//      contract tests start the fake provider on an ephemeral port (tests/contract/helpers.ts) and use no DB; the
//      :3100/:4010 strings in some of them are only expected URL values.
//   2. integration + build — in parallel, after `pnpm stop:test` (integration refuses to run beside a test-stack worker).
//      `build` is the test stack's production build (`next build` into .next-test with .env.test's env). It does not
//      seed or migrate the DB; integration owns flowline_test during this phase.
//   3. stack — `pnpm db:migrate:test`, then scripts/dev-test.mjs with FLOWLINE_TEST_NEXT=start, reusing this run's build
//      (FLOWLINE_TEST_SKIP_BUILD=1, only when `build` passed in this run; otherwise dev-test builds). Waits for
//      /api/health?require=worker. Started only after integration has finished (the stack's worker would claim its runs).
//   4. chromium, firefox, webkit — `bash e2e/tools/browser-docker.sh <project>` against that stack.
//      --browsers=sequential (default) runs chromium → firefox → webkit, as the repo requires today.
//      --browsers=parallel runs the three projects at once against the one stack. OPT-IN until proven stable: the specs
//      share the stack's fake-provider state (:4010/:4011) and the test DB, and Playwright's config assumes one run
//      (fullyParallel: false).
// Selecting any browser implies `stack` unless it is skipped explicitly (--skip=stack: use a stack that is already up).
// A step whose prerequisite failed (build → stack → browsers) is reported as "blocked", not run.
//
// Not fail-fast by default: every selected step runs and all results are reported; --fail-fast stops after the first
// phase with a failure. The test stack is always stopped at the end (`pnpm stop:test`), and artifacts/phase-3/screenshots
// is restored (`git checkout`) after browser runs.
//
// Output (default artifacts/gates/<short sha>-<UTC timestamp>): <step>.log per step, progress.log (UTC start/end/rc per
// step), summary.json (sha, dirty flag, node/pnpm versions, per-step status/rc/duration and parsed test totals).
// Exit code: 0 only when every selected step passed.
import { execSync, spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

const BROWSERS = ["chromium", "firefox", "webkit"];
const ALL = ["lint", "typecheck", "evidence", "unit", "contract", "integration", "build", "stack", ...BROWSERS];
const STACK_URL = "http://localhost:3100/api/health?require=worker";
const STACK_TIMEOUT_MS = 180_000;

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
  if (!["only", "skip", "out", "browsers", "fail-fast"].includes(k)) {
    console.error(`unknown option --${k}`);
    process.exit(2);
  }
}
const list = (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const only = list(args.only);
const skip = list(args.skip);
for (const n of [...only, ...skip]) {
  if (!ALL.includes(n)) {
    console.error(`unknown step "${n}" (steps: ${ALL.join(", ")})`);
    process.exit(2);
  }
}
const browsersMode = args.browsers ?? "sequential";
if (!["sequential", "parallel"].includes(browsersMode)) {
  console.error("--browsers must be sequential or parallel");
  process.exit(2);
}
const failFast = args["fail-fast"] === true;
const selected = new Set(ALL.filter((n) => (only.length === 0 || only.includes(n)) && !skip.includes(n)));
if (BROWSERS.some((b) => selected.has(b)) && !skip.includes("stack")) selected.add("stack");

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
const dirtyCount = sh("git status --porcelain").split("\n").filter(Boolean).length;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const out = typeof args.out === "string" ? args.out : join("artifacts", "gates", `${shortSha}-${stamp}`);
mkdirSync(out, { recursive: true });
const identity = { sha, shortSha, dirty: dirtyCount > 0, dirtyCount, node: process.version, pnpm: sh("pnpm --version") || "unknown" };
console.log(`gate: ${sha}${identity.dirty ? ` (dirty: ${dirtyCount} changed)` : ""} · node ${identity.node} · pnpm ${identity.pnpm}`);
console.log(`gate: steps ${[...selected].join(", ") || "(none)"} · browsers ${browsersMode} · out ${out}`);

const progress = join(out, "progress.log");
const logLine = (s) => appendFileSync(progress, `${new Date().toISOString()} ${s}\n`);
logLine(`GATE sha=${sha} dirty=${dirtyCount} node=${identity.node} pnpm=${identity.pnpm} steps=${[...selected].join(",")} browsers=${browsersMode}`);

// ---- env for the test-stack build: the same env scripts/dev-test.mjs gives `next build` (keep the two in sync) ----
// .env.test is parsed into a copy (not loaded into this process) so the other steps keep the caller's env.
const testEnv = () => {
  const env = { ...parseEnv(readFileSync(".env.test", "utf8")), ...process.env }; // like loadEnvFile: set vars win
  env.NEXT_DIST_DIR = ".next-test";
  env.FLOWLINE_AI_TEST_OVERRIDE ??= "http://127.0.0.1:4011";
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
  if (["unit", "contract", "integration"].includes(name)) {
    const line = readText(log).match(/^\s*Tests\s+(.+)$/m)?.[1];
    if (!line) return null;
    const t = {};
    for (const m of line.matchAll(/(\d+) (passed|failed|skipped|todo)/g)) t[m[2]] = Number(m[1]);
    return t;
  }
  if (BROWSERS.includes(name)) {
    const report = existsSync(`test-results/${name}-report.txt`) ? `test-results/${name}-report.txt` : log;
    const t = {};
    for (const m of readText(report).matchAll(/^\s*(\d+) (passed|failed|flaky|skipped|interrupted|did not run)\b/gm)) t[m[2]] = Number(m[1]);
    return Object.keys(t).length ? t : null;
  }
  return null;
}

const phaseFailed = (names) => names.some((n) => results.get(n)?.status === "fail");
const stopFailFast = (phase, names) => {
  if (!failFast || !phaseFailed(names)) return false;
  for (const n of ALL) if (selected.has(n) && !results.has(n)) mark(n, phase + 1, "skipped", "--fail-fast after a failure");
  return true;
};
const stopStack = () => {
  logLine("STOP test stack");
  sh("pnpm stop:test");
};

let stackProc = null;
async function startStack() {
  const name = "stack";
  const log = join(out, `${name}.log`);
  const t0 = Date.now();
  logLine(`START ${name}`);
  console.log(`▶ ${name}`);
  const fail = (rc, why) => {
    appendFileSync(log, `\n[gate] ${why}\n`);
    const r = { name, phase: 3, status: "fail", rc, durationMs: Date.now() - t0, log, totals: null, note: why };
    results.set(name, r);
    logLine(`END ${name} rc=${rc} ${(r.durationMs / 1000).toFixed(1)}s (${why})`);
    console.log(`✗ ${name} rc=${rc}: ${why}`);
    return r;
  };
  writeFileSync(log, "$ pnpm db:migrate:test\n");
  const migrate = await new Promise((resolve) => {
    const fd = openSync(log, "a");
    const c = spawn("pnpm db:migrate:test", { shell: true, stdio: ["ignore", fd, fd] });
    c.on("error", () => (closeSync(fd), resolve(127)));
    c.on("exit", (code) => (closeSync(fd), resolve(code ?? 1)));
  });
  if (migrate !== 0) return fail(migrate, "db:migrate:test failed");

  const reuse = results.get("build")?.status === "pass";
  const env = { ...process.env, FLOWLINE_TEST_NEXT: "start", ...(reuse ? { FLOWLINE_TEST_SKIP_BUILD: "1" } : {}) };
  appendFileSync(log, `$ FLOWLINE_TEST_NEXT=start${reuse ? " FLOWLINE_TEST_SKIP_BUILD=1" : ""} node scripts/dev-test.mjs\n`);
  const fd = openSync(log, "a");
  // Own process group so the whole tree (shell, next, worker, fakes) can be signalled at the end.
  stackProc = spawn("node scripts/dev-test.mjs", { shell: true, env, detached: true, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  let exited = null;
  stackProc.on("exit", (code) => (exited = code ?? 1));
  const deadline = Date.now() + STACK_TIMEOUT_MS + (reuse ? 0 : 600_000); // a fresh build takes longer
  while (Date.now() < deadline) {
    if (exited !== null) return fail(exited, `dev-test exited (rc=${exited}) before the stack was healthy`);
    try {
      const res = await fetch(STACK_URL, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const r = { name, phase: 3, status: "pass", rc: 0, durationMs: Date.now() - t0, log, totals: null, note: reuse ? "reused this run's build" : "dev-test built" };
        results.set(name, r);
        logLine(`END ${name} rc=0 ${(r.durationMs / 1000).toFixed(1)}s`);
        console.log(`✓ ${name} healthy ${(r.durationMs / 1000).toFixed(1)}s`);
        return r;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return fail(124, `stack not healthy at ${STACK_URL} within the deadline`);
}

const cleanup = () => {
  if (stackProc?.pid && stackProc.exitCode === null) {
    try {
      process.kill(-stackProc.pid, "SIGTERM");
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

  // Phase 2: integration (owns flowline_test) beside the stack's production build (no DB).
  const p2 = sel(["integration", "build"]);
  if (p2.length || selected.has("stack")) stopStack();
  await Promise.all(
    p2.map((n) => (n === "integration" ? run(n, 2, "pnpm test:integration") : run(n, 2, "npx next build", testEnv()))),
  );
  if (stopFailFast(2, p2)) break main;

  // Phase 3: the stack, once integration is done.
  if (selected.has("stack")) {
    if (results.get("build")?.status === "fail") mark("stack", 3, "blocked", "build failed");
    else await startStack();
  }
  if (stopFailFast(3, sel(["stack"]))) break main;

  // Phase 4: browsers.
  const p4 = sel(BROWSERS);
  if (p4.length) {
    const stack = results.get("stack");
    if (stack && stack.status !== "pass") {
      for (const b of p4) mark(b, 4, "blocked", "test stack did not start");
    } else if (!existsSync("e2e/tools/browser-docker.sh")) {
      for (const b of p4) mark(b, 4, "blocked", "e2e/tools/browser-docker.sh not found");
    } else {
      const runBrowser = (b) => {
        rmSync(`test-results/${b}-report.txt`, { force: true }); // never parse a previous run's totals
        return run(b, 4, `bash e2e/tools/browser-docker.sh ${b}`);
      };
      if (browsersMode === "parallel") await Promise.all(p4.map(runBrowser));
      else for (const b of p4) await runBrowser(b);
      // e2e/responsive.spec.ts rewrites the committed screenshots; the gate must leave the tree as it found it.
      sh("git checkout -- artifacts/phase-3/screenshots");
      logLine("RESTORED artifacts/phase-3/screenshots");
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
  `${JSON.stringify({ ...identity, startedAt, finishedAt, browsersMode, failFast, out, ok, steps }, null, 2)}\n`,
);
logLine(`GATE ${ok ? "PASS" : "FAIL"}`);

const fmtTotals = (t) => (t ? Object.entries(t).map(([k, v]) => `${v} ${k}`).join(", ") : "");
const rows = steps.map((s) => [s.name, s.status, s.rc ?? "-", s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : "-", fmtTotals(s.totals) || s.note || ""]);
const head = ["step", "status", "rc", "time", "totals"];
const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
const fmt = (r) => r.map((c, i) => String(c).padEnd(w[i])).join("  ").trimEnd();
console.log(`\n${fmt(head)}\n${w.map((n) => "-".repeat(n)).join("  ")}`);
for (const r of rows) console.log(fmt(r));
console.log(`\ngate ${ok ? "PASSED" : "FAILED"} · ${sha.slice(0, 7)}${identity.dirty ? " (dirty)" : ""} · ${out}/summary.json`);
process.exit(ok ? 0 : 1);
