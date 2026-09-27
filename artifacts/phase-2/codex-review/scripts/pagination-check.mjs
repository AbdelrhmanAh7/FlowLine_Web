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
const shot = async name => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 7500) });
  console.log(name);
};
try {
  await page.goto(identity.builderUrl);
  await page.locator('.react-flow__node').first().waitFor();
  const dock = page.getByTestId('run-dock');
  const latest = async () => {
    if (!(await dock.isVisible().catch(() => false))) return 0;
    return Number((await dock.innerText()).match(/#(\d+)/)?.[1] ?? 0);
  };
  let number = await latest();
  for (let i = 0; i < 16; i++) {
    await page.getByRole('button', { name: '▶ Run' }).click();
    await page.waitForTimeout(700);
    number = await latest();
    events.push({ event: 'run-complete', number });
  }
  await shot('82-sixteen-ui-runs');
  await page.goto(`/w/${identity.workspaceSlug}/runs`);
  await page.getByRole('list', { name: 'Runs' }).waitFor();
  await page.getByRole('button', { name: 'Load older' }).waitFor({ timeout: 10000 });
  await shot('83-load-older-visible');
  await page.getByRole('button', { name: 'Load older' }).click();
  await page.waitForTimeout(600);
  await shot('84-load-older-expanded');
  await page.goto(`/w/${identity.workspaceSlug}/flows`);
  await page.getByRole('region', { name: 'Key numbers' }).waitFor();
  await page.waitForTimeout(500);
  await shot('85-dashboard-real-kpis');
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('pagination-check-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'pagination-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await browser.close();
}
