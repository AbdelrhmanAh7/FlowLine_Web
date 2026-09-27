import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const root = 'artifacts/phase-1/codex-review';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const results = [], events = [];
page.on('console', m => { if (m.type() === 'error') events.push({ type: 'console', text: m.text().slice(0, 600) }); });
page.on('response', r => { if (r.status() >= 400) events.push({ type: 'http', status: r.status(), url: r.url() }); });
async function snap(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${root}/screenshots/tenancy-${name}.png` });
  const data = { name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 1800) };
  results.push(data); console.log(JSON.stringify(data));
}
try {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('codex-b@flowline-e2e.test');
  await page.getByLabel('Password').fill('Codex-Test-Pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/onboarding|\/w\//, { timeout: 15000 });
  await snap('b-first');
  if (page.url().includes('/onboarding')) {
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await page.waitForURL(/\/w\//, { timeout: 15000 });
    await snap('b-skipped');
  }
  const slug = new URL(page.url()).pathname.split('/')[2];
  await page.goto(`/w/${slug}/flows/54b3471b-b85f-474e-ba77-637f9ff687b8`);
  await snap('b-a-flow');
  await page.goto('/w/codex-explore/flows');
  await snap('b-a-workspace');
  await page.goto(`/w/${slug}/runs?run=adc370f6-641b-4902-b23f-9ff6881846ad`);
  await snap('b-a-run');
  console.log('B_SLUG', slug);
} finally {
  writeFileSync(`${root}/tenancy-results.json`, JSON.stringify({ results, events }, null, 2));
  await browser.close();
}
