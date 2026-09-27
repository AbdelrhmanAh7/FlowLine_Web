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
page.on('console', m => { if (m.type() === 'error') events.push({ event: 'console', text: m.text() }); });
page.on('response', r => { if (r.status() >= 400) events.push({ event: 'response', status: r.status(), url: r.url() }); });
await context.tracing.start({ screenshots: true, snapshots: true });
const shot = async name => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 6500) });
  console.log(name);
};
const close = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); };
try {
  await page.goto(identity.builderUrl);
  await page.locator('.react-flow__node').first().waitFor();
  const ids = await page.locator('.react-flow__node').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
  const [trigger, http, transform, output] = ids;
  for (const [name, url] of [['metadata', 'http://169.254.169.254/latest/meta-data/'], ['localhost-db', 'http://localhost:5433']]) {
    await page.locator(`.react-flow__node[data-id="${http}"]`).click();
    await page.getByTestId('node-drawer').getByLabel('URL (JSONata)').fill(`'${url}'`);
    await close();
    await page.getByTestId('save-status').locator('[data-status="saved"]').waitFor({ timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: '▶ Run' }).click();
    await page.getByTestId('run-dock').getByText('FAILED').first().waitFor({ timeout: 30000 });
    await shot(`25-ssrf-${name}`);
    await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
    await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /HTTP request/ }).first().click();
    await shot(`26-ssrf-${name}-inspector`);
    await page.goto(identity.builderUrl);
    await page.locator(`.react-flow__node[data-id="${http}"]`).waitFor();
  }
  await page.locator(`.react-flow__node[data-id="${http}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('URL (JSONata)').fill("'http://127.0.0.1:4011/pricing'");
  await close();
  await page.locator(`.react-flow__node[data-id="${transform}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill('{');
  await close();
  await shot('27-invalid-jsonata');
  await page.locator(`.react-flow__node[data-id="${transform}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill(`$steps.${output}.value`);
  await close();
  await shot('28-non-upstream-reference');
  await page.locator(`.react-flow__node[data-id="${transform}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill(`{ "pricing": $steps.${http}.body }`);
  await close();
  await page.locator(`.react-flow__node[data-id="${http}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('URL (JSONata)').fill('');
  await close();
  await shot('29-missing-required-url');
  await page.locator(`.react-flow__node[data-id="${http}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('URL (JSONata)').fill("'http://127.0.0.1:4011/pricing'");
  await close();
  await page.getByTestId('save-status').locator('[data-status="saved"]').waitFor({ timeout: 15000 }).catch(() => {});
  await shot('30-blank-restored');
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('security-mapping-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'security-mapping-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'security-mapping-check.zip') });
  await browser.close();
}
