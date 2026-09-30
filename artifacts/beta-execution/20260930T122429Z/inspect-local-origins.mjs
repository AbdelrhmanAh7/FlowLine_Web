import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
for (const file of ['.env', '.env.test', '.env.staging']) {
  if (!existsSync(file)) continue;
  const env = parseEnv(readFileSync(file, 'utf8'));
  const record = { file };
  for (const key of ['FLOWLINE_PUBLIC_URL', 'BETTER_AUTH_URL']) {
    try { record[key] = env[key] ? new URL(env[key]).origin : null; }
    catch { record[key] = 'invalid'; }
  }
  record.environment = env.FLOWLINE_ENV ?? null;
  record.providerOverridePresent = Boolean(env.FLOWLINE_PROVIDER_OVERRIDE);
  console.log(JSON.stringify(record));
}
