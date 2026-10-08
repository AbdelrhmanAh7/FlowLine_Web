#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { resolveIntegrationBaseEnv } from "../test-integration-env.mjs";

// One integration shard of the Gate on a CI runner (.github/workflows/gate.yml, the `checks` legs `integration k/N`):
//
//   node scripts/ci/integration-shard.mjs --shard=k/N --out=<dir> [--tier=fast|full]
//
// Runs `vitest run --project integration --no-cache --shard=k/N` against the runner's own PostgreSQL (.env.test; values
// already set in the shell win, as in scripts/with-env.mjs) and writes into <dir> what `pnpm gate` writes for its steps,
// so the shared .github/actions/gate-report action renders and uploads a shard exactly like any other gate job:
//   summary.json              the Gate summary (identity, tier, ok, steps[]) of THIS shard; it names the shard (`shard: "k/N"`),
//                             which gate-report checks against the shard the workflow expects, so one leg's report is never
//                             read as another's. It is written as an unfinished report ("incomplete", ok:false) before vitest
//                             starts and replaced when the shard ends: a shard that is killed, cancelled or timed out leaves an
//                             explicit failed report, never a missing one that could be mistaken for a pass.
//   integration-<k>of<N>.log  the complete vitest output (stdout and stderr), also echoed to the job log
//   progress.log              START / END / GATE lines with timestamps
// Exit code: 0 only when vitest exited 0 and printed a test summary without failures; 2 for a usage or setup error (which
// also leaves a failed summary.json when --shard and --out were usable).
// Static, unit and contract reporting stays with `pnpm gate --only=static,unit,contract`; this script never runs those.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const MAX_SHARDS = 16; // the same bound as scripts/gate.mjs --shards

/** "1/3" -> { index: 1, total: 3, label: "1/3", slug: "1of3" } (the slug is safe in file and artifact names). Anything else throws. */
export function parseShard(value) {
  const match = /^([1-9]\d?)\/([1-9]\d?)$/.exec(String(value ?? ""));
  const index = match ? Number(match[1]) : 0;
  const total = match ? Number(match[2]) : 0;
  if (!match || index > total || total > MAX_SHARDS) {
    throw new Error(`--shard must look like k/N with 1 <= k <= N <= ${MAX_SHARDS} (got ${JSON.stringify(value ?? null)})`);
  }
  return { index, total, label: `${index}/${total}`, slug: `${index}of${total}` };
}

/** vitest prints "Tests  3 failed | 120 passed | 2 skipped (125)"; null when the output has no such line. */
export function parseVitestTotals(output) {
  const line = output.replace(ANSI, "").match(/^\s*Tests\s+(.+)$/m)?.[1];
  if (!line) return null;
  const totals = {};
  for (const match of line.matchAll(/(\d+) (passed|failed|skipped|todo)/g)) totals[match[2]] = Number(match[1]);
  return totals;
}

/** A shard passes only when vitest exited 0 AND printed a test summary without failures: no summary is not a pass. */
export const shardStatus = (rc, totals) => (rc === 0 && totals !== null && (totals.failed ?? 0) === 0 ? "pass" : "fail");

/** The Gate summary of one shard, in the shape scripts/gate.mjs writes (the gate-report action reads sha, ok, steps[] and shard). */
export function shardSummary({ identity, tier, shard, out, startedAt, finishedAt, step }) {
  return {
    ...identity, tier, shard: shard.label, group: null, integrationShards: shard.total,
    startedAt, finishedAt, failFast: false, out, ok: step.status === "pass", steps: [step],
  };
}

const sh = (cmd, cwd) => {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

/** The identity block of every gate summary (same fields as scripts/gate.mjs). */
export function gateIdentity(cwd = ROOT) {
  const sha = sh("git rev-parse HEAD", cwd) || "unknown";
  const dirtyCount = sh("git status --porcelain", cwd).split("\n").filter(Boolean).length;
  return { sha, shortSha: sha.slice(0, 7), dirty: dirtyCount > 0, dirtyCount, node: process.version, pnpm: sh("pnpm --version", cwd) || "unknown" };
}

const writeSummary = (out, summary) => writeFileSync(join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
const progressLine = (out, text) => appendFileSync(join(out, "progress.log"), `${new Date().toISOString()} ${text}\n`);
const incompleteNote = "started, no result yet: the shard was killed, cancelled or timed out before it finished";

/**
 * Starts the shard: writes the unfinished summary, runs `command args` (vitest in CI), tees its output to the job log and to
 * <out>/integration-<k>of<N>.log, then replaces the summary with the result. `done` resolves with { summary, rc } and never
 * rejects; `child` lets the caller forward signals.
 */
export function startShard({ shard, out, tier = "fast", command, args, env = process.env, cwd = ROOT, identity = gateIdentity(cwd), echo = true }) {
  mkdirSync(out, { recursive: true });
  const name = `integration ${shard.label}`;
  const log = join(out, `integration-${shard.slug}.log`);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const report = (finishedAt, step) => shardSummary({ identity, tier, shard, out, startedAt, finishedAt, step });
  writeSummary(out, report(null, { name, phase: 2, status: "incomplete", rc: null, durationMs: 0, log, totals: null, note: incompleteNote }));
  progressLine(out, `GATE sha=${identity.sha} tier=${tier} node=${identity.node} pnpm=${identity.pnpm} integration shard=${shard.label}`);
  progressLine(out, `START ${name}`);
  console.log(`▶ ${name}`);

  const fd = openSync(log, "w");
  writeSync(fd, `$ ${[command, ...args].join(" ")}\n`);
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const tee = (stream, sink) => stream.on("data", (chunk) => {
    writeSync(fd, chunk);
    if (echo) sink.write(chunk);
  });
  tee(child.stdout, process.stdout);
  tee(child.stderr, process.stderr);

  const done = new Promise((resolveDone) => {
    let finished = false;
    const finish = (rc, note) => {
      if (finished) return;
      finished = true;
      if (note) writeSync(fd, `\n[shard] ${note}\n`);
      closeSync(fd);
      const durationMs = Date.now() - t0;
      const totals = parseVitestTotals(readFileSync(log, "utf8"));
      const status = shardStatus(rc, totals);
      const detail = note ?? (totals !== null ? undefined : rc === 0
        ? "vitest exited 0 but printed no test summary, so the shard is not counted as a pass"
        : `vitest printed no test summary: it stopped before running tests (global setup or a crash), see ${log}`);
      const step = { name, phase: 2, status, rc, durationMs, log, totals, ...(detail ? { note: detail } : {}) };
      const summary = report(new Date().toISOString(), step);
      writeSummary(out, summary);
      progressLine(out, `END ${name} rc=${rc} ${(durationMs / 1000).toFixed(1)}s`);
      progressLine(out, `GATE ${summary.ok ? "PASS" : "FAIL"}`);
      const counts = totals ? Object.entries(totals).map(([k, v]) => `${v} ${k}`).join(", ") : "no test summary";
      console.log(`${summary.ok ? "✓" : "✗"} ${name} rc=${rc} ${(durationMs / 1000).toFixed(1)}s · ${counts} · ${join(out, "summary.json")}`);
      resolveDone({ summary, rc: summary.ok ? 0 : 1 });
    };
    child.on("error", (error) => finish(127, `could not start the shard command: ${error.message}`));
    child.on("close", (code, signal) => finish(code ?? (signal ? 128 : 1), signal ? `killed by ${signal}` : undefined));
  });
  return { child, done };
}

/** A usable --shard and --out but a broken setup (missing .env.test, a database that is not a test database): leave a failed report, not a missing one. */
export function failSetup({ shard, out, tier = "fast", message, identity = gateIdentity() }) {
  mkdirSync(out, { recursive: true });
  const now = new Date().toISOString();
  const step = { name: `integration ${shard.label}`, phase: 2, status: "fail", rc: 2, durationMs: 0, log: null, totals: null, note: `setup failed: ${message}` };
  const summary = shardSummary({ identity, tier, shard, out, startedAt: now, finishedAt: now, step });
  writeSummary(out, summary);
  progressLine(out, `GATE FAIL setup: ${message}`);
  return summary;
}

const oneLine = (text) => String(text).replace(/[\r\n]+/g, " ");

async function main(argv) {
  const known = ["shard", "out", "tier"];
  const options = {};
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (!match || !known.includes(match[1])) throw new Error(`unknown argument ${JSON.stringify(arg)} (usage: --shard=k/N --out=<dir> [--tier=fast|full])`);
    options[match[1]] = match[2];
  }
  const shard = parseShard(options.shard);
  if (!options.out) throw new Error("--out=<dir> is required");
  const tier = options.tier ?? process.env.GATE_TIER ?? "fast";
  if (!["fast", "full"].includes(tier)) throw new Error(`--tier must be fast or full (got ${JSON.stringify(tier)})`);

  let env;
  try {
    // Only the children's env is built from .env.test; the shard database must be a test database (flowline_test or flowline_test_<suffix>).
    env = resolveIntegrationBaseEnv(parseEnv(readFileSync(join(ROOT, ".env.test"), "utf8")), process.env);
  } catch (error) {
    const message = error?.code === "ENOENT" ? ".env.test not found" : oneLine(error.message);
    failSetup({ shard, out: options.out, tier, message });
    console.error(`::error::Integration shard ${shard.label} setup failed: ${message}`);
    process.exitCode = 2;
    return;
  }
  const vitest = join(ROOT, "node_modules", "vitest", "vitest.mjs");
  const { child, done } = startShard({ shard, out: options.out, tier, command: process.execPath, args: [vitest, "run", "--project", "integration", `--shard=${shard.label}`, "--no-cache"], env });
  // A cancelled or timed-out job signals this process: stop vitest and still write the (failed) summary.
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  process.exitCode = (await done).rc;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    // One line only: an error message must never be able to start a second workflow command.
    console.error(`::error::Integration shard failed: ${oneLine(error.message)}`);
    process.exitCode = 2;
  });
}
