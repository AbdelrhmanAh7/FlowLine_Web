import { spawn } from "node:child_process";
import { closeSync, openSync, appendFileSync } from "node:fs";
const out = "artifacts/beta-execution/20260930T122429Z";
const raw = "artifacts/beta-execution/helper-logs/20260930T122429Z";
for (const task of ["test:integration", "check:evidence"]) {
  const log = openSync(`${raw}/${task.replaceAll(":", "-")}-attempt3.log`, "wx");
  const child = spawn("pnpm.cmd", ["-s", task], { shell: true, stdio: ["ignore", log, log] });
  console.log(`START ${task} supervised child pid=${child.pid}`);
  const code = await new Promise(resolve => {
    child.on("exit", resolve);
    child.on("error", () => resolve(127));
  });
  closeSync(log);
  appendFileSync(`${out}/remaining-gate-attempt3.txt`, `${new Date().toISOString()} ${task} exit=${code}\n`);
  console.log(`END ${task} exit=${code}`);
  if (code !== 0) process.exit(code ?? 1);
}
