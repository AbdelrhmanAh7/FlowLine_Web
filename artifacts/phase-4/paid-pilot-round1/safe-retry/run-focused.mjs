// Local-only focused verifier: cached image, generated credentials, uniquely owned disposable container.
// Never loads .env files, starts a browser/web service, or calls a real provider.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../../../../", import.meta.url));
const evidence = fileURLToPath(new URL("./", import.meta.url));
const attempt = Date.now();
const container = `flowline-pilot-safe-retry-${attempt}`;
const password = randomBytes(24).toString("hex");
const command = (bin, args, opts = {}) => spawnSync(bin, args, { cwd, encoding: "utf8", ...opts });
const checked = (bin, args, opts) => {
  const result = command(bin, args, opts);
  if (result.status !== 0) throw new Error(`${bin} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};
const result = { baseSha: "f035f88089048b2cff307d3bd16262de34d7799a", scope: "isolated synthetic Postgres integration; no external providers", container, database: "flowline_test_pilotretry", tests: [], cleanup: false };
let created = false;
try {
  result.image = checked("docker", ["image", "inspect", "postgres:17.6-alpine", "--format", "{{.Id}}"]);
  result.containerId = checked("docker", ["run", "-d", "--pull=never", "--name", container, "--label", "flowline.proof=pilot-safe-retry", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_USER=pilot_retry", "-e", "POSTGRES_DB=flowline_test_pilotretry", "-p", "127.0.0.1::5432", "postgres:17.6-alpine"]);
  created = true;
  const port = checked("docker", ["inspect", "--format", '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', container]);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (command("docker", ["exec", container, "pg_isready", "-U", "pilot_retry", "-d", "flowline_test_pilotretry"]).status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Owned disposable Postgres did not become ready");
  const env = {
    ...process.env, DATABASE_URL: `postgres://pilot_retry:${password}@127.0.0.1:${port}/flowline_test_pilotretry`,
    FLOWLINE_ENV: "test", BETTER_AUTH_URL: "http://localhost:3100", FLOWLINE_PUBLIC_URL: "http://localhost:3100",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), FLOWLINE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    FLOWLINE_PLATFORM_ENCRYPTION_KEY: randomBytes(32).toString("base64"), FLOWLINE_EMAIL_PROVIDER: "outbox",
    FLOWLINE_COMPANY_BUILDER: "on", FLOWLINE_DB_POOL_MAX: "4", FLOWLINE_BETA_MODE: "open",
    // The revoked-env regression needs legacy variables; these are synthetic and never reach a provider.
    GOOGLE_OAUTH_CLIENT_ID: "pilot-safe-retry-google-client", GOOGLE_OAUTH_CLIENT_SECRET: "pilot-safe-retry-google-synthetic-secret",
  };
  for (const key of ["ZITADEL_ISSUER", "ZITADEL_CLIENT_ID", "ZITADEL_CLIENT_SECRET"]) delete env[key];
  const args = ["node_modules/vitest/vitest.mjs", "run", "--project", "integration", "tests/integration/p2-actions.test.ts", "tests/integration/p2-review-fixes.test.ts", "--fileParallelism=false"];
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
    if (owned.status === 0 && owned.stdout.trim() === `${result.containerId}|pilot-safe-retry`) result.cleanup = command("docker", ["rm", "-f", result.containerId]).status === 0;
  }
  if (created && !result.cleanup) process.exitCode = 1;
  writeFileSync(`${evidence}integration-${attempt}.json`, `${JSON.stringify(result, null, 2)}\n`);
}
