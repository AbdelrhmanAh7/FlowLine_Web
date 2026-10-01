// Stops the isolated test stack: whatever listens on :3100 and on the fake-provider ports (default 4010 / 4011, from
// .env.test like dev-test.mjs), plus test workers/sandboxes. Matching by port (not command line) also catches the Next
// server child process in BOTH modes (`next dev` and FLOWLINE_TEST_NEXT=start `next start`). Uses lsof when present,
// fuser otherwise (minimal Linux images ship one or the other).
import { execSync } from "node:child_process";

const PORT = 3100;
try {
  process.loadEnvFile(".env.test");
} catch {
  /* defaults */
}
const portOf = (url, fallback) => {
  try {
    return new URL(url).port || fallback;
  } catch {
    return fallback;
  }
};
const PORTS = [PORT, portOf(process.env.FLOWLINE_PROVIDER_OVERRIDE ?? "http://127.0.0.1:4010", "4010"), portOf(process.env.FLOWLINE_AI_TEST_OVERRIDE ?? "http://127.0.0.1:4011", "4011")];
const run = (cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};

if (process.platform === "win32") {
  const ps = [
    `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { taskkill /PID $_.OwningProcess /T /F | Out-Null }`,
    `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dev-test.mjs|worker[\\\\/]index.ts|sandbox-child' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`,
  ].join("; ");
  run(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
} else {
  for (const p of PORTS) {
    run(`lsof -ti tcp:${p} | xargs -r kill -9`);
    run(`fuser -k -n tcp ${p}`);
  }
  run(`pkill -f "dev-test.mjs|worker/index.ts|sandbox-child|e2e/fakes/"`);
}
const still = process.platform === "win32" ? [] : PORTS.filter((p) => run(`fuser -n tcp ${p} 2>/dev/null`).trim() || run(`lsof -ti tcp:${p}`).trim());
console.log(still.length ? `test stack: ports still in use: ${still.join(", ")}` : `test stack on :${PORTS.join(", :")} stopped`);
