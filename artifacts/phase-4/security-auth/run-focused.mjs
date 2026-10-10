import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildFocusedTestEnv } from '../../../scripts/focused-run-env.mjs';
// The target database comes from the environment: this script stores no credentials. It must be a disposable test database.
// The test child gets an explicit environment allowlist (scripts/focused-run-env.mjs, issue #36): OS/runtime variables, the
// database URL above and the synthetic values below, never the rest of the ambient shell. `--dry-run` prints the names
// (never values) and exits without starting Vitest; every other argument goes to Vitest.
const cliArgs = process.argv.slice(2);
const dryRun = cliArgs.includes('--dry-run');
const vitestArgs = cliArgs.filter((arg) => arg !== '--dry-run');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Set DATABASE_URL to a disposable flowline_test_* database (for example flowline_test_secauth); this script supplies no credentials.');
if (!/^\/flowline_test/.test(new URL(databaseUrl).pathname)) throw new Error('DATABASE_URL must name a flowline_test* database, never the development database.');
const { env, record } = buildFocusedTestEnv(process.env, { DATABASE_URL: databaseUrl, FLOWLINE_ENV: 'test', BETTER_AUTH_URL: 'http://localhost:3100', FLOWLINE_PUBLIC_URL: 'http://localhost:3100', BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), FLOWLINE_ENCRYPTION_KEY: randomBytes(32).toString('base64'), FLOWLINE_PLATFORM_ENCRYPTION_KEY: randomBytes(32).toString('base64'), FLOWLINE_BETA_MODE: 'open', FLOWLINE_EMAIL_PROVIDER: 'outbox' });
// All test configuration is synthetic and in memory. No environment file is read.
if (dryRun) {
  console.log(JSON.stringify({ dryRun: true, ...record }, null, 2));
  process.exit(0);
}
console.error(`focused-run child environment (names only): ${JSON.stringify(record)}`);
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--project', 'integration', ...vitestArgs], { env, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
