import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const identity = JSON.parse(await fs.readFile(path.join(evidence, 'identity.json')));
const template = JSON.parse(await fs.readFile(path.join(evidence, 'template-ids.json')));
const state = JSON.parse(await fs.readFile(path.join(evidence, 'session.json')));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', storageState: state, viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const events = [];
page.on('console', m => { if (m.type() === 'error') events.push({ event: 'console', text: m.text().replace(/params:\s*[^\n]+/g, 'params: [redacted]') }); });
page.on('response', r => { if (r.status() >= 400) events.push({ event: 'response', status: r.status(), url: r.url() }); });
const shot = async (name, mask = []) => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true, mask });
  let text = (await page.locator('body').innerText()).slice(0, 8500);
  if (mask.length) for (const locator of mask) { const secret = await locator.textContent(); if (secret) text = text.replaceAll(secret.trim(), '[redacted]'); }
  events.push({ event: 'state', name, url: page.url(), text });
  console.log(name);
};
try {
  await page.goto(template.flowUrl);
  await page.locator('.react-flow__node[data-id="hook"]').waitFor();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByTestId('webhook-secret').waitFor({ timeout: 15000 });
  const url = page.getByTestId('webhook-url');
  const secret = page.getByTestId('webhook-secret');
  const firstSecret = await secret.textContent();
  await shot('42-webhook-published-masked', [url, secret]);
  await page.getByText('How to sign requests').click();
  await shot('43-webhook-signing-masked', [url, secret]);
  const copyButtons = page.locator('button').filter({ hasText: 'Copy' });
  await copyButtons.first().click();
  const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
  await copyButtons.nth(1).click();
  const copiedSecret = await page.evaluate(() => navigator.clipboard.readText());
  events.push({ event: 'copy-check', urlMatches: copiedUrl === (await url.textContent())?.trim(), secretMatches: copiedSecret === firstSecret?.trim() });
  await page.getByRole('button', { name: 'Rotate secret' }).click();
  await shot('44-rotate-confirm-masked', [url, secret]);
  await page.getByRole('button', { name: 'Confirm: rotate secret' }).click();
  await page.waitForTimeout(800);
  events.push({ event: 'rotation-check', changed: (await secret.textContent()) !== firstSecret });
  await shot('45-webhook-rotated-masked', [url, secret]);
  await page.goto(`/w/${identity.workspaceSlug}/templates`);
  await page.getByTestId('template-support-triage').getByRole('button', { name: 'Use template' }).click();
  await page.locator('.react-flow__node').first().waitFor();
  const scheduleNode = page.locator('.react-flow__node').first();
  await scheduleNode.click();
  const drawer = page.getByTestId('node-drawer');
  await shot('46-schedule-default');
  await drawer.getByLabel('Cron (minute hour day month weekday)').fill('* * * * *');
  await shot('47-schedule-too-frequent');
  await drawer.getByLabel('Cron (minute hour day month weekday)').fill('*/15 * * * *');
  await drawer.getByLabel('Time zone').selectOption('Africa/Cairo');
  await drawer.getByLabel('If runs were missed (e.g. worker down)').selectOption('run_once');
  await shot('48-schedule-valid-options');
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('triggers-check-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'triggers-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await browser.close();
}
