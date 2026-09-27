import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const identity = JSON.parse(await fs.readFile(path.join(evidence, 'identity.json')));
const state = JSON.parse(await fs.readFile(path.join(evidence, 'session.json')));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', storageState: state, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [];
const shot = async name => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 6500) });
  console.log(name);
};
try {
  await page.goto(`/w/${identity.workspaceSlug}/flows`);
  await page.getByRole('button', { name: '+ New flow' }).click();
  await page.getByText('Start with a trigger').waitFor();
  const pane = page.locator('.react-flow__pane');
  for (const [search, selector, x] of [['schedule', '#palette-trigger\\.schedule', 400], ['output', '#palette-output', 700]]) {
    await page.getByRole('button', { name: /Add node/ }).click();
    const palette = page.getByRole('dialog', { name: 'Add node' });
    await palette.getByLabel('Search nodes').fill(search);
    await palette.locator(selector).dragTo(pane, { targetPosition: { x, y: 480 } });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  }
  const ids = await page.locator('.react-flow__node').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
  const a = await page.locator(`.react-flow__node[data-id="${ids[0]}"] .react-flow__handle.source`).boundingBox();
  const b = await page.locator(`.react-flow__node[data-id="${ids[1]}"] .react-flow__handle.target`).boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2); await page.mouse.down();
  await page.mouse.move(a.x+40,a.y+10,{steps:5}); await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12}); await page.mouse.up();
  await page.locator(`.react-flow__node[data-id="${ids[0]}"]`).click();
  const drawer = page.getByTestId('node-drawer');
  await drawer.getByLabel('Cron (minute hour day month weekday)').fill('0 9 * * *');
  await drawer.getByLabel('Time zone').selectOption('Africa/Cairo');
  await drawer.getByLabel('If runs were missed (e.g. worker down)').selectOption('run_once');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click();
  await drawer.getByLabel('Output key').fill('tick');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  await shot('97-schedule-flow-ready');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('dialog', { name: 'Triggers' }).waitFor({ timeout: 10000 });
  await shot('98-schedule-published');
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('schedule-publish-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'schedule-publish.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await browser.close();
}
