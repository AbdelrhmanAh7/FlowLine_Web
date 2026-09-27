import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'artifacts/phase-1/codex-review';
const email = JSON.parse(readFileSync(`${root}/journey-events.json`, 'utf8')).email;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [], results = [];
page.on('console', m => { if (m.type() === 'error') events.push({ type: 'console', text: m.text().slice(0, 600) }); });
page.on('pageerror', e => events.push({ type: 'pageerror', text: e.message }));
page.on('response', r => { if (r.status() >= 400) events.push({ type: 'http', status: r.status(), url: r.url() }); });
async function snap(name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${root}/screenshots/final-${name}.png` });
  const data = { name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 1800), nodes: await page.locator('.react-flow__node').count(), edges: await page.locator('.react-flow__edge').count() };
  results.push(data); console.log(JSON.stringify(data));
}
async function stage(name, fn) { try { await fn(); } catch (e) { console.log('STAGE_FAIL', name, e.stack || String(e)); await snap(`${name}-failure`); } }
async function pos(node) { return node.evaluate(e => { const m = e.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px/); return { x: Number(m?.[1]), y: Number(m?.[2]) }; }); }
async function connect(from, to) {
  const a = await page.locator(`.react-flow__node[data-id="${from}"] .react-flow__handle.source`).boundingBox();
  const b = await page.locator(`.react-flow__node[data-id="${to}"] .react-flow__handle.target`).boundingBox();
  await page.mouse.move(a.x + a.width/2, a.y + a.height/2); await page.mouse.down();
  await page.mouse.move(a.x + 30, a.y + 5, { steps: 5 });
  await page.mouse.move(b.x + b.width/2, b.y + b.height/2, { steps: 12 }); await page.mouse.up();
}
try {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email); await page.getByLabel('Password').fill('Codex-Test-Pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/flows$/);
  await stage('canvas-keyboard', async () => {
    await page.goto('/w/codex-explore/flows/35dbf4db-ac08-4aa4-886b-b3b3eb5e8e87');
    await page.locator('.react-flow__node').first().waitFor();
    const node = page.locator('.react-flow__node').nth(1);
    await node.click();
    const p0 = await pos(node);
    await page.keyboard.press('ArrowRight');
    const p1 = await pos(node);
    await page.keyboard.press('Shift+ArrowDown');
    const p2 = await pos(node);
    console.log('NUDGE_ISOLATED', JSON.stringify({ p0, p1, p2, right: p1.x-p0.x, shiftDown: p2.y-p1.y }));
    await snap('nudge-isolated');
    const before = await page.locator('.react-flow__edge').count();
    const ids = await page.locator('.react-flow__node').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
    await connect(ids[1], ids[2]);
    console.log('DUPLICATE_CONNECTION', JSON.stringify({ before, after: await page.locator('.react-flow__edge').count(), status: await page.getByRole('status').allTextContents() }));
    await snap('duplicate-connection');
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const zoomIn = await page.locator('.react-flow__viewport').getAttribute('style');
    await page.keyboard.press('Control+0');
    const fit = await page.locator('.react-flow__viewport').getAttribute('style');
    console.log('ZOOM', JSON.stringify({ zoomIn, fit }));
  });
  await stage('drawer-persistence', async () => {
    const node = page.locator('.react-flow__node').nth(1);
    await node.click();
    await page.getByTestId('node-drawer').getByLabel('Name').fill('QA Transform');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.getByTestId('save-status').getByText('Saved', { exact: true }).waitFor({ timeout: 15000 });
    await page.reload(); await page.locator('.react-flow__node').nth(1).waitFor();
    await page.locator('.react-flow__node').nth(1).click();
    console.log('PERSISTED_NAME', await page.getByTestId('node-drawer').getByLabel('Name').inputValue());
    await snap('drawer-persisted');
  });
  await stage('repair-rerun', async () => {
    await page.goto('/w/codex-explore/flows/54b3471b-b85f-474e-ba77-637f9ff687b8');
    await page.locator('.react-flow__node[data-id="normalise"]').waitFor();
    await page.locator('.react-flow__node[data-id="normalise"]').click();
    await page.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill('{ "name": lead.name, "size": lead.employees }');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.getByTestId('save-status').getByText('Saved', { exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('complementary', { name: 'Workspace navigation' }).getByRole('link', { name: 'Run history' }).click();
    await page.waitForURL(/\/runs$/);
    await page.getByRole('button', { name: /#3/ }).click();
    await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Normalise lea/ }).click();
    await page.getByTestId('step-panel').getByRole('button', { name: /Re-run from this step/ }).click();
    await page.getByRole('button', { name: /#4/ }).waitFor({ timeout: 15000 });
    await snap('rerun-repaired');
  });
  await stage('filters', async () => {
    await page.goto('/w/codex-explore/runs');
    await page.getByText('All runs', { exact: true }).waitFor();
    console.log('FILTER_ELEMENTS', JSON.stringify(await page.locator('main').getByText('Failed', { exact: true }).evaluateAll(els => els.map(e => ({ tag: e.tagName, role: e.getAttribute('role'), outer: e.outerHTML.slice(0, 300) })))));
    await page.getByText('Failed', { exact: true }).first().click();
    await snap('filtered-failed');
    await page.getByRole('textbox', { name: 'Search flows or run number' }).fill('no-such-flow-xyz');
    await snap('filtered-empty');
    await page.getByText('Clear filters', { exact: true }).click();
    await snap('filters-cleared');
  });
} finally {
  writeFileSync(`${root}/final-results.json`, JSON.stringify({ results, events }, null, 2));
  await browser.close();
}
