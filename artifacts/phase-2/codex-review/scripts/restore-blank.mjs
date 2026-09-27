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
try {
  await page.goto(identity.builderUrl);
  await page.locator('.react-flow__node').first().waitFor();
  const ids = await page.locator('.react-flow__node').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
  await page.locator(`.react-flow__node[data-id="${ids[1]}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('URL (JSONata)').fill("'http://127.0.0.1:4011/pricing'");
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.locator(`.react-flow__node[data-id="${ids[2]}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill(`{ "pricing": $steps.${ids[1]}.body }`);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(root, 'screenshots', '106-blank-valid-restored.png'), fullPage: true });
  await fs.writeFile(path.join(evidence, 'restore-blank.json'), JSON.stringify({ saveStatus: await page.getByTestId('save-status').getAttribute('data-status'), issueButtonCount: await page.getByRole('button', { name: /issue/ }).count(), runDisabled: await page.getByRole('button', { name: '▶ Run' }).getAttribute('aria-disabled') }, null, 2));
} finally {
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await browser.close();
}
