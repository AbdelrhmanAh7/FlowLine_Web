import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const a = JSON.parse(await fs.readFile(path.join(evidence, 'identity.json')));
const template = JSON.parse(await fs.readFile(path.join(evidence, 'template-ids.json')));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [];
page.on('console', m => { if (m.type() === 'error') events.push({ event: 'console', text: m.text().replace(/params:\s*[^\n]+/g, 'params: [redacted]') }); });
page.on('response', r => { if (r.status() >= 400) events.push({ event: 'response', status: r.status(), url: r.url() }); });
await context.tracing.start({ screenshots: true, snapshots: true });
const shot = async name => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 6000) });
  console.log(name);
};
try {
  const stamp = Date.now().toString(36);
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Codex Tenant B');
  await page.getByLabel('Email').fill(`codex-b-${stamp}@flowline-e2e.test`);
  await page.getByLabel('Password').fill(randomBytes(24).toString('base64url'));
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: 'Name your workspace' }).waitFor({ timeout: 15000 });
  await page.getByLabel('Workspace name').fill(`Codex B ${stamp}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Sales & lead ops/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Blank flow/ }).click();
  await page.getByRole('button', { name: /Create flow & open canvas/ }).click();
  await page.getByText('Start with a trigger').waitFor();
  const bSlug = page.url().split('/')[4];
  events.push({ event: 'b-identity', workspaceSlug: bSlug });
  await page.goto(`/w/${bSlug}/flows`);
  await shot('61-tenant-b-own-flows');
  await page.goto(`/w/${bSlug}/runs`);
  await shot('62-tenant-b-own-runs');
  await page.goto(`/w/${bSlug}/integrations`);
  await shot('63-tenant-b-own-integrations');
  for (const [name, url] of [
    ['a-workspace', `/w/${a.workspaceSlug}/flows`],
    ['a-integrations', `/w/${a.workspaceSlug}/integrations`],
    ['a-builder-via-b', `/w/${bSlug}/flows/${a.flowId}`],
    ['a-template-flow-via-b', `/w/${bSlug}/flows/${template.flowUrl.split('/').pop()}`],
    ['a-run-via-b', `/w/${bSlug}/runs?run=961cb9ae-a096-42c2-80d9-d77d78b29131`],
  ]) {
    const response = await page.goto(url);
    events.push({ event: 'navigation-status', name, status: response?.status() });
    await shot(`64-tenant-b-${name}`);
  }
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('tenancy-check-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'tenancy-check.json'), JSON.stringify(events, null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'tenancy-check.zip') });
  await browser.close();
}
