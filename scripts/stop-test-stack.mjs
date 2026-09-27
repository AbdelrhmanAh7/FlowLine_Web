// Stops the isolated test stack: whatever listens on :3100 plus test workers/sandboxes.
// Matching by port (not command line) also catches the Next server child process.
import { execSync } from "node:child_process";

const PORT = 3100;
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
  run(`lsof -ti tcp:${PORT} | xargs -r kill -9`);
  run(`pkill -f "dev-test.mjs|worker/index.ts|sandbox-child"`);
}
console.log(`test stack on :${PORT} stopped`);
