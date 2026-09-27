import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const identity = JSON.parse(await fs.readFile(path.join(evidence, 'identity.json')));
const storageState = JSON.parse(await fs.readFile(path.join(evidence, 'session.json')));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', storageState, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [];
page.on('console', m => { if (m.type() === 'error') events.push({ event: 'console', text: m.text() }); });
page.on('pageerror', e => events.push({ event: 'pageerror', text: e.message }));
page.on('response', r => { if (r.status() >= 400) events.push({ event: 'response', status: r.status(), url: r.url() }); });
await context.tracing.start({ screenshots: true, snapshots: true });
const shot = async name => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 8000) });
  console.log(name);
};
const fake = 'http://127.0.0.1:4010';
const state = async kind => (await (await page.request.get(`${fake}/__fake/state/${kind}`)).json());
const close = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); };
const pickConnection = async drawer => {
  const sel = drawer.getByLabel('Connection');
  const opts = await sel.locator('option').allTextContents();
  const label = opts.find(x => x && !x.startsWith('Choose') && !x.startsWith('No '));
  if (!label) throw new Error(`No connection option: ${opts.join(' | ')}`);
  await sel.selectOption({ label });
};
try {
  const slug = identity.workspaceSlug;
  for (const [name, provider] of [['Google Sheets', 'google_sheets'], ['Slack', 'slack']]) {
    await page.goto(`/w/${slug}/integrations`);
    await shot(`10-integrations-before-${provider}`);
    await page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) }).getByRole('button', { name: 'Connect' }).click();
    await shot(`11-connect-dialog-${provider}`);
    await page.getByRole('dialog', { name: `Connect ${name}` }).getByRole('button', { name: `Continue to ${name}` }).click();
    await page.getByTestId(`connection-${provider}`).waitFor({ timeout: 15000 });
    await shot(`12-connected-${provider}`);
  }
  await page.goto(`/w/${slug}/templates`);
  await shot('13-lead-template-requirements');
  const card = page.getByTestId('template-lead-enrichment');
  await card.getByRole('button', { name: 'Use template' }).click();
  await page.locator('.react-flow__node[data-id="sheet"]').waitFor();
  await shot('14-template-builder-initial');
  const sheetId = `codex-sheet-${Date.now().toString(36)}`;
  const channel = `C_CODEX_${Date.now().toString(36)}`;
  await fs.writeFile(path.join(evidence, 'template-ids.json'), JSON.stringify({ flowUrl: page.url(), sheetId, channel }, null, 2));
  let drawer = page.getByTestId('node-drawer');
  await page.locator('.react-flow__node[data-id="sheet"]').click();
  await pickConnection(drawer);
  await drawer.getByLabel('Input mapping (JSONata → object)').fill(`{ "spreadsheetId": "${sheetId}", "range": "Leads!A1", "row": [$steps.hook.body.lead.name, $steps.enrich.company, $steps.score.label] }`);
  await close();
  await page.locator('.react-flow__node[data-id="slack"]').click();
  await pickConnection(drawer);
  await drawer.getByLabel('Input mapping (JSONata → object)').fill(`{ "channel": "${channel}", "text": "Hot lead: " & $steps.hook.body.lead.name }`);
  await close();
  await page.getByTestId('save-status').locator('[data-status="saved"]').waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('15-template-configured');
  const fault = await page.request.post(`${fake}/__fake/fault`, { data: { provider: 'google_sheets', pathPattern: sheetId, mode: '500', times: 3 } });
  events.push({ event: 'fault', status: fault.status(), body: await fault.text() });
  await page.getByRole('button', { name: '▶ Run' }).click();
  await page.getByTestId('run-dock').getByText('FAILED').first().waitFor({ timeout: 60000 });
  await shot('16-template-sheet-failed');
  events.push({ event: 'state-failed', sheets: (await state('google_sheets')).sheets[sheetId] ?? [], slack: (await state('slack')).messages.filter(x => x.channel === channel) });
  await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Sheets — Add row/ }).click();
  await shot('17-template-failed-inspector');
  await page.getByTestId('step-panel').getByRole('button', { name: /Re-run from this step/ }).click();
  await shot('18-rerun-preview');
  await page.getByRole('dialog', { name: /Re-run/ }).getByRole('button', { name: /^Re-run \d+ steps?$/ }).click();
  await page.getByText(/Re-running as #2/).waitFor();
  await page.getByRole('list', { name: 'Runs' }).getByText('SUCCESS').first().waitFor({ timeout: 30000 });
  await shot('19-rerun-success');
  events.push({ event: 'state-rerun', sheets: (await state('google_sheets')).sheets[sheetId] ?? [], slack: (await state('slack')).messages.filter(x => x.channel === channel) });
  await page.goto(`/w/${slug}/settings`);
  await shot('20-usage-after-rerun');
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('template-check-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'template-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'template-check.zip') });
  await browser.close();
}
