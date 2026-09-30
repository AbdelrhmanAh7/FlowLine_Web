// Bounded, supervised interactive Playwright exploration. No traces, HARs or automatic screenshots.
// Commands and private results live in the ignored profile directory; report only sanitized observations.
import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const out = resolve('artifacts/design-v2/chrome-qa/final-cp10');
const profile = resolve(out, '.profile');
mkdirSync(profile, { recursive: true });
const session = process.argv[2];
if (!['A', 'A-retest', 'B', 'B-resume', 'B-finish'].includes(session)) throw new Error('Unknown session');
const control = resolve(profile, `control-${session}`);
mkdirSync(control, { recursive: true });
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chrome', headless: false, viewport: { width: 1440, height: 1000 },
  baseURL: 'http://localhost:3100', extraHTTPHeaders: { origin: 'http://localhost:3100' },
});
ctx.setDefaultTimeout(8000);
const page = ctx.pages()[0] ?? await ctx.newPage();
const identity = {
  label: 'Agent-driven Google Chrome exploratory QA via Playwright', session,
  chrome: ctx.browser()?.version(), headed: true, control: 'Playwright 1.63.0, interactive commands',
  checkpoint: execFileSync('git', ['rev-parse', 'refs/checkpoints/design-v2-closeout-12'], { encoding: 'utf8' }).trim(),
  buildId: readFileSync('.next-test/BUILD_ID', 'utf8').trim(), started: new Date().toISOString(),
};
writeFileSync(resolve(out, `session-${session}-identity.json`), JSON.stringify(identity, null, 2));
const g = { ctx, page, expect, done: false, sensitive: true, results: [], identity };
// Sensitive setup screens: observe control names only, never input values or arbitrary DOM text.
g.observe = async () => ({
  pathname: new URL(page.url()).pathname,
  headings: await page.getByRole('heading').allTextContents(),
  buttons: await page.getByRole('button').allTextContents(),
  text: g.sensitive ? '[suppressed on credential/setup surfaces]' : (await page.locator('body').innerText()).slice(0, 14000),
});
g.check = (name, passed, details = '') => {
  if (typeof passed !== 'boolean') throw new Error('Explicit boolean required');
  g.results.push({ name, status: passed ? 'PASS' : 'FAIL', details });
  writeFileSync(resolve(out, `session-${session}-checks.json`), JSON.stringify(g.results, null, 2));
};
g.shot = async name => {
  if (g.sensitive || !/^[a-z0-9-]+$/.test(name)) throw new Error('Unsafe screenshot request');
  mkdirSync(resolve(out, 'screenshots'), { recursive: true });
  await page.screenshot({ path: resolve(out, 'screenshots', `${session}-${name}.png`) });
};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const deadline = Date.now() + 24 * 60_000;
console.log(`Session ${session} ready; headed isolated Chrome; command directory ${control}`);
try {
  for (let id = 1; !g.done && Date.now() < deadline; id++) {
    const command = resolve(control, `${id}.json`);
    while (!existsSync(command) && Date.now() < deadline) await new Promise(r => setTimeout(r, 250));
    if (!existsSync(command)) break;
    try {
      const { code } = JSON.parse(readFileSync(command, 'utf8'));
      const result = await new AsyncFunction('g', code)(g);
      writeFileSync(resolve(control, `${id}-result.json`), JSON.stringify({ ok: true, result: result ?? null }));
      console.log(`Command ${id}: completed`);
    } catch (error) {
      // Playwright errors can include filled values. Keep them out of all logs and reports.
      writeFileSync(resolve(control, `${id}-result.json`), JSON.stringify({ ok: false, error: error.name }));
      console.log(`Command ${id}: failed (${error.name}); inspect the current safe UI state`);
    }
  }
} finally {
  await ctx.close();
  writeFileSync(resolve(out, `session-${session}-end.json`), JSON.stringify({ ended: new Date().toISOString(), explicitStop: g.done, browserClosed: true }));
}
