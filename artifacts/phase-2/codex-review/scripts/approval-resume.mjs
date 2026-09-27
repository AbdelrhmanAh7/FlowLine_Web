import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const ids = JSON.parse(await fs.readFile(path.join(evidence, 'lost-ids.json')));
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
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 8500) });
  console.log(name);
};
const stateFake = async () => {
  const sheets = await (await page.request.get('http://127.0.0.1:4010/__fake/state/google_sheets')).json();
  const slack = await (await page.request.get('http://127.0.0.1:4010/__fake/state/slack')).json();
  return { rows: sheets.sheets[ids.sheetId] ?? [], messages: slack.messages.filter(x => x.channel === ids.channel) };
};
try {
  events.push({ event: 'after-lost-provider-state', ...(await stateFake()) });
  await page.goto(ids.flowUrl);
  await page.locator('.react-flow__node[data-id="slack"]').click();
  await page.getByTestId('node-drawer').getByText('Require human approval before running').click();
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  await shot('35-approval-configured');
  await page.getByRole('button', { name: '▶ Run' }).click();
  await page.waitForTimeout(3000);
  await shot('36-approval-pending');
  await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Slack — Notify/ }).first().click();
  await shot('37-approval-args');
  if (await page.getByTestId('decision-box').count()) {
    await page.getByTestId('decision-box').getByRole('button', { name: 'Approve' }).click();
    await page.waitForTimeout(2500);
    await shot('38-approval-done');
    events.push({ event: 'after-approval-provider-state', ...(await stateFake()) });
  }
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('approval-resume-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'approval-resume.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'approval-resume.zip') });
  await browser.close();
}
