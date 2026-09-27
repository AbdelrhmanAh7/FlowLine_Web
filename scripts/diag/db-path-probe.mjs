#!/usr/bin/env node
/**
 * P3-15 evidence: probes the dev/test PostgreSQL once per second over BOTH host paths that "localhost:5433" can take
 * on this Windows + WSL2 + Docker Desktop host, and logs every failure and a per-minute summary (JSONL).
 *   ::1:5433       → wslrelay.exe → WSL VM → Docker proxy → postgres   (what Node picks first for "localhost")
 *   127.0.0.1:5433 → com.docker.backend.exe → postgres
 *   docker exec    → inside the container (no host networking at all)
 *   node scripts/diag/db-path-probe.mjs --minutes 120 --out artifacts/phase-3/p3-15/probe.jsonl
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import pg from "pg";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const minutes = Number(arg("minutes", "120"));
const out = arg("out", "artifacts/phase-3/p3-15/probe.jsonl");
const m = readFileSync(".env.test", "utf8").match(/DATABASE_URL=postgres:\/\/([^:]+):([^@]+)@[^/]+\/(\S+)/);
const [, user, password, database] = m;
const log = (o) => appendFileSync(out, JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n");
async function viaTcp(host) {
  const c = new pg.Client({ host, port: 5433, user, password, database, connectionTimeoutMillis: 3000, query_timeout: 3000 });
  const t = Date.now();
  try {
    await c.connect();
    await c.query("select 1");
    return { ok: true, ms: Date.now() - t };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, code: e.code ?? null, error: String(e.message).slice(0, 120) };
  } finally {
    c.end().catch(() => {});
  }
}
function viaExec() {
  const t = Date.now();
  const r = spawnSync("docker", ["exec", "flowline-db-1", "pg_isready", "-U", user, "-h", "127.0.0.1"], { timeout: 5000 });
  return { ok: r.status === 0, ms: Date.now() - t, code: r.status };
}
log({ event: "start", minutes, paths: ["::1", "127.0.0.1", "docker-exec"] });
const end = Date.now() + minutes * 60_000;
let win = { n: 0, fail: { "::1": 0, "127.0.0.1": 0, exec: 0 }, maxMs: { "::1": 0, "127.0.0.1": 0 } };
let lastSummary = Date.now();
while (Date.now() < end) {
  const [a, b] = await Promise.all([viaTcp("::1"), viaTcp("127.0.0.1")]);
  const x = win.n % 10 === 0 ? viaExec() : { ok: true };
  win.n++;
  for (const [k, r] of [["::1", a], ["127.0.0.1", b]]) {
    win.maxMs[k] = Math.max(win.maxMs[k], r.ms);
    if (!r.ok) {
      win.fail[k]++;
      log({ event: "fail", path: k, ...r });
    }
  }
  if (!x.ok) {
    win.fail.exec++;
    log({ event: "fail", path: "docker-exec", ...x });
  }
  if (Date.now() - lastSummary >= 60_000) {
    log({ event: "minute", ...win });
    win = { n: 0, fail: { "::1": 0, "127.0.0.1": 0, exec: 0 }, maxMs: { "::1": 0, "127.0.0.1": 0 } };
    lastSummary = Date.now();
  }
  await new Promise((r) => setTimeout(r, 1000));
}
log({ event: "end" });
