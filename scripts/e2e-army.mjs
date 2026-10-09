// `pnpm e2e:army [e2e run args]`: the natural-language E2E suite (e2e-army/, tester-army/e2e; config e2e.config.ts).
// Without E2E_ARMY_URL the runner starts the isolated test stack (scripts/dev-test.mjs, .env.test → flowline_test, :3100)
// and stops it afterwards. Model for agent steps: E2E_ARMY_CLI=agy|claude, else `agy` when it is on PATH; with none the
// agent tests skip (E2E_ARMY_NOAGENT=1) and the locator tests still run. Telemetry is off. Hard limit: 5 minutes.
// What runs: no argument = the quick default (the top-level @issue tests + the smoke shard); `--shard-id <id>` = one feature
// shard of e2e-army/features/ (smoke, core-api, flows-api, runs, triggers, schedule, ai-api, platform-api, ui-auth, ui-auth2,
// ui-flows, ui-builder, ui-settings, ui-ai, ui-admin, ui-misc; each ≤ 5 min); other arguments go to `e2e run` unchanged.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const LIMIT_MS = 5 * 60_000;
const env = { ...process.env, E2E_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1", E2E_ARMY_OUT: process.env.E2E_ARMY_OUT || ".e2e" };
if (!env.E2E_ARMY_URL && !existsSync(".env.test")) {
  console.error(".env.test not found: the test stack needs it (docs/DEVELOPER_GUIDE.md), or set E2E_ARMY_URL to a running app");
  process.exit(2);
}
if (!env.E2E_ARMY_CLI && spawnSync("agy", ["--version"], { stdio: "ignore" }).status === 0) env.E2E_ARMY_CLI = "agy";
if (env.E2E_ARMY_CLI !== "agy" && env.E2E_ARMY_CLI !== "claude") env.E2E_ARMY_NOAGENT = "1";
const target = env.E2E_ARMY_URL ? "custom URL" : "test stack on :3100";
const model = env.E2E_ARMY_NOAGENT ? "none (agent tests skip)" : (env.E2E_ARMY_CLI === "claude" ? "claude" : "agy");
console.log(`e2e-army: ${target} · model ${model}`);

const args = process.argv.slice(2);
const at = args.indexOf("--shard-id");
if (at >= 0) {
  const id = args[at + 1] ?? "";
  if (!/^[a-z0-9-]+$/.test(id)) {
    console.error("e2e-army: --shard-id needs a shard name, e.g. --shard-id core-api");
    process.exit(2);
  }
  args.splice(at, 2, "--tag", `shard:${id}`);
} else if (args.length === 0) {
  args.push("e2e-army/*.e2e.ts", "e2e-army/features/_setup.e2e.ts", "e2e-army/features/smoke.e2e.ts");
}
const child = spawn("e2e", ["run", "--reporter", "list", ...args], { stdio: "inherit", env, shell: process.platform === "win32", detached: process.platform !== "win32" });
const timer = setTimeout(() => {
  console.error(`e2e-army: over the ${LIMIT_MS / 60_000} min budget, stopping`);
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM"); // the runner, the test stack it started and the browser
  } catch { /* already gone */ }
  process.exitCode = 124;
}, LIMIT_MS);
child.on("exit", (code) => {
  clearTimeout(timer);
  process.exit(process.exitCode ?? code ?? 1);
});
