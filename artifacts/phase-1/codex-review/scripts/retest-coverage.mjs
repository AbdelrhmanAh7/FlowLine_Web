import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'artifacts/phase-1/codex-review';
const prior = JSON.parse(readFileSync(`${root}/retest-journey-results.json`, 'utf8'));
const result = { revision: 'c35485e', stages: {}, events: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', m => { if (m.type() === 'error') result.events.push({ type: 'console', text: m.text().slice(0, 500) }); });
page.on('pageerror', e => result.events.push({ type: 'pageerror', text: e.message }));
page.on('response', r => { if (r.status() >= 400) result.events.push({ type: 'http', status: r.status(), url: r.url() }); });
async function snap(name) { await page.screenshot({ path: `${root}/screenshots/retest-${name}.png` }); }
async function stage(name, fn) {
  try { result.stages[name] = await fn(); console.log(name, JSON.stringify(result.stages[name])); }
  catch (e) { result.stages[name] = { error: String(e) }; console.log('FAIL', name, e.stack); await snap(`${name}-failure`); }
}
async function pos(n) { return n.evaluate(e => { const m = e.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px/); return { x: Number(m?.[1]), y: Number(m?.[2]) }; }); }
async function connect(from, to) {
  const a = await from.boundingBox(), b = await to.boundingBox();
  if (!a || !b) throw Error('Connection handle missing');
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2); await page.mouse.down();
  await page.mouse.move(a.x+35,a.y+5,{steps:5});
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:16}); await page.mouse.up();
  await page.waitForTimeout(120);
}
function node(id) { return page.locator(`.react-flow__node[data-id="${id}"]`); }
function source(id) { return node(id).locator('.react-flow__handle.source').first(); }
function target(id) { return node(id).locator('.react-flow__handle.target').first(); }
async function clear() { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }
async function selected() { return page.locator('.react-flow__node.selected').evaluateAll(es => es.map(e => e.getAttribute('data-id'))); }
async function addFromPalette(label, x, y) {
  await clear();
  await page.getByRole('button', { name: /Add node/ }).click();
  await page.getByRole('option', { name: new RegExp(label) }).dragTo(page.locator('.react-flow__pane'), { targetPosition: { x, y } });
  await page.waitForTimeout(180);
  await clear();
}
try {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(prior.email);
  await page.getByLabel('Password').fill('Codex-Test-Pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  try { await page.waitForURL(/\/w\//, { timeout: 10000 }); }
  catch (e) { await snap('login-failure'); console.log('LOGIN', page.url(), (await page.locator('body').innerText()).slice(0, 1000)); throw e; }

  if (!process.argv.includes('--remaining')) await stage('cr01', async () => {
    await page.goto(prior.stages.journey.flowUrl); await node('normalise').waitFor();
    await node('normalise').click();
    const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, className: document.activeElement?.className }));
    const p0 = await pos(node('normalise'));
    await page.keyboard.press('ArrowRight'); const p1 = await pos(node('normalise'));
    await page.keyboard.press('Shift+ArrowDown'); const p2 = await pos(node('normalise'));
    await snap('cr01-nudge');
    await page.getByTestId('save-status').getByText('Saved', { exact: true }).waitFor({ timeout: 15000 });
    await page.reload(); await node('normalise').waitFor(); const p3 = await pos(node('normalise'));
    await snap('cr01-reloaded');
    return { focus, p0, p1, p2, p3, right: p1.x-p0.x, shiftDown: p2.y-p1.y };
  });

  if (!process.argv.includes('--remaining')) await stage('drawer-swipe', async () => {
    await page.setViewportSize({ width: 1024, height: 800 }); await page.reload(); await node('normalise').waitFor();
    await node('normalise').click(); await page.getByTestId('node-drawer').waitFor();
    await snap('drawer-before-swipe');
    const header = page.getByTestId('node-drawer').locator('div').first();
    const b = await header.boundingBox();
    await page.mouse.move(b.x+35,b.y+26); await page.mouse.down();
    await page.mouse.move(b.x+170,b.y+26,{steps:12}); await page.mouse.up();
    await page.waitForTimeout(300); await snap('drawer-after-swipe');
    return { drawerCount: await page.getByTestId('node-drawer').count() };
  });

  await stage('canvas-setup', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/w/codex-retest/flows');
    await page.getByRole('button', { name: '+ New flow' }).click();
    await page.waitForURL(/\/flows\/[0-9a-f-]{36}$/);
    const scratchUrl = page.url();
    await page.getByRole('button', { name: '+ Add a trigger' }).click();
    await clear();
    await addFromPalette('JSON transform', 370, 220);
    await addFromPalette('JSON transform', 660, 220);
    await addFromPalette('Output', 900, 220);
    const ids = await page.locator('.react-flow__node').evaluateAll(es => es.map(e => e.getAttribute('data-id')));
    await snap('canvas-scratch');
    return { scratchUrl, ids, positions: await page.locator('.react-flow__node').evaluateAll(es => es.map(e => ({ id:e.getAttribute('data-id'), rect: e.getBoundingClientRect().toJSON() }))) };
  });
  await stage('invalid-connections', async () => {
    const [trigger, a, b, output] = result.stages['canvas-setup'].ids;
    const rows = [];
    const attempt = async (name, from, to, expected) => {
      const before = await page.locator('.react-flow__edge').count();
      await connect(from,to); const after = await page.locator('.react-flow__edge').count();
      const statuses = await page.getByRole('status').allTextContents();
      await snap(`connection-${name}`);
      rows.push({ name, before, after, statuses, expected });
    };
    await attempt('self', source(a), target(a), 'cannot connect to itself');
    await attempt('valid-setup', source(a), target(b), 'edge added');
    await attempt('loop', source(b), target(a), 'create a loop');
    await attempt('second-input', source(trigger), target(b), 'already has an input');
    const beforeNoHandles = await page.locator('.react-flow__edge').count();
    const triggerTargetHandles = await target(trigger).count();
    const outputSourceHandles = await source(output).count();
    // The unavailable directions expose no drag handle. Dragging from the nearest node body
    // must not create an edge either.
    const tb = await node(trigger).boundingBox(), ob = await node(output).boundingBox();
    await page.mouse.move(ob.x+ob.width/2,ob.y+ob.height/2); await page.mouse.down();
    await page.mouse.move(tb.x+tb.width/2,tb.y+tb.height/2,{steps:15}); await page.mouse.up();
    const afterBodyDrag = await page.locator('.react-flow__edge').count();
    await snap('connection-unavailable-handles');
    return { rows, triggerTargetHandles, outputSourceHandles, beforeNoHandles, afterBodyDrag };
  });
  await stage('multi-select-delete', async () => {
    const [trigger, a, b, output] = result.stages['canvas-setup'].ids;
    await clear();
    const ar = await node(a).boundingBox(), br = await node(b).boundingBox();
    const start = { x: Math.min(ar.x,br.x)-20, y: Math.min(ar.y,br.y)-20 };
    const end = { x: Math.max(ar.x+ar.width,br.x+br.width)+20, y: Math.max(ar.y+ar.height,br.y+br.height)+20 };
    await page.keyboard.down('Shift'); await page.mouse.move(start.x,start.y); await page.mouse.down();
    await page.mouse.move(end.x,end.y,{steps:20}); await page.mouse.up(); await page.keyboard.up('Shift');
    const boxSelected = await selected(); await snap('multiselect-shift-box');
    await page.keyboard.press('Delete');
    const afterDelete = await page.locator('.react-flow__node').evaluateAll(es=>es.map(e=>e.getAttribute('data-id')));
    await snap('multiselect-box-deleted');
    await clear(); await node(trigger).click(); await page.keyboard.down('Control'); await node(output).click(); await page.keyboard.up('Control');
    const ctrlSelected = await selected(); await snap('multiselect-ctrl-click');
    await page.keyboard.press('Backspace');
    const afterBackspace = await page.locator('.react-flow__node').evaluateAll(es=>es.map(e=>e.getAttribute('data-id')));
    await snap('multiselect-backspace-deleted');
    return { boxSelected, afterDelete, ctrlSelected, afterBackspace };
  });

  await stage('settings', async () => {
    await page.goto('/w/codex-retest/settings'); await page.getByRole('button', { name: 'General', exact: true }).click();
    const name = page.getByLabel('Workspace name'), tz = page.getByLabel('Schedule timezone');
    const original = { name: await name.inputValue(), timezone: await tz.inputValue() };
    await name.fill('Codex Retest Verified'); await tz.selectOption('Africa/Cairo');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('status').filter({ hasText: 'Workspace settings saved' }).waitFor();
    await snap('settings-saved'); await page.reload();
    await page.getByRole('button', { name: 'General', exact: true }).click();
    const persisted = { name: await name.inputValue(), timezone: await tz.inputValue() };
    await snap('settings-reloaded');
    const disabled = [];
    for (const [tab, button] of [['Members','Invite'],['API keys','Create key'],['Billing & credits','Upgrade']]) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      const btn = page.getByRole('button', { name: button, exact: true });
      await btn.focus();
      const info = await btn.evaluate(e => ({ ariaDisabled:e.getAttribute('aria-disabled'), reason:document.getElementById(e.getAttribute('aria-describedby'))?.textContent?.trim() }));
      disabled.push({ tab, button, ...info }); await snap(`settings-disabled-${button.toLowerCase().replaceAll(' ','-')}`);
    }
    return { original, persisted, disabled };
  });

  if (!process.argv.includes('--remaining')) await stage('responsive', async () => {
    const pages = [['dashboard','flows'],['runs','runs'],['templates','templates'],['integrations','integrations'],['settings','settings']];
    const rows = [];
    for (const width of [1440,1024,375]) {
      await page.setViewportSize({ width, height: 812 });
      for (const [name,path] of pages) {
        await page.goto(`/w/codex-retest/${path}`);
        await page.locator('main').waitFor();
        await page.waitForTimeout(350);
        const measure = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, main: document.querySelector('main')?.scrollWidth, title: document.querySelector('main h1')?.textContent }));
        rows.push({ name, width, ...measure });
        await snap(`responsive-${name}-${width}`);
      }
    }
    return rows;
  });
} finally {
  writeFileSync(`${root}/retest-coverage-results.json`, JSON.stringify(result, null, 2));
  await browser.close();
}
