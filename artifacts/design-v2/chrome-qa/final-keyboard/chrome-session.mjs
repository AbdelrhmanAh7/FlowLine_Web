import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const session = process.argv[2];
const checkpointNumber = process.argv[3] ?? '12';
const profile = process.argv[4] ?? session;
if (!/^[a-z0-9-]+$/.test(session ?? '')) throw new Error('Session name required');
if (!/^\d+$/.test(checkpointNumber) || !/^[a-z0-9-]+$/.test(profile)) throw new Error('Invalid identity');
const root = 'artifacts/design-v2/chrome-qa/final-keyboard';
const out = `${root}/${session}`;
await mkdir(out, { recursive: true });
await mkdir(`${root}/.profile/${session}`, { recursive: true });
const context = await chromium.launchPersistentContext(path.resolve(root, '.profile', profile), {
  channel: 'chrome', headless: false, viewport: { width: 1440, height: 1000 },
  args: ['--remote-debugging-port=9229', '--remote-debugging-address=127.0.0.1'],
});
// The controller owns native-dialog dismissal; an unhandled dialog on this CDP
// connection would otherwise race it and auto-dismiss the confirmation.
for (const page of context.pages()) page.on('dialog', () => {});
context.on('page', page => page.on('dialog', () => {}));
await context.addCookies([{ name: 'fl_locale', value: 'en', domain: 'localhost', path: '/' }]);
await writeFile(`${out}/identity.json`, JSON.stringify({
  method: 'Agent-driven Google Chrome exploratory QA via Playwright',
  chrome: context.browser()?.version(), headed: true, isolatedProfile: true,
  control: 'Playwright CDP connection to supervised installed Google Chrome',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  checkpoint: execFileSync('git', ['rev-parse', `refs/checkpoints/design-v2-closeout-${checkpointNumber}`], { encoding: 'utf8' }).trim(),
  build: (await readFile('.next-test/BUILD_ID', 'utf8')).trim(), started: new Date().toISOString(),
  integrationScope: 'test doubles only',
}, null, 2));
const deadline = Date.now() + 23 * 60_000;
try {
  while (Date.now() < deadline) {
    if (await access(`${root}/.profile/${session}/STOP`).then(() => true, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
} finally {
  await context.close();
  await writeFile(`${out}/end.json`, JSON.stringify({ closed: true, ended: new Date().toISOString() }));
}
