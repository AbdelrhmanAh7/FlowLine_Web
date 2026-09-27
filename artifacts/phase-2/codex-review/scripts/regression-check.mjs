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
page.on('console', m => { if (m.type() === 'error') events.push({ event: 'console', text: m.text().replace(/params:\s*[^\n]+/g, 'params: [redacted]') }); });
page.on('response', r => { if (r.status() >= 400) events.push({ event: 'response', status: r.status(), url: r.url() }); });
await context.tracing.start({ screenshots: true, snapshots: true });
const shot = async name => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 6000), nodeCount: await page.locator('.react-flow__node').count(), saveStatus: await page.getByTestId('save-status').getAttribute('data-status').catch(() => null) });
  console.log(name);
};
try {
  await page.goto(identity.builderUrl);
  await page.locator('.react-flow__node').first().waitFor();
  await page.locator('.react-flow__node').nth(2).click();
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__node').nth(2).click();
  await page.keyboard.press('Control+d');
  await shot('75-node-duplicated');
  await page.keyboard.press('Delete');
  await shot('76-node-deleted');
  await page.keyboard.press('Control+z');
  await shot('77-undo-restored');
  await page.keyboard.press('Control+Shift+z');
  await shot('78-redo-removed');
  await page.waitForTimeout(1300);
  await shot('79-autosave-after-redo');
  await context.setOffline(true);
  await page.getByText('Offline mode').waitFor({ timeout: 5000 });
  await page.getByLabel('Flow name').fill('Codex offline regression');
  await shot('80-offline-banner-draft');
  await context.setOffline(false);
  await page.getByTestId('save-status').locator('[data-status="saved"]').waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(900);
  await page.reload();
  await page.locator('.react-flow__node').first().waitFor();
  await shot('81-offline-edit-persisted');
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('regression-check-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'regression-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'regression-check.zip') });
  await browser.close();
}
