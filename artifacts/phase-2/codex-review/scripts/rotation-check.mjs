import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const template = JSON.parse(await fs.readFile(path.join(evidence, 'template-ids.json')));
const state = JSON.parse(await fs.readFile(path.join(evidence, 'session.json')));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', storageState: state, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [];
try {
  await page.goto(template.flowUrl);
  await page.locator('.react-flow__node').first().waitFor();
  await page.getByRole('button', { name: 'Triggers', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Triggers' });
  await dialog.waitFor();
  const secret = page.getByTestId('webhook-secret');
  for (let n = 1; n <= 2; n++) {
    await dialog.getByRole('button', { name: 'Rotate secret' }).click();
    const confirm = dialog.getByRole('button', { name: 'Confirm: rotate secret' });
    await confirm.click();
    await confirm.waitFor({ state: 'hidden', timeout: 10000 });
    await secret.waitFor({ timeout: 10000 });
    await page.getByText('New signing secret issued — the old one no longer works').first().waitFor({ timeout: 10000 });
    const value = await secret.textContent();
    if (n === 1) globalThis.first = value;
    else events.push({ event: 'rotation', secretChanged: value !== globalThis.first });
  }
  const url = page.getByTestId('webhook-url');
  await page.screenshot({ path: path.join(root, 'screenshots', '96-webhook-rotation-masked.png'), fullPage: true, mask: [url, secret] });
  let text = await page.locator('body').innerText();
  text = text.replaceAll((await url.textContent())?.trim() ?? '', '[redacted-url]').replaceAll((await secret.textContent())?.trim() ?? '', '[redacted-secret]');
  events.push({ event: 'state', name: '96-webhook-rotation-masked', text: text.slice(0, 5000) });
  await dialog.getByRole('button', { name: 'Close' }).click();
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'rotation-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await browser.close();
}
