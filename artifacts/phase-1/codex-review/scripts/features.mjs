import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'artifacts/phase-1/codex-review';
const email = JSON.parse(readFileSync(`${root}/journey-events.json`, 'utf8')).email;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [], results = [];
page.on('console', m => { if (m.type() === 'error') events.push({ type: 'console', text: m.text().slice(0, 1000) }); });
page.on('pageerror', e => events.push({ type: 'pageerror', text: e.message }));
page.on('response', r => { if (r.status() >= 400) events.push({ type: 'http', status: r.status(), url: r.url() }); });
async function snap(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${root}/screenshots/feature-${name}.png` });
  const data = { name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 3000), buttons: (await page.getByRole('button').allTextContents()).slice(0, 50) };
  results.push(data);
  console.log(JSON.stringify(data));
}
async function stage(name, fn) {
  try { await fn(); }
  catch (e) { console.log('STAGE_FAIL', name, e.stack || String(e)); await snap(`${name}-failure`); }
}
try {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Codex-Test-Pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/w\//, { timeout: 15000 });
  await snap('dashboard');
  await stage('dashboard-loaded', async () => { await page.getByRole('heading', { name: 'Flows' }).waitFor(); await snap('dashboard-loaded'); });
  const nav = page.getByRole('complementary', { name: 'Workspace navigation' });
  for (const [name, link] of [['integrations', 'Integrations'], ['templates', 'Templates'], ['settings', 'Settings']]) {
    await stage(name, async () => { await nav.getByRole('link', { name: link }).click(); await page.locator('main h1').first().waitFor(); await snap(name); });
  }
  await stage('flows', async () => { await nav.getByRole('link', { name: 'Flows' }).click(); await page.getByText('Lead Qualifier').first().waitFor(); await snap('flows'); });
  await stage('builder', async () => { await page.getByRole('link', { name: /Lead Qualifier/ }).first().click(); await page.locator('.react-flow__node').first().waitFor(); await snap('builder'); });
  await stage('drawer', async () => {
    await page.locator('.react-flow__node[data-id="normalise"]').click();
    await page.getByTestId('node-drawer').waitFor();
    await snap('drawer');
  });
  await stage('typing-guard', async () => {
    const drawer = page.getByTestId('node-drawer');
    const field = drawer.getByLabel('Name');
    await field.click();
    await field.press('Backspace');
    await field.press('Delete');
    await field.press('Control+Enter');
    console.log('TYPING_GUARD', JSON.stringify({ nodes: await page.locator('.react-flow__node').count(), dock: await page.getByTestId('run-dock').count(), name: await field.inputValue() }));
    await snap('typing-guard');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });
  await stage('keyboard', async () => {
    const node = page.locator('.react-flow__node[data-id="normalise"]');
    await node.click();
    await page.keyboard.press('Escape');
    await node.click();
    const before = await node.boundingBox();
    const zoom = await page.locator('.react-flow__viewport').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    const after = await node.boundingBox();
    console.log('NUDGE', JSON.stringify({ dx: (after.x - before.x) / zoom, dy: (after.y - before.y) / zoom }));
    await page.keyboard.press('Control+d');
    console.log('DUPLICATE', await page.locator('.react-flow__node').count());
    await page.keyboard.press('Delete');
    console.log('DELETE', await page.locator('.react-flow__node').count());
    await page.keyboard.press('Control+z');
    console.log('UNDO', await page.locator('.react-flow__node').count());
    await page.keyboard.press('Control+Shift+z');
    console.log('REDO', await page.locator('.react-flow__node').count());
    await snap('keyboard');
  });
  await stage('failed-run', async () => {
    const node = page.locator('.react-flow__node[data-id="normalise"]');
    await node.click();
    await page.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill('$number("x")');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByTestId('save-status').locator('[data-status="saved"]').count().catch(() => {});
    await page.getByRole('button', { name: '▶ Run' }).click();
    await page.getByTestId('run-dock').getByText('FAILED').first().waitFor({ timeout: 20000 });
    await snap('failed-run');
    await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
    await page.waitForURL(/\/runs\?run=/, { timeout: 10000 });
    await snap('failed-inspector');
  });
  await stage('inspector', async () => {
    const panel = page.getByTestId('step-panel');
    await panel.waitFor();
    console.log('TABS', await panel.getByRole('tab').allTextContents());
    await panel.getByRole('tab', { name: 'Input' }).click(); await snap('inspector-input');
    await panel.getByRole('tab', { name: 'Output' }).click(); await snap('inspector-output');
    await panel.getByRole('tab', { name: 'Error' }).click(); await snap('inspector-error');
    await panel.getByRole('button', { name: /Re-run from this step/ }).click(); await snap('rerun');
  });
  await stage('filters', async () => {
    console.log('RUN_CONTROLS', JSON.stringify(await page.locator('main button, main input').evaluateAll(els => els.map(e => ({ tag: e.tagName, text: e.innerText, placeholder: e.getAttribute('placeholder') })).slice(0, 50))));
    await snap('runs-before-filters');
  });
} finally {
  writeFileSync(`${root}/feature-results.json`, JSON.stringify({ email, results, events }, null, 2));
  await browser.close();
}
