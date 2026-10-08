// Stops the isolated test stack: whatever listens on :3100 and on the fake-provider ports (default 4010 / 4011, from
// .env.test like dev-test.mjs), plus test workers/sandboxes. Matching by port (not command line) also catches the Next
// server child process in BOTH modes (`next dev` and FLOWLINE_TEST_NEXT=start `next start`). Uses lsof when present,
// fuser otherwise (minimal Linux images ship one or the other).
// One stack of several (sharded E2E): the same FLOWLINE_TEST_PORT / _FAKE_PORT / _AI_PORT env as dev-test.mjs, or
// `--port=<app> [--fake-port=<p>] [--ai-port=<p>]`. Only that stack's ports and explicitly owned launcher/worker processes are stopped.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import testStackEnv from "./test-stack.cjs";

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
const PORT = stack.port;
const PORTS = [PORT, stack.fakePort, stack.aiPort];
// A non-default stack may run beside the default stack, so process cleanup must stay scoped to its test port.
const single = !process.env.FLOWLINE_TEST_PORT || PORT === 3100;
// No shell: each command is a program plus an argument array, so nothing in a port, pid or script is parsed as shell syntax.
const run = (file, args) => {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};
const kill = (pids) => {
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGKILL");
    } catch {
      /* already gone */
    }
  }
};
const listening = (p) => run("lsof", ["-ti", `tcp:${p}`]).split(/\s+/).filter((pid) => /^\d+$/.test(pid));

/** Linux: pids of this stack's launcher / marked worker / fakes / next, found by FLOWLINE_TEST_PORT in their environment. */
const stackPids = () => {
  const mine = `FLOWLINE_TEST_PORT=${PORT}`;
  const pids = [];
  if (!existsSync("/proc")) return pids; // macOS: by port only
  for (const pid of readdirSync("/proc").filter((d) => /^\d+$/.test(d) && Number(d) !== process.pid)) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
      if (!/dev-test\.mjs|worker\/index\.ts.*--flowline-test-stack=\d+|e2e\/fakes\/|next (start|dev)|next-server/.test(cmd)) continue;
      const environment = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
      if (environment.includes(mine) || (single && !environment.some((entry) => entry.startsWith("FLOWLINE_TEST_PORT=")) && /worker\/index\.ts/.test(cmd))) pids.push(pid);
    } catch {
      /* gone, or not ours */
    }
  }
  return pids;
};

if (process.platform === "win32") {
  const ps = [
    ...(single ? [PORT] : PORTS).map(
      (p) => `Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { taskkill /PID $_.OwningProcess /T /F | Out-Null }`,
    ),
    // Stop the launcher and only a worker explicitly marked for this test stack; never sweep generic workers/sandboxes.
    ...(single
      ? [`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dev-test.mjs' -or $_.CommandLine -match 'worker[\\\\/]index.ts.*--flowline-test-stack=${PORT}(?:\\s|$)' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`]
      : []),
  ].join("; ");
  run("powershell", ["-NoProfile", "-Command", ps]);
} else {
  const owned = stackPids(); // before the ports go, while dev-test.mjs is still up
  for (const p of PORTS) {
    kill(listening(p));
    run("fuser", ["-k", "-n", "tcp", String(p)]);
  }
  kill(owned);
}
const still = process.platform === "win32" ? [] : PORTS.filter((p) => run("fuser", ["-n", "tcp", String(p)]).trim() || listening(p).length);
console.log(still.length ? `test stack: ports still in use: ${still.join(", ")}` : `test stack on :${PORTS.join(", :")} stopped`);
