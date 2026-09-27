import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const identity = JSON.parse(await fs.readFile(path.join(evidence, 'identity.json')));
const repair = JSON.parse(await fs.readFile(path.join(evidence, 'repair-check.json'))).find(x => x.event === 'flow-nodes');
const schedule = JSON.parse(await fs.readFile(path.join(evidence, 'schedule-publish.json'))).find(x => x.name === '98-schedule-published');
const state = JSON.parse(await fs.readFile(path.join(evidence, 'session.json')));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', storageState: state, viewport: { width: 1440, height: 900 } });
const settings = await context.newPage();
const events = [];
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 6300) });
  console.log(name);
};
try {
  await settings.goto(`/w/${identity.workspaceSlug}/settings`);
  await settings.getByRole('button', { name: 'Usage & limits' }).click();
  await settings.getByLabel('Concurrent runs').fill('1');
  await settings.getByLabel('Queued runs').fill('1');
  await settings.getByRole('button', { name: 'Save limits' }).click();
  await settings.getByText('Usage limits saved').waitFor({ timeout: 10000 });
  await shot(settings, '99-queue-limits-saved');
  const fault = await settings.request.post('http://127.0.0.1:4010/__fake/fault', { data: { provider: 'slack', pathPattern: 'chat.postMessage', mode: 'timeout', times: 1 } });
  events.push({ event: 'fault', status: fault.status(), body: await fault.text() });
  const slow = await context.newPage();
  await slow.goto(repair.flowUrl);
  await slow.locator('.react-flow__node').first().waitFor();
  await slow.getByRole('button', { name: '▶ Run' }).click();
  await slow.waitForTimeout(600);
  await shot(slow, '100-queue-slow-running');
  const queued = await context.newPage();
  await queued.goto(identity.builderUrl);
  await queued.locator('.react-flow__node').first().waitFor();
  await queued.getByRole('button', { name: '▶ Run' }).click();
  await queued.waitForTimeout(500);
  await shot(queued, '101-queue-second-run');
  const third = await context.newPage();
  await third.goto(schedule.url);
  await third.locator('.react-flow__node').first().waitFor();
  await third.getByRole('button', { name: '▶ Run' }).click();
  await third.waitForTimeout(500);
  await shot(third, '102-queue-third-refused');
  if (await slow.getByTestId('run-dock').getByRole('button', { name: 'Cancel run' }).count()) {
    await slow.getByTestId('run-dock').getByRole('button', { name: 'Cancel run' }).click();
  }
  await slow.close(); await queued.close(); await third.close();
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot(settings, 'queue-check-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  try {
    await settings.goto(`/w/${identity.workspaceSlug}/settings`);
    await settings.getByRole('button', { name: 'Usage & limits' }).click();
    await settings.getByLabel('Concurrent runs').fill('3');
    await settings.getByLabel('Queued runs').fill('100');
    await settings.getByRole('button', { name: 'Save limits' }).click();
    await settings.getByText('Usage limits saved').waitFor({ timeout: 10000 });
    events.push({ event: 'limits-restored', ok: true });
  } catch (error) {
    events.push({ event: 'limits-restored', ok: false, error: String(error) });
  }
  await fs.writeFile(path.join(evidence, 'queue-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await browser.close();
}
