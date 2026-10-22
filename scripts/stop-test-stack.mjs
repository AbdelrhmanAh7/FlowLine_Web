// Stops the isolated test stack: whatever listens on :3100 and on the fake-provider ports (default 4010 / 4011, from
// .env.test like dev-test.mjs), plus test workers/sandboxes. Matching by port (not command line) also catches the Next
// server child process in BOTH modes (`next dev` and FLOWLINE_TEST_NEXT=start `next start`). Uses lsof when present,
// fuser otherwise (minimal Linux images ship one or the other).
// One stack of several (sharded E2E): the same FLOWLINE_TEST_PORT / _FAKE_PORT / _AI_PORT env as dev-test.mjs, or
// `--port=<app> [--fake-port=<p>] [--ai-port=<p>]`. Only that stack's ports and explicitly owned launcher/worker processes are stopped.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import testStackEnv from "./test-stack.cjs";

// Pure validators and argv builders exported for unit testing; script execution is guarded by import.meta.url.
export function validatePid(pid) {
  const s = String(pid ?? "").trim(), n = Number(s);
  if (!/^[0-9]{1,7}$/.test(s) || n <= 1) throw new Error(`Invalid PID: ${JSON.stringify(pid)}`);
  return n;
}
export function validatePort(port) {
  const s = String(port ?? "").trim(), n = Number(s);
  if (!/^[0-9]{1,5}$/.test(s) || !Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`Invalid port: ${JSON.stringify(port)}`);
  return n;
}
export function validateStackName(name) {
  const s = String(name ?? "").trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(s)) throw new Error(`Invalid stack name: ${JSON.stringify(name)}`);
  return s;
}

export function buildLsofArgs(port) { return ["-ti", `tcp:${validatePort(port)}`]; }
export function buildFuserArgs(port, { kill = false } = {}) { return kill ? ["-k", "-n", "tcp", String(validatePort(port))] : ["-n", "tcp", String(validatePort(port))]; }
export function buildKillArgs(pids) {
  const list = Array.isArray(pids) ? pids : [pids];
  if (list.length === 0) throw new Error("At least one PID required");
  return ["-9", ...list.map(validatePid).map(String)];
}
export function buildPowerShellArgs(ports, singlePort = null) {
  const ps = (Array.isArray(ports) ? ports : [ports]).map(validatePort)
    .map((p) => `Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { taskkill /PID $_.OwningProcess /T /F | Out-Null }`);
  if (singlePort !== null && singlePort !== undefined) {
    ps.push(`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dev-test.mjs' -or $_.CommandLine -match 'worker[\\\\/]index.ts.*--flowline-test-stack=${validatePort(singlePort)}(?:\\s|$)' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`);
  }
  return ["-NoProfile", "-Command", ps.join("; ")];
}
export function buildStackArgs(stackName) { return ["--filter", `name=${validateStackName(stackName)}`]; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
if (process.env.FLOWLINE_TEST_PID) {
  try { validatePid(process.env.FLOWLINE_TEST_PID); } catch (e) { console.error(`Invalid PID in environment: ${e.message}`); process.exit(1); }
}
try {
  process.loadEnvFile(".env.test");
} catch {
  /* defaults */
}
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--(port|fake-port|ai-port)=(\d+)$/);
  if (!m) {
    console.error(`unknown argument: ${a} (usage: stop-test-stack [--port=N] [--fake-port=N] [--ai-port=N])`);
    process.exit(2);
  }
  process.env[{ port: "FLOWLINE_TEST_PORT", "fake-port": "FLOWLINE_TEST_FAKE_PORT", "ai-port": "FLOWLINE_TEST_AI_PORT" }[m[1]]] = m[2];
}
const stack = testStackEnv.testStack(process.env);
const PORT = validatePort(stack.port);
const PORTS = [PORT, validatePort(stack.fakePort), validatePort(stack.aiPort)];
// A non-default stack may run beside the default stack, so process cleanup must stay scoped to its test port.
const single = !process.env.FLOWLINE_TEST_PORT || PORT === 3100;
const run = (file, args) => {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};

/** Linux: pids of this stack's launcher / marked worker / fakes / next, found by FLOWLINE_TEST_PORT in their environment. */
const stackPids = () => {
  const mine = `FLOWLINE_TEST_PORT=${PORT}`;
  const pids = [];
  if (!existsSync("/proc")) return pids;
  for (const pid of readdirSync("/proc").filter((d) => /^\d+$/.test(d) && Number(d) !== process.pid)) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ");
      if (!/dev-test\.mjs|worker\/index\.ts.*--flowline-test-stack=\d+|e2e\/fakes\/|next (start|dev)|next-server/.test(cmd)) continue;
      const environment = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
      if (environment.includes(mine) || (single && !environment.some((entry) => entry.startsWith("FLOWLINE_TEST_PORT=")) && /worker\/index\.ts/.test(cmd))) pids.push(validatePid(pid));
    } catch {
      /* gone, or not ours */
    }
  }
  return pids;
};

// CodeQL [js/incomplete-sanitization] (alert #4): No string replace sanitization; arguments passed directly as argv elements.
// CodeQL [js/shell-command-injection-from-environment] (alert #13): Validated argv arrays without shell execution. See docs/security/codeql-triage-scripts.md
if (process.platform === "win32") {
  run("powershell", buildPowerShellArgs(single ? [PORT] : PORTS, single ? PORT : null));
} else {
  const owned = stackPids();
  for (const p of PORTS) {
    const pids = run("lsof", buildLsofArgs(p)).split(/\s+/).map((s) => s.trim()).filter(Boolean).map(validatePid);
    if (pids.length) run("kill", buildKillArgs(pids));
    run("fuser", buildFuserArgs(p, { kill: true }));
  }
  if (owned.length) run("kill", buildKillArgs(owned));
}
const still = process.platform === "win32" ? [] : PORTS.filter((p) => run("fuser", buildFuserArgs(p)).trim() || run("lsof", buildLsofArgs(p)).trim());
console.log(still.length ? `test stack: ports still in use: ${still.join(", ")}` : `test stack on :${PORTS.join(", :")} stopped`);
}
