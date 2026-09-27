import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const identity = JSON.parse(await fs.readFile(path.join(evidence, 'identity.json')));
const storageState = JSON.parse(await fs.readFile(path.join(evidence, 'session.json')));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', storageState, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [];
page.on('console', m => { if (m.type() === 'error') events.push({ event: 'console', text: m.text() }); });
page.on('pageerror', e => events.push({ event: 'pageerror', text: e.message }));
page.on('response', r => { if (r.status() >= 400) events.push({ event: 'response', status: r.status(), url: r.url() }); });
await context.tracing.start({ screenshots: true, snapshots: true });
const shot = async name => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 6000) });
  console.log(name);
};
const connect = async (from, to) => {
  const a = await page.locator(`.react-flow__node[data-id="${from}"] .react-flow__handle.source`).boundingBox();
  const b = await page.locator(`.react-flow__node[data-id="${to}"] .react-flow__handle.target`).boundingBox();
  await page.mouse.move(a.x + a.width/2, a.y + a.height/2);
  await page.mouse.down();
  await page.mouse.move(a.x+40, a.y+10, { steps: 5 });
  await page.mouse.move(b.x+b.width/2, b.y+b.height/2, { steps: 12 });
  await page.mouse.up();
};
const open = async id => {
  await page.locator(`.react-flow__node[data-id="${id}"]`).click();
  return page.getByTestId('node-drawer');
};
const close = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); };
try {
  await page.goto(identity.builderUrl);
  await page.locator('.react-flow__pane').waitFor();
  let ids = await page.locator('.react-flow__node').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
  events.push({ event: 'node-ids-before', ids });
  if (ids.length === 3) {
    await page.getByRole('button', { name: /Add node/ }).click();
    const palette = page.getByRole('dialog', { name: 'Add node' });
    await palette.getByLabel('Search nodes').fill('output');
    await palette.locator('#palette-output').dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 1050, y: 480 } });
    await close();
  }
  ids = await page.locator('.react-flow__node').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
  events.push({ event: 'node-ids', ids });
  if (ids.length !== 4) throw new Error(`Expected 4 nodes, got ${ids.length}`);
  const [trigger, http, transform, output] = ids;
  await connect(trigger, http);
  await connect(http, transform);
  await connect(transform, output);
  await shot('05-blank-connected');
  let drawer = await open(http);
  await shot('06-http-drawer');
  await drawer.getByLabel('URL (JSONata)').fill("'http://127.0.0.1:4011/pricing'");
  await close();
  drawer = await open(transform);
  await drawer.getByLabel('Expression (JSONata)').fill('{ "pricing": $steps.' + http + '.body }');
  await close();
  drawer = await open(output);
  await drawer.getByLabel('Output key').fill('result');
  await close();
  await page.getByTestId('save-status').getAttribute('data-status');
  await page.waitForTimeout(1500);
  await shot('07-blank-configured');
  events.push({ event: 'run-attributes', attrs: await page.getByRole('button', { name: '▶ Run' }).evaluate(e => ({ disabled: e.disabled, ariaDisabled: e.getAttribute('aria-disabled'), title: e.getAttribute('title') })) });
  await page.getByRole('button', { name: '▶ Run' }).click();
  await page.getByTestId('run-dock').waitFor();
  await page.waitForTimeout(10000);
  await shot('08-blank-run');
  const inspector = page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ });
  if (await inspector.count()) {
    await inspector.click();
    await shot('09-blank-inspector');
  }
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('blank-check-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'blank-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'blank-check.zip') });
  await browser.close();
}
