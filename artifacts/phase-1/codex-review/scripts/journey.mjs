import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = 'artifacts/phase-1/codex-review';
const out = `${root}/screenshots`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [];
page.on('console', m => { if (m.type() === 'error') events.push({ type: 'console', text: m.text().slice(0, 800) }); });
page.on('pageerror', e => events.push({ type: 'pageerror', text: e.message }));
page.on('response', r => { if (r.status() >= 400) events.push({ type: 'http', status: r.status(), url: r.url() }); });
let seq = 0;
async function snap(label) {
  const n = String(++seq).padStart(2, '0');
  await page.screenshot({ path: `${out}/journey-${n}-${label}.png` });
  console.log(JSON.stringify({ label, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 2800), buttons: await page.getByRole('button').allTextContents() }));
}
const email = `codex-explore-${Date.now()}@flowline-e2e.test`;
console.log('EMAIL', email);
try {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start free', exact: true }).click();
  await page.getByLabel('Name').fill('Codex Explorer');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Codex-Test-Pass-1');
  await snap('signup-filled');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/onboarding/, { timeout: 15000 });
  await snap('onboarding-1');
  await page.getByLabel('Workspace name').fill('Codex Explore');
  await page.getByRole('button', { name: 'Continue' }).click();
  await snap('onboarding-2');
  await page.getByRole('radio', { name: /Sales & lead ops/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await snap('onboarding-3');
  await page.getByRole('radio', { name: /Lead Qualifier/ }).click();
  await page.getByRole('button', { name: /Create flow & open canvas/ }).click();
  await page.waitForURL(/\/flows\//, { timeout: 15000 });
  await snap('builder');
  await page.getByRole('button', { name: '▶ Run' }).click();
  await page.getByTestId('run-dock').getByText('SUCCESS').first().waitFor({ timeout: 20000 });
  await snap('run-success');
  await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
  await snap('inspector');
} catch (e) {
  console.log('FAIL', e.stack || String(e));
  await snap('failure');
} finally {
  writeFileSync(`${root}/journey-events.json`, JSON.stringify({ email, events }, null, 2));
  await browser.close();
}
