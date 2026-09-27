import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const identity = JSON.parse(await fs.readFile(path.join(evidence, 'identity.json')));
const ids = JSON.parse(await fs.readFile(path.join(evidence, 'template-ids.json')));
const storageState = JSON.parse(await fs.readFile(path.join(evidence, 'session.json')));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', storageState, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [];
page.on('console', m => { if (m.type() === 'error') events.push({ event: 'console', text: m.text() }); });
page.on('response', r => { if (r.status() >= 400) events.push({ event: 'response', status: r.status(), url: r.url() }); });
await context.tracing.start({ screenshots: true, snapshots: true });
const shot = async name => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 8000) });
  console.log(name);
};
try {
  const sheets = await (await page.request.get('http://127.0.0.1:4010/__fake/state/google_sheets')).json();
  const slack = await (await page.request.get('http://127.0.0.1:4010/__fake/state/slack')).json();
  events.push({ event: 'provider-state', sheetId: ids.sheetId, rows: sheets.sheets[ids.sheetId] ?? [], channel: ids.channel, messages: slack.messages.filter(x => x.channel === ids.channel) });
  await page.goto(`/w/${identity.workspaceSlug}/runs`);
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Lead Enrichment Pipeline/ }).first().click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Enrich lead/ }).first().click();
  await shot('21-ai-step-inspector');
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Score lead/ }).first().click();
  await shot('22-ai-score-inspector');
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Lead Enrichment Pipeline/ }).nth(1).click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Sheets — Add row/ }).first().click();
  await page.getByTestId('step-panel').getByRole('button', { name: /Re-run from this step/ }).click();
  await page.getByTestId('rerun-preview').getByText('Reused from').first().waitFor({ timeout: 15000 });
  await shot('23-rerun-preview-loaded');
  await page.getByRole('dialog', { name: /Re-run/ }).getByRole('button', { name: 'Cancel' }).click();
  await page.goto(`/w/${identity.workspaceSlug}/settings`);
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await shot('24-settings-usage');
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('post-template-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'post-template-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'post-template-check.zip') });
  await browser.close();
}
