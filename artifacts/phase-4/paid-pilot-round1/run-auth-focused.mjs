import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const env = { ...process.env, DATABASE_URL: 'postgres://flowline:flowline_local_only@127.0.0.1:5433/flowline_test_pilotsecauth', FLOWLINE_ENV: 'test', FLOWLINE_DB_POOL_MAX: '4', BETTER_AUTH_URL: 'http://localhost:3100', FLOWLINE_PUBLIC_URL: 'http://localhost:3100', BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), FLOWLINE_ENCRYPTION_KEY: randomBytes(32).toString('base64'), FLOWLINE_PLATFORM_ENCRYPTION_KEY: randomBytes(32).toString('base64'), FLOWLINE_BETA_MODE: 'open', FLOWLINE_EMAIL_PROVIDER: 'outbox' };
for (const key of ['ZITADEL_ISSUER', 'ZITADEL_CLIENT_ID', 'ZITADEL_CLIENT_SECRET']) delete env[key];
// No env file is read. Database was newly created for this candidate only.
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--project', 'integration', ...process.argv.slice(2)], { env, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
