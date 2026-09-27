import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const identity = JSON.parse(await fs.readFile(path.join(evidence, 'identity.json')));
const lost = JSON.parse(await fs.readFile(path.join(evidence, 'lost-ids.json')));
const state = JSON.parse(await fs.readFile(path.join(evidence, 'session.json')));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', storageState: state, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [];
page.on('console', m => { if (m.type() === 'error') events.push({ event: 'console', text: m.text().replace(/params:\s*[^\n]+/g, 'params: [redacted]') }); });
const shot = async name => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 7000) });
  console.log(name);
};
try {
  await page.goto(`/w/${identity.workspaceSlug}/integrations`);
  await page.getByText(/12 apps · 28 actions/i).waitFor();
  const card = page.getByTestId('connection-google_sheets');
  await card.waitFor();
  await card.getByRole('button', { name: 'Reconnect' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reconnect Google Sheets' });
  if (!(await dialog.isVisible().catch(() => false))) await card.getByRole('button', { name: 'Reconnect' }).click();
  await dialog.waitFor();
  await shot('92-reconnect-sheets-dialog');
  await dialog.getByRole('button', { name: 'Continue to Google Sheets' }).click();
  await card.getByText('Connected').waitFor({ timeout: 15000 });
  await page.goto(lost.flowUrl);
  await page.locator('.react-flow__node').first().waitFor();
  await page.getByRole('button', { name: '▶ Run' }).click();
  await page.waitForTimeout(2200);
  await shot('93-rejection-pending');
  await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Slack — Notify/ }).first().click();
  await shot('94-rejection-args');
  await page.getByTestId('decision-box').getByRole('button', { name: 'Reject' }).click();
  await page.waitForTimeout(1600);
  await shot('95-rejected-no-post');
  const slack = await (await page.request.get('http://127.0.0.1:4010/__fake/state/slack')).json();
  events.push({ event: 'slack-after-reject', messages: slack.messages.filter(x => x.channel === lost.channel) });
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('reject-check-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'reject-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await browser.close();
}
