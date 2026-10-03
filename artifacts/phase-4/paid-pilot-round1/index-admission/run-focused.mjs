// Local-only focused verifier: cached image, generated credentials, uniquely owned disposable container.
// Never loads .env files, starts a browser/web service, or calls a real provider.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../../../../", import.meta.url));
const evidence = fileURLToPath(new URL("./", import.meta.url));
const attempt = Date.now();
const container = `flowline-pilot-index-admission-${attempt}`;
const password = randomBytes(24).toString("hex");
const command = (bin, args, opts = {}) => spawnSync(bin, args, { cwd, encoding: "utf8", ...opts });
const checked = (bin, args, opts) => {
  const result = command(bin, args, opts);
  if (result.status !== 0) throw new Error(`${bin} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};
const result = { baseSha: "360078e9d3357267711f006888b578f5a0c6c434", scope: "isolated synthetic Postgres integration; no external providers", container, database: "flowline_test_pilotindex", tests: [], cleanup: false };
let created = false;
try {
  result.image = checked("docker", ["image", "inspect", "postgres:17.6-alpine", "--format", "{{.Id}}"]);
  result.containerId = checked("docker", ["run", "-d", "--pull=never", "--name", container, "--label", "flowline.proof=pilot-index-admission", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_USER=pilot_index", "-e", "POSTGRES_DB=flowline_test_pilotindex", "--memory=384m", "--cpus=0.75", "--pids-limit=128", "-p", "127.0.0.1::5432", "postgres:17.6-alpine"]);
  created = true;
  const port = checked("docker", ["inspect", "--format", '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', container]);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (command("docker", ["exec", container, "pg_isready", "-U", "pilot_index", "-d", "flowline_test_pilotindex"]).status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Owned disposable Postgres did not become ready");
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ["SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "PATH", "Path", "PATHEXT", "ComSpec"].includes(key))), DATABASE_URL: `postgres://pilot_index:${password}@127.0.0.1:${port}/flowline_test_pilotindex`,
    FLOWLINE_ENV: "test", BETTER_AUTH_URL: "http://localhost:3100", FLOWLINE_PUBLIC_URL: "http://localhost:3100",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), FLOWLINE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    FLOWLINE_PLATFORM_ENCRYPTION_KEY: randomBytes(32).toString("base64"), FLOWLINE_EMAIL_PROVIDER: "outbox",
    FLOWLINE_COMPANY_BUILDER: "on", FLOWLINE_DB_POOL_MAX: "4", FLOWLINE_BETA_MODE: "open",
    // The revoked-env regression needs legacy variables; these are synthetic and never reach a provider.
    GOOGLE_OAUTH_CLIENT_ID: "pilot-index-admission-google-client", GOOGLE_OAUTH_CLIENT_SECRET: "pilot-index-admission-google-synthetic-secret",
  };
  for (const key of ["ZITADEL_ISSUER", "ZITADEL_CLIENT_ID", "ZITADEL_CLIENT_SECRET"]) delete env[key];
  const args = ["node_modules/vitest/vitest.mjs", "run", "--project", "integration", "tests/integration/pilot-index-admission.test.ts", "tests/integration/pilot-upload-admission.test.ts", "tests/integration/p3-knowledge.test.ts", "--fileParallelism=false"];
  const run = command(process.execPath, args, { env });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.replaceAll(password, "[generated credential redacted]");
  writeFileSync(`${evidence}integration-${attempt}.log`, output);
  result.tests.push({ command: `node ${args.join(" ")}`, exitCode: run.status });
  process.stdout.write(output);
  if (run.status !== 0) process.exitCode = 1;
} catch (error) {
  result.error = String(error.message).replaceAll(password, "[generated credential redacted]");
  console.error(result.error);
  process.exitCode = 1;
} finally {
  if (created) {
    const owned = command("docker", ["inspect", "--format", '{{.Id}}|{{index .Config.Labels "flowline.proof"}}', result.containerId]);
    if (owned.status === 0 && owned.stdout.trim() === `${result.containerId}|pilot-index-admission`) result.cleanup = command("docker", ["rm", "-f", result.containerId]).status === 0;
  }
  if (created && !result.cleanup) process.exitCode = 1;
  writeFileSync(`${evidence}integration-${attempt}.json`, `${JSON.stringify(result, null, 2)}\n`);
}
