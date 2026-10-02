// Native counterpart of browser-docker.sh: same Playwright projects and shard evidence,
// using installed Playwright browsers instead of the Docker browser image.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const [project, ...extra] = process.argv.slice(2);
if (!["chromium", "firefox", "webkit"].includes(project)) throw new Error("unknown browser project");
const stacks = JSON.parse(process.env.FLOWLINE_GATE_STACKS ?? "[]");
if (!stacks.length || !process.env.FLOWLINE_GATE_OUT) throw new Error("run through scripts/gate.mjs");
const files = extra.filter((a) => /^e2e\/[A-Za-z0-9._-]+\.spec\.ts$/.test(a));
console.log(`${project}: ${files.length ? `${files.length} spec file(s): ${files.join(" ")}` : "all specs (no file filter)"}`);
mkdirSync("test-results", { recursive: true });

const results = await Promise.all(stacks.map((stack, i) => new Promise((resolveResult) => {
  const report = `test-results/${project}-${stack.k}-report.txt`;
  const json = resolve(`test-results/${project}-${stack.k}-results.json`);
  rmSync(report, { force: true });
  rmSync(json, { force: true });
  const output = createWriteStream(report);
  const env = {
    ...process.env, ...stack.env,
    PLAYWRIGHT_JSON_OUTPUT_NAME: json,
    E2E_SCREENSHOT_DIR: resolve(join(process.env.FLOWLINE_GATE_OUT, `screenshots-${project}-${stack.k}`)),
  };
  const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test",
    `--project=${project}`, "--workers=1", "--reporter=line,json",
    `--output=test-results/${project}-${stack.k}`, `--shard=${i + 1}/${stacks.length}`, ...extra],
  { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  child.on("error", (error) => output.write(`spawn error: ${error.message}\n`));
  child.on("close", (code) => output.end(() => {
    console.log(`${project} shard ${i + 1}/${stacks.length}: rc=${code ?? 1}; ${report}`);
    resolveResult(code ?? 1);
  }));
})));
process.exitCode = results.every((code) => code === 0) ? 0 : 1;
