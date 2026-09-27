import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const identity = JSON.parse(await fs.readFile(path.join(evidence, 'identity.json')));
const state = JSON.parse(await fs.readFile(path.join(evidence, 'session.json')));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', storageState: state, viewport: { width: 1440, height: 900 } });
const stale = await context.newPage();
const edit = await context.newPage();
const events = [];
stale.on('response', r => { if (r.url().includes('/runs') && r.request().method() === 'POST') events.push({ event: 'run-response', status: r.status(), url: r.url() }); });
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, text: (await page.locator('body').innerText()).slice(0, 6000) });
  console.log(name);
};
try {
  await stale.goto(identity.builderUrl);
  await stale.locator('.react-flow__node').first().waitFor();
  await edit.goto(identity.builderUrl);
  await edit.locator('.react-flow__node').first().waitFor();
  const ids = await edit.locator('.react-flow__node').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
  await edit.locator(`.react-flow__node[data-id="${ids[2]}"]`).click();
  await edit.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill('{');
  await edit.keyboard.press('Escape'); await edit.keyboard.press('Escape');
  await edit.waitForTimeout(1400);
  await shot(edit, '103-invalid-saved-tab');
  const disabled = await stale.getByRole('button', { name: '▶ Run' }).getAttribute('aria-disabled');
  events.push({ event: 'stale-run-button', ariaDisabled: disabled });
  if (disabled !== 'true') {
    await stale.getByRole('button', { name: '▶ Run' }).click();
    await stale.waitForTimeout(900);
    await shot(stale, '104-server-refuses-stale-valid-tab');
  }
  await edit.locator(`.react-flow__node[data-id="${ids[2]}"]`).click();
  await edit.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill(`{ "pricing": $steps.${ids[1]}.body }`);
  await edit.keyboard.press('Escape'); await edit.keyboard.press('Escape');
  await edit.waitForTimeout(1200);
  await shot(edit, '105-invalid-restored');
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot(edit, 'server-validation-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'server-validation-ui.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await browser.close();
}
