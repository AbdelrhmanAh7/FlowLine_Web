// Usage: node scripts/with-env.mjs .env.test <command...>
// Loads an env file (without overriding already-set vars) and runs the command.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const [file, ...cmd] = process.argv.slice(2);
if (!file || cmd.length === 0) {
  console.error("usage: with-env <envfile> <command...>");
  process.exit(2);
}
if (!existsSync(file)) {
  console.error(`${file} not found — copy .env.example`);
  process.exit(2);
}
process.loadEnvFile(file);
const child = spawn(cmd.join(" "), { stdio: "inherit", shell: true, env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
