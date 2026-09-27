import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'artifacts/phase-1/codex-review';
const email = JSON.parse(readFileSync(`${root}/journey-events.json`, 'utf8')).email;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [], results = [];
page.on('console', m => { if (m.type() === 'error') events.push({ type: 'console', text: m.text().slice(0, 500) }); });
page.on('pageerror', e => events.push({ type: 'pageerror', text: e.message }));
page.on('response', r => { if (r.status() >= 400) events.push({ type: 'http', status: r.status(), url: r.url() }); });
async function snap(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${root}/screenshots/canvas-${name}.png` });
  const data = { name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 1600), nodes: await page.locator('.react-flow__node').count(), edges: await page.locator('.react-flow__edge').count() };
  results.push(data); console.log(JSON.stringify(data));
}
async function stage(name, fn) { try { await fn(); } catch (e) { console.log('STAGE_FAIL', name, e.stack || String(e)); await snap(`${name}-failure`); } }
async function connect(from, to, handle) {
  const f = page.locator(`.react-flow__node[data-id="${from}"] .react-flow__handle.source${handle ? `[data-handleid="${handle}"]` : ''}`);
  const t = page.locator(`.react-flow__node[data-id="${to}"] .react-flow__handle.target`);
  const a = await f.boundingBox(), b = await t.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  await page.mouse.up();
}
try {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Codex-Test-Pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/flows$/);
  await page.getByRole('button', { name: '+ New flow' }).click();
  await snap('new-flow-dialog');
  await stage('create-blank', async () => {
    const dialog = page.getByRole('dialog');
    console.log('DIALOG', await dialog.innerText());
    await dialog.getByRole('button', { name: /Blank flow/ }).click();
    await page.waitForURL(/\/flows\/[0-9a-f-]{36}$/);
    await page.getByText('Start with a trigger').waitFor();
    await snap('empty');
  });
  await stage('add-trigger', async () => {
    await page.getByRole('button', { name: '+ Add a trigger' }).click();
    await page.locator('.react-flow__node').first().waitFor();
    await snap('trigger');
  });
  await stage('palette-click', async () => {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Add node/ }).click();
    await snap('palette-open');
    await page.getByRole('option', { name: /JSON transform/ }).click();
    await snap('palette-click-transform');
  });
  await stage('slash-search', async () => {
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } });
    await page.keyboard.press('/');
    await page.getByRole('textbox', { name: 'Search nodes' }).fill('cond');
    await snap('slash-search');
    await page.getByRole('option', { name: /Condition/ }).click();
    await snap('search-condition');
  });
  await stage('palette-drag', async () => {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Add node/ }).click();
    await page.getByRole('option', { name: /Output/ }).dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 900, y: 450 } });
    await snap('drag-output');
  });
  await stage('connections', async () => {
    await page.keyboard.press('Escape');
    const ids = await page.locator('.react-flow__node').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
    console.log('NODE_IDS', ids);
    await connect(ids[0], ids[1]);
    await connect(ids[1], ids[2]);
    await connect(ids[2], ids[3], 'true');
    await snap('connected');
    const before = await page.locator('.react-flow__edge').count();
    await connect(ids[1], ids[2]);
    await snap('invalid-second-input');
    console.log('INVALID_EDGE_COUNT', before, await page.locator('.react-flow__edge').count());
  });
  await stage('keyboard-nudge', async () => {
    await page.keyboard.press('Escape');
    const node = page.locator('.react-flow__node').nth(1);
    await node.click();
    await page.keyboard.press('Escape');
    await node.click();
    const before = await node.evaluate(e => ({ x: parseFloat(e.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px/)?.[1] || '0'), y: parseFloat(e.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px/)?.[2] || '0'), transform: e.style.transform }));
    const vpBefore = await page.locator('.react-flow__viewport').getAttribute('style');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    const after = await node.evaluate(e => ({ x: parseFloat(e.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px/)?.[1] || '0'), y: parseFloat(e.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px/)?.[2] || '0'), transform: e.style.transform }));
    const vpAfter = await page.locator('.react-flow__viewport').getAttribute('style');
    console.log('NUDGE_DETAILED', JSON.stringify({ before, after, vpBefore, vpAfter }));
    await snap('nudge');
  });
} finally {
  writeFileSync(`${root}/canvas-results.json`, JSON.stringify({ results, events }, null, 2));
  await browser.close();
}
