// Local-only focused verifier: cached image, generated credentials, uniquely owned disposable container.
// Never loads .env files, starts a browser/web service, or calls a real provider.
// The test child gets an explicit environment allowlist (scripts/focused-run-env.mjs, issue #36): OS/runtime variables
// plus the synthetic values below, never the ambient shell. The names are recorded in the result JSON (never values).
// `--dry-run` prints those names and exits before any git, Docker or file output.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildFocusedTestEnv } from "../../../../scripts/focused-run-env.mjs";

const cwd = fileURLToPath(new URL("../../../../", import.meta.url));
const evidence = fileURLToPath(new URL("./", import.meta.url));
const attempt = Date.now();
const container = `flowline-pilot-upload-admission-${attempt}`;
const password = randomBytes(24).toString("hex");
const command = (bin, args, opts = {}) => spawnSync(bin, args, { cwd, encoding: "utf8", ...opts });
const checked = (bin, args, opts, trim = true) => {
  const result = command(bin, args, opts);
  if (result.status !== 0) throw new Error(`${bin} failed (${result.status}): ${result.stderr || result.stdout}`);
  return trim ? result.stdout.trim() : result.stdout;
};
// Allowlisted child environment: only OS/runtime names from the parent plus these synthetic values. Ambient variables
// (ZITADEL_*, other FLOWLINE_*, provider keys, NODE_ENV ...) are never forwarded, so nothing needs deleting.
const childEnvironment = (databaseUrl) => buildFocusedTestEnv(process.env, {
  DATABASE_URL: databaseUrl,
  FLOWLINE_ENV: "test", BETTER_AUTH_URL: "http://localhost:3100", FLOWLINE_PUBLIC_URL: "http://localhost:3100",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), FLOWLINE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  FLOWLINE_PLATFORM_ENCRYPTION_KEY: randomBytes(32).toString("base64"), FLOWLINE_EMAIL_PROVIDER: "outbox",
  FLOWLINE_COMPANY_BUILDER: "on", FLOWLINE_DB_POOL_MAX: "4", FLOWLINE_BETA_MODE: "open",
  // The revoked-env regression needs legacy variables; these are synthetic and never reach a provider.
  GOOGLE_OAUTH_CLIENT_ID: "pilot-upload-admission-google-client", GOOGLE_OAUTH_CLIENT_SECRET: "pilot-upload-admission-google-synthetic-secret",
});
if (process.argv.includes("--dry-run")) {
  // Placeholder URL with a throwaway credential: never connected to and never printed. No git, Docker or evidence file.
  const { record } = childEnvironment("postgres://pilot_upload:dry-run@127.0.0.1:0/flowline_test_pilotupload");
  console.log(JSON.stringify({ dryRun: true, ...record }, null, 2));
  process.exit(0);
}
const result = { baseSha: "a9f7597c90b98128a1cebf46a949810e0586c31d", scope: "isolated synthetic Postgres integration; no external providers", container, database: "flowline_test_pilotupload", tests: [], cleanup: false };
let created = false;
try {
  result.testedSha = checked("git", ["rev-parse", "HEAD"]);
  const status = checked("git", ["status", "--porcelain", "--untracked-files=all"]);
  result.dirty = status.length > 0;
  result.trackedDiffSha256 = createHash("sha256").update(checked("git", ["diff", "--binary", "HEAD"], undefined, false)).digest("hex");
  // A tracked diff digest cannot identify untracked source or migrations.
  if (status.split("\n").some(line => /^\?\? (src|tests|worker|scripts|drizzle)\//.test(line))) throw new Error("Untracked source/migration files prevent source provenance; track them before running");
  result.image = checked("docker", ["image", "inspect", "postgres:17.6-alpine", "--format", "{{.Id}}"]);
  result.containerId = checked("docker", ["run", "-d", "--pull=never", "--name", container, "--label", "flowline.proof=pilot-upload-admission", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_USER=pilot_upload", "-e", "POSTGRES_DB=flowline_test_pilotupload", "-p", "127.0.0.1::5432", "postgres:17.6-alpine"]);
  created = true;
  const port = checked("docker", ["inspect", "--format", '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', container]);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (command("docker", ["exec", container, "pg_isready", "-U", "pilot_upload", "-d", "flowline_test_pilotupload"]).status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Owned disposable Postgres did not become ready");
  const { env, record } = childEnvironment(`postgres://pilot_upload:${password}@127.0.0.1:${port}/flowline_test_pilotupload`);
  result.childEnv = record;
  const args = ["node_modules/vitest/vitest.mjs", "run", "--project", "integration", "tests/integration/pilot-upload-admission.test.ts", "tests/integration/retained-file-locking.test.ts", "tests/integration/p3-knowledge.test.ts", "--fileParallelism=false"];
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
    if (owned.status === 0 && owned.stdout.trim() === `${result.containerId}|pilot-upload-admission`) result.cleanup = command("docker", ["rm", "-f", result.containerId]).status === 0;
  }
  if (created && !result.cleanup) process.exitCode = 1;
  writeFileSync(`${evidence}integration-${attempt}.json`, `${JSON.stringify(result, null, 2)}\n`);
}
