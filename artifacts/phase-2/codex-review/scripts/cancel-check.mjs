import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const ids = JSON.parse(await fs.readFile(path.join(evidence, 'lost-ids.json')));
const identity = JSON.parse(await fs.readFile(path.join(evidence, 'identity.json')));
const state = JSON.parse(await fs.readFile(path.join(evidence, 'session.json')));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', storageState: state, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [];
page.on('console', m => { if (m.type() === 'error') events.push({ event: 'console', text: m.text().replace(/params:\s*[^\n]+/g, 'params: [redacted]') }); });
page.on('response', r => { if (r.status() >= 400) events.push({ event: 'response', status: r.status(), url: r.url() }); });
await context.tracing.start({ screenshots: true, snapshots: true });
const shot = async (p, name) => {
  await p.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: p.url(), text: (await p.locator('body').innerText()).slice(0, 7000) });
  console.log(name);
};
try {
  const fault = await page.request.post('http://127.0.0.1:4010/__fake/fault', { data: { provider: 'google_sheets', pathPattern: ids.sheetId, mode: 'timeout', times: 1 } });
  events.push({ event: 'fault', status: fault.status(), body: await fault.text() });
  await page.goto(ids.flowUrl);
  await page.getByRole('button', { name: '▶ Run' }).dblclick();
  await page.waitForTimeout(1500);
  await shot(page, '39-doubleclick-running');
  const other = await context.newPage();
  await other.goto(identity.builderUrl);
  await other.getByRole('button', { name: '▶ Run' }).click();
  await other.waitForTimeout(2500);
  await shot(other, '40-other-flow-during-slow-run');
  await page.getByTestId('run-dock').getByRole('button', { name: 'Cancel run' }).click();
  await page.waitForTimeout(2000);
  await shot(page, '41-cancelled');
  await other.close();
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot(page, 'cancel-check-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'cancel-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'cancel-check.zip') });
  await browser.close();
}
