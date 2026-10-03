import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
// The target database comes from the environment: this script stores no credentials. It must be a disposable test database.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Set DATABASE_URL to a disposable flowline_test_* database (for example flowline_test_pilotsecauth); this script supplies no credentials.');
if (!/^\/flowline_test/.test(new URL(databaseUrl).pathname)) throw new Error('DATABASE_URL must name a flowline_test* database, never the development database.');
const env = { ...process.env, DATABASE_URL: databaseUrl, FLOWLINE_ENV: 'test', FLOWLINE_DB_POOL_MAX: '4', BETTER_AUTH_URL: 'http://localhost:3100', FLOWLINE_PUBLIC_URL: 'http://localhost:3100', BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), FLOWLINE_ENCRYPTION_KEY: randomBytes(32).toString('base64'), FLOWLINE_PLATFORM_ENCRYPTION_KEY: randomBytes(32).toString('base64'), FLOWLINE_BETA_MODE: 'open', FLOWLINE_EMAIL_PROVIDER: 'outbox' };
for (const key of ['ZITADEL_ISSUER', 'ZITADEL_CLIENT_ID', 'ZITADEL_CLIENT_SECRET']) delete env[key];
// No env file is read. Database was newly created for this candidate only.
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--project', 'integration', ...process.argv.slice(2)], { env, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
