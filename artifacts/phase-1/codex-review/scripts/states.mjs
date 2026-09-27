import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'artifacts/phase-1/codex-review';
const email = JSON.parse(readFileSync(`${root}/journey-events.json`, 'utf8')).email;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', extraHTTPHeaders: { origin: 'http://localhost:3100' }, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [], results = [];
page.on('console', m => { if (m.type() === 'error') events.push({ type: 'console', text: m.text().slice(0, 500) }); });
page.on('pageerror', e => events.push({ type: 'pageerror', text: e.message }));
page.on('response', r => { if (r.status() >= 400) events.push({ type: 'http', status: r.status(), url: r.url() }); });
async function snap(name) {
  await page.screenshot({ path: `${root}/screenshots/state-${name}.png` });
  const data = { name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 1800) };
  results.push(data); console.log(JSON.stringify(data));
}
async function stage(name, fn) { try { await fn(); } catch (e) { console.log('STAGE_FAIL', name, e.stack || String(e)); await snap(`${name}-failure`); } }
async function fault(data) { const r = await page.request.post('/api/test/faults', { data }); console.log('FAULT', JSON.stringify(data), r.status()); }
const nav = page.getByRole('complementary', { name: 'Workspace navigation' });
try {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Codex-Test-Pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/w\//, { timeout: 15000 });
  const slug = new URL(page.url()).pathname.split('/')[2];
  for (const [name, label] of [['integrations', 'Integrations'], ['templates', 'Templates'], ['settings', 'Settings']]) {
    await stage(name, async () => {
      await nav.getByRole('link', { name: label }).click();
      await page.waitForURL(new RegExp(`/${name}$`));
      await page.locator('main h1').first().waitFor();
      await snap(name);
    });
  }
  await stage('builder', async () => {
    await nav.getByRole('link', { name: 'Flows' }).click();
    await page.waitForURL(/\/flows$/);
    await page.getByRole('link', { name: /Lead Qualifier/ }).first().click();
    await page.waitForURL(/\/flows\/[0-9a-f-]{36}$/);
    await page.locator('.react-flow__node').first().waitFor();
    await snap('builder');
  });
  const flowUrl = page.url();
  await stage('save-failure', async () => {
    await fault({ kind: 'save', count: 10, status: 500 });
    await page.getByLabel('Flow name').fill('Codex Save Retry');
    await page.getByTestId('save-status').locator('[data-status="retrying"]').count().catch(() => {});
    await page.getByTestId('save-status').getByText(/Failed to save — retrying/).waitFor({ timeout: 10000 });
    await snap('save-retrying');
    await page.getByTestId('save-status').getByRole('button', { name: 'Retry' }).waitFor({ timeout: 20000 });
    await snap('save-failed');
    await fault({ reset: true });
    await page.getByTestId('save-status').getByRole('button', { name: 'Retry' }).click();
    await page.getByTestId('save-status').getByText('Saved', { exact: true }).waitFor({ timeout: 15000 });
    await snap('save-recovered');
  });
  await stage('load-failure', async () => {
    await fault({ kind: 'load', count: 4, status: 500 });
    await page.reload();
    await page.getByText("Couldn't load this flow").waitFor({ timeout: 20000 });
    await snap('load-error');
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.locator('.react-flow__node').first().waitFor({ timeout: 15000 });
    await snap('load-recovered');
    await fault({ reset: true });
  });
  await stage('offline', async () => {
    await context.setOffline(true);
    await page.getByLabel('Flow name').fill('Codex Offline Draft');
    await page.getByText('Offline mode').waitFor({ timeout: 5000 });
    const run = page.getByRole('button', { name: '▶ Run' });
    console.log('OFFLINE_RUN', JSON.stringify({ disabled: await run.isDisabled(), ariaDisabled: await run.getAttribute('aria-disabled'), description: await run.getAttribute('aria-describedby') }));
    await snap('offline');
    await context.setOffline(false);
    await page.getByTestId('save-status').getByText('Saved', { exact: true }).waitFor({ timeout: 15000 });
    await snap('reconnected');
  });
  await stage('responsive', async () => {
    for (const width of [1440, 1280, 1279, 1024, 768, 767, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(flowUrl);
      await page.locator('.react-flow__node').first().waitFor();
      const metric = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, sidebar: document.querySelector('aside[aria-label="Workspace navigation"]')?.getBoundingClientRect().width ?? null }));
      console.log('RESPONSIVE', JSON.stringify(metric));
      await snap(`builder-${width}`);
      if (width === 1440 || width === 1024 || width === 375) {
        await page.locator('.react-flow__node[data-id="normalise"]').click();
        const drawer = page.getByTestId('node-drawer');
        await drawer.waitFor();
        console.log('DRAWER', width, JSON.stringify(await drawer.boundingBox()));
        await snap(`drawer-${width}`);
      }
    }
  });
  await stage('reduced-motion-focus', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(flowUrl);
    await page.getByRole('button', { name: '▶ Run' }).waitFor();
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return { tag: e.tagName, text: e.textContent?.trim().slice(0, 50), outlineWidth: c.outlineWidth, outlineColor: c.outlineColor, animationDuration: c.animationDuration, transitionDuration: c.transitionDuration }; });
    console.log('FOCUS_REDUCED', JSON.stringify(active));
    await snap('reduced-motion-focus');
  });
  await stage('filters', async () => {
    await nav.getByRole('link', { name: 'Run history' }).click();
    await page.waitForURL(/\/runs$/);
    await page.getByRole('button', { name: 'Failed', exact: true }).click();
    await snap('filter-failed');
    await page.getByRole('textbox', { name: 'Search flows or run number' }).fill('no-such-flow-xyz');
    await snap('filter-empty');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await snap('filter-cleared');
  });
  console.log('FLOW_URL', flowUrl, 'SLUG', slug);
} finally {
  await context.setOffline(false).catch(() => {});
  await fault({ reset: true }).catch(() => {});
  writeFileSync(`${root}/state-results.json`, JSON.stringify({ email, results, events }, null, 2));
  await browser.close();
}
