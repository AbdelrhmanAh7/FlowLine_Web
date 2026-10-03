import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Each attack runs with its vulnerable source restored from the reviewed base.
// Preserve the working file byte-for-byte even if a test or child process fails.
const cases = [
  ['H1', 'src/server/sso.ts', 'sec-sso-link-consent.test.ts', 'valid OIDC from an unrelated tenant'],
  ['H2', 'src/server/sso.ts', 'sec-sso-email-prehijack.test.ts', 'invitation'],
  ['H3-workspace', 'src/server/sso.ts', 'sec-federated-totp.test.ts', 'grants no usable session'],
  ['H3-global', 'src/lib/auth.ts', 'sec-federated-totp.test.ts', 'single-factor ZITADEL|GitHub cannot bypass'],
  ['M7', 'src/server/zitadel-auth.ts', 'sec-zitadel-issuer-binding.test.ts', 'M7:'],
];
for (const [finding, path, test, pattern] of cases) {
  const current = readFileSync(path);
  const old = spawnSync('git', ['show', `ee70336:${path}`]);
  if (old.status !== 0) throw new Error(`Cannot obtain reviewed source: ${path}`);
  try {
    writeFileSync(path, old.stdout);
    const result = spawnSync(process.execPath, ['artifacts/phase-4/security-auth/run-focused.mjs', `tests/integration/${test}`, '-t', pattern], { encoding: 'utf8' });
    writeFileSync(`artifacts/phase-4/security-auth/red-${finding}.log`, `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    console.log(`${finding}: vulnerable-source exit=${result.status} (must fail)`);
    if (result.status !== 1 || !/AssertionError|Expected HttpError \d+ .*promise resolved/.test(`${result.stdout}\n${result.stderr}`)) throw new Error(`${finding} did not fail with an attack assertion`);
  } finally {
    writeFileSync(path, current);
  }
}
