// Stops the isolated test stack: whatever listens on :3100 and on the fake-provider ports (default 4010 / 4011, from
// .env.test like dev-test.mjs), plus test workers/sandboxes. Matching by port (not command line) also catches the Next
// server child process in BOTH modes (`next dev` and FLOWLINE_TEST_NEXT=start `next start`). Uses lsof when present,
// fuser otherwise (minimal Linux images ship one or the other).
// One stack of several (sharded E2E): the same FLOWLINE_TEST_PORT / _FAKE_PORT / _AI_PORT env as dev-test.mjs, or
// `--port=<app> [--fake-port=<p>] [--ai-port=<p>]`. Then only that stack's ports are freed and the process-name sweep
// (which would hit EVERY stack's worker and fakes) is skipped; their processes die with their dev-test.mjs parent.
import { execSync } from "node:child_process";
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
// The default stack keeps today's full sweep (stray workers/sandboxes/fakes by name). A non-default one is one of
// several stacks running side by side: kill by port only, and its dev-test.mjs/worker by their stack env.
const single = !process.env.FLOWLINE_TEST_PORT || PORT === 3100;
const run = (cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};

/** Linux: pids of this stack's dev-test.mjs / worker / fakes / next, found by FLOWLINE_TEST_PORT in their environment. */
const stackPids = () => {
  const mine = `FLOWLINE_TEST_PORT=${PORT}`;
  const pids = [];
  if (!existsSync("/proc")) return pids; // macOS: by port only
  for (const pid of readdirSync("/proc").filter((d) => /^\d+$/.test(d) && Number(d) !== process.pid)) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
      if (!/dev-test\.mjs|worker\/index\.ts|sandbox-child|e2e\/fakes\/|next (start|dev)|next-server/.test(cmd)) continue;
      if (readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").includes(mine)) pids.push(pid);
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
    // Non-default stack: no name sweep (it would stop every stack); its worker exits with its dev-test.mjs tree.
    ...(single
      ? [`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dev-test.mjs|worker[\\\\/]index.ts|sandbox-child' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`]
      : []),
  ].join("; ");
  run(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
} else {
  const owned = single ? [] : stackPids(); // before the ports go, while dev-test.mjs is still up
  for (const p of PORTS) {
    run(`lsof -ti tcp:${p} | xargs -r kill -9`);
    run(`fuser -k -n tcp ${p}`);
  }
  if (single) run(`pkill -f "dev-test.mjs|worker/index.ts|sandbox-child|e2e/fakes/"`);
  else if (owned.length) run(`kill -9 ${owned.join(" ")}`);
}
const still = process.platform === "win32" ? [] : PORTS.filter((p) => run(`fuser -n tcp ${p} 2>/dev/null`).trim() || run(`lsof -ti tcp:${p}`).trim());
console.log(still.length ? `test stack: ports still in use: ${still.join(", ")}` : `test stack on :${PORTS.join(", :")} stopped`);
