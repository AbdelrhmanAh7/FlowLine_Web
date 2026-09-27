import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
await fs.mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100' });
const page = await context.newPage();
const log = [];
const active = new Map();
page.on('request', req => { if (req.url().includes('/api/')) { active.set(req, Date.now()); log.push({ event: 'request', url: req.url(), method: req.method() }); } });
page.on('requestfinished', req => { if (active.has(req)) { log.push({ event: 'finished', url: req.url(), elapsedMs: Date.now() - active.get(req) }); active.delete(req); } });
page.on('requestfailed', req => { if (active.has(req)) { log.push({ event: 'failed', url: req.url(), elapsedMs: Date.now() - active.get(req), failure: req.failure() }); active.delete(req); } });
page.on('response', res => { if (res.url().includes('/api/')) log.push({ event: 'response', url: res.url(), status: res.status() }); });
page.on('console', msg => { if (msg.type() === 'error') log.push({ event: 'console-error', text: msg.text() }); });
page.on('pageerror', err => log.push({ event: 'page-error', text: err.message }));
await context.tracing.start({ screenshots: true, snapshots: true });

const shot = async name => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  log.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 4000), overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) });
};
try {
  for (const [width, height] of [[1440, 900], [1024, 768], [375, 812]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await shot(`public-landing-${width}`);
    await page.getByRole('link', { name: 'Start free' }).click();
    await shot(`public-signup-${width}`);
  }
  await page.getByLabel('Email').fill('bad-email');
  await page.getByLabel('Password').fill('12345678');
  await page.getByRole('button', { name: 'Create account' }).click();
  await shot('public-invalid-email');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('Name').fill('Codex Tester Second Attempt');
  await page.getByLabel('Email').fill(`codex-retry-${Date.now().toString(36)}@flowline-e2e.test`);
  await page.getByLabel('Password').fill(randomBytes(24).toString('base64url'));
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForTimeout(45000);
  await shot('signup-second-attempt-45s');
  log.push({ event: 'pending', requests: [...active.values()].map(start => Date.now() - start) });
} catch (error) {
  log.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('public-check-error').catch(() => {});
} finally {
  await fs.writeFile(path.join(evidence, 'public-check.json'), JSON.stringify(log, null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'public-check.zip') });
  await browser.close();
}
