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
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 8500) });
  console.log(name);
};
const fake = 'http://127.0.0.1:4010';
const close = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); };
const pickConnection = async drawer => {
  const sel = drawer.getByLabel('Connection');
  const labels = await sel.locator('option').allTextContents();
  await sel.selectOption({ label: labels.find(x => x && !x.startsWith('Choose') && !x.startsWith('No ')) });
};
const sideEffects = async (sheetId, channel) => {
  const sheets = await (await page.request.get(`${fake}/__fake/state/google_sheets`)).json();
  const slack = await (await page.request.get(`${fake}/__fake/state/slack`)).json();
  return { rows: sheets.sheets[sheetId] ?? [], messages: slack.messages.filter(x => x.channel === channel) };
};
try {
  const slug = identity.workspaceSlug;
  await page.goto(`/w/${slug}/templates`);
  await page.getByTestId('template-lead-enrichment').getByRole('button', { name: 'Use template' }).click();
  await page.locator('.react-flow__node[data-id="sheet"]').waitFor();
  const flowUrl = page.url();
  const sheetId = `codex-lost-${Date.now().toString(36)}`;
  const channel = `C_LOST_${Date.now().toString(36)}`;
  await fs.writeFile(path.join(evidence, 'lost-ids.json'), JSON.stringify({ flowUrl, sheetId, channel }, null, 2));
  const drawer = page.getByTestId('node-drawer');
  await page.locator('.react-flow__node[data-id="sheet"]').click();
  await pickConnection(drawer);
  await drawer.getByLabel('Input mapping (JSONata → object)').fill(`{ "spreadsheetId": "${sheetId}", "range": "Leads!A1", "row": [$steps.hook.body.lead.name, $steps.enrich.company, $steps.score.label] }`);
  await close();
  await page.locator('.react-flow__node[data-id="slack"]').click();
  await pickConnection(drawer);
  await drawer.getByLabel('Input mapping (JSONata → object)').fill(`{ "channel": "${channel}", "text": "Lost response lead: " & $steps.hook.body.lead.name }`);
  await close();
  await page.waitForTimeout(1200);
  await shot('31-lost-flow-configured');
  const fault = await page.request.post(`${fake}/__fake/fault`, { data: { provider: 'google_sheets', pathPattern: sheetId, mode: 'drop_after_commit', times: 1 } });
  events.push({ event: 'fault', status: fault.status(), body: await fault.text() });
  await page.getByRole('button', { name: '▶ Run' }).click();
  await page.getByTestId('run-dock').getByText(/NEEDS REVIEW|SUCCESS|FAILED/).first().waitFor({ timeout: 35000 });
  await shot('32-lost-run-state');
  events.push({ event: 'side-effects-after-lost', ...(await sideEffects(sheetId, channel)) });
  await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Sheets — Add row/ }).first().click();
  await shot('33-lost-inspector');
  if (await page.getByTestId('decision-box').count()) {
    await page.getByTestId('decision-box').getByRole('button', { name: 'It happened — mark done' }).click();
    await page.getByRole('list', { name: 'Runs' }).getByText('SUCCESS').first().waitFor({ timeout: 20000 });
    await shot('34-lost-mark-done');
    events.push({ event: 'side-effects-after-resolution', ...(await sideEffects(sheetId, channel)) });
  }
  await page.goto(flowUrl);
  await page.locator('.react-flow__node[data-id="slack"]').click();
  await drawer.getByText('Require human approval before running').click();
  await close();
  await page.waitForTimeout(1300);
  await shot('35-approval-configured');
  await page.getByRole('button', { name: '▶ Run' }).click();
  await page.getByTestId('run-dock').getByText('NEEDS APPROVAL').first().waitFor({ timeout: 25000 });
  await shot('36-approval-pending');
  await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Slack — Notify/ }).first().click();
  await shot('37-approval-args');
  await page.getByTestId('decision-box').getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('list', { name: 'Runs' }).getByText('SUCCESS').first().waitFor({ timeout: 20000 });
  await shot('38-approval-done');
  events.push({ event: 'side-effects-after-approval', ...(await sideEffects(sheetId, channel)) });
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('lost-approval-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'lost-approval-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'lost-approval-check.zip') });
  await browser.close();
}
