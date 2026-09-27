import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'artifacts/phase-1/codex-review';
const email = JSON.parse(readFileSync(`${root}/journey-events.json`, 'utf8')).email;
const flow = '/w/codex-explore/flows/54b3471b-b85f-474e-ba77-637f9ff687b8';
const browser = await chromium.launch({ headless: true });
const events = [], results = [];
async function makePage(label) {
  const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') events.push({ label, type: 'console', text: m.text().slice(0, 500) }); });
  page.on('pageerror', e => events.push({ label, type: 'pageerror', text: e.message }));
  page.on('response', r => { if (r.status() >= 400) events.push({ label, type: 'http', status: r.status(), url: r.url() }); });
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Codex-Test-Pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/w\//);
  await page.goto(flow);
  await page.locator('.react-flow__node').first().waitFor();
  return { context, page };
}
async function snap(page, label) {
  await page.screenshot({ path: `${root}/screenshots/conflict-${label}.png` });
  const data = { label, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 1200), flowName: await page.getByLabel('Flow name').inputValue() };
  results.push(data); console.log(JSON.stringify(data));
}
let a, b;
try {
  a = await makePage('offline');
  b = await makePage('online');
  await a.context.setOffline(true);
  await a.page.getByLabel('Flow name').fill('Codex Local Conflict');
  await a.page.getByText('Offline mode').waitFor();
  await snap(a.page, 'local-draft');
  await b.page.getByLabel('Flow name').fill('Codex Server Conflict');
  await b.page.getByTestId('save-status').getByText('Saved', { exact: true }).waitFor({ timeout: 15000 });
  await snap(b.page, 'server-saved');
  await a.context.setOffline(false);
  const banner = a.page.getByRole('alert').filter({ hasText: 'This flow changed elsewhere' });
  await banner.waitFor({ timeout: 15000 });
  await snap(a.page, 'banner');
  await banner.getByRole('button', { name: 'Keep my version' }).click();
  await a.page.getByTestId('save-status').getByText('Saved', { exact: true }).waitFor({ timeout: 15000 });
  await b.page.reload(); await b.page.locator('.react-flow__node').first().waitFor();
  await snap(b.page, 'resolved');
} catch (e) { console.log('FAIL', e.stack || String(e)); if (a) await snap(a.page, 'failure'); }
finally {
  if (a) await a.context.setOffline(false).catch(() => {});
  writeFileSync(`${root}/conflict-results.json`, JSON.stringify({ results, events }, null, 2));
  await a?.context.close(); await b?.context.close(); await browser.close();
}
