import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'artifacts/phase-1/codex-review';
const email = JSON.parse(readFileSync(`${root}/journey-events.json`, 'utf8')).email;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const results = [], events = [];
page.on('console', m => { if (m.type() === 'error') events.push({ type: 'console', text: m.text().slice(0, 500) }); });
page.on('pageerror', e => events.push({ type: 'pageerror', text: e.message }));
page.on('response', r => { if (r.status() >= 400) events.push({ type: 'http', status: r.status(), url: r.url() }); });
async function snap(name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${root}/screenshots/misc-${name}.png` });
  const data = { name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 2200) };
  results.push(data); console.log(JSON.stringify(data));
}
async function stage(name, fn) { try { await fn(); } catch (e) { console.log('STAGE_FAIL', name, e.stack || String(e)); await snap(`${name}-failure`); } }
try {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email); await page.getByLabel('Password').fill('Codex-Test-Pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/flows$/);
  await page.getByText('RECENT ACTIVITY').waitFor();
  await snap('dashboard');
  const nav = page.getByRole('complementary', { name: 'Workspace navigation' });
  await stage('integrations', async () => {
    await nav.getByRole('link', { name: 'Integrations' }).click(); await page.waitForURL(/\/integrations$/);
    await page.getByRole('textbox', { name: 'Search integrations' }).fill('Slack');
    console.log('INTEGRATION_BUTTON', JSON.stringify(await page.getByRole('button', { name: 'Connect', exact: true }).first().evaluate(e => ({ disabled: e.disabled, ariaDisabled: e.getAttribute('aria-disabled'), title: e.getAttribute('title'), describedBy: e.getAttribute('aria-describedby') }))));
    await snap('integrations-search');
  });
  await stage('templates', async () => {
    await nav.getByRole('link', { name: 'Templates' }).click(); await page.waitForURL(/\/templates$/);
    await page.getByRole('button', { name: 'Support', exact: true }).click();
    await snap('templates-support');
    await page.getByRole('textbox', { name: 'Search templates' }).fill('Ticket Priority Router');
    await snap('templates-search');
  });
  await stage('settings-tabs', async () => {
    await nav.getByRole('link', { name: 'Settings' }).click(); await page.waitForURL(/\/settings$/);
    for (const tab of ['General', 'API keys', 'Billing & credits']) {
      await page.getByRole('button', { name: tab, exact: true }).click(); await snap(`settings-${tab.toLowerCase().replaceAll(/[^a-z]+/g, '-')}`);
    }
  });
  await stage('loading', async () => {
    await page.route('**/api/flows/54b3471b-b85f-474e-ba77-637f9ff687b8', async route => {
      if (route.request().method() === 'GET') await new Promise(resolve => setTimeout(resolve, 2500));
      await route.continue().catch(() => {});
    });
    const navPromise = page.goto('/w/codex-explore/flows/54b3471b-b85f-474e-ba77-637f9ff687b8');
    await page.locator('[aria-busy="true"][aria-label="Loading flow"]').waitFor({ timeout: 5000 });
    await snap('loading-skeleton');
    await navPromise; await page.locator('.react-flow__node').first().waitFor();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
  await stage('invalid-edge', async () => {
    const from = page.locator('.react-flow__node[data-id="normalise"] .react-flow__handle.source');
    const to = page.locator('.react-flow__node[data-id="is-hot"] .react-flow__handle.target');
    const a = await from.boundingBox(), b = await to.boundingBox();
    const before = await page.locator('.react-flow__edge').count();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2); await page.mouse.down();
    await page.mouse.move(a.x+40,a.y+10,{steps:5}); await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12}); await page.mouse.up();
    await snap('invalid-duplicate-edge');
    console.log('INVALID_EDGE', JSON.stringify({ before, after: await page.locator('.react-flow__edge').count(), statuses: await page.getByRole('status').allTextContents() }));
  });
  await stage('visual', async () => {
    const metrics = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const aside = getComputedStyle(document.querySelector('aside[aria-label="Workspace navigation"]'));
      return { bodyBackground: body.backgroundColor, bodyFont: body.fontFamily, sidebarBackground: aside.backgroundColor, sidebarWidth: document.querySelector('aside[aria-label="Workspace navigation"]').getBoundingClientRect().width };
    });
    const run = page.getByRole('button', { name: '▶ Run' });
    const before = await run.evaluate(e => getComputedStyle(e).transform);
    await run.hover();
    const after = await run.evaluate(e => getComputedStyle(e).transform);
    console.log('VISUAL', JSON.stringify({ ...metrics, hoverTransformBefore: before, hoverTransformAfter: after }));
  });
  await stage('mobile-run', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload(); await page.locator('.react-flow__node').first().waitFor();
    await page.getByRole('button', { name: '▶ Run' }).click();
    await page.getByTestId('run-dock').getByText('SUCCESS').first().waitFor({ timeout: 20000 });
    await snap('mobile-run');
    console.log('MOBILE_SCROLL', await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth })));
  });
} finally { writeFileSync(`${root}/misc-results.json`, JSON.stringify({ results, events }, null, 2)); await browser.close(); }
