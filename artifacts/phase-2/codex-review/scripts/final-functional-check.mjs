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
page.on('response', r => { if (r.status() >= 400) events.push({ event: 'response', status: r.status(), url: r.url() }); });
await context.tracing.start({ screenshots: true, snapshots: true });
const shot = async name => {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 7300) });
  console.log(name);
};
const close = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); };
try {
  const slug = identity.workspaceSlug;
  await page.goto(`/w/${slug}/runs?run=7833a88b-09ec-4c53-be5d-8ca6fe012620`);
  await page.getByRole('button', { name: /Load older/ }).click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Enrich lead/ }).first().click();
  await shot('86-original-ai-meta');
  for (const tab of ['Input', 'Output', 'Log']) {
    await page.getByTestId('step-panel').getByRole('tab', { name: tab }).click();
    await shot(`87-ai-${tab.toLowerCase()}-tab`);
  }
  await page.goto(`/w/${slug}/runs`);
  await page.getByRole('button', { name: /Load older/ }).click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /#1\s/ }).first().click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /HTTP request/ }).first().click();
  for (const tab of ['Input', 'Output', 'Log']) {
    await page.getByTestId('step-panel').getByRole('tab', { name: tab }).click();
    await shot(`88-http-${tab.toLowerCase()}-tab`);
  }
  await page.goto(identity.builderUrl);
  await page.locator('.react-flow__node').first().waitFor();
  const ids = await page.locator('.react-flow__node').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
  const http = ids[1], transform = ids[2], output = ids[3];
  await page.locator(`.react-flow__node[data-id="${transform}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill('{');
  await close();
  await page.getByRole('button', { name: /issue/ }).click();
  await shot('89-invalid-jsonata-explained');
  await page.keyboard.press('Escape');
  await page.locator(`.react-flow__node[data-id="${transform}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill(`$steps.${output}.value`);
  await close();
  await page.getByRole('button', { name: /issue/ }).click();
  await shot('90-non-upstream-explained');
  await page.keyboard.press('Escape');
  await page.locator(`.react-flow__node[data-id="${transform}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill(`{ "pricing": $steps.${http}.body }`);
  await close();
  await page.locator(`.react-flow__node[data-id="${http}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('URL (JSONata)').fill('');
  await close();
  await page.getByRole('button', { name: /issue/ }).click();
  await shot('91-required-url-explained');
  await page.keyboard.press('Escape');
  await page.locator(`.react-flow__node[data-id="${http}"]`).click();
  await page.getByTestId('node-drawer').getByLabel('URL (JSONata)').fill("'http://127.0.0.1:4011/pricing'");
  await close();
  await page.waitForTimeout(1000);
  await page.goto(`/w/${slug}/integrations`);
  await page.getByTestId('connection-google_sheets').getByRole('button', { name: 'Reconnect' }).click();
  await page.getByRole('dialog', { name: 'Reconnect Google Sheets' }).getByRole('button', { name: 'Continue to Google Sheets' }).click();
  await page.getByTestId('connection-google_sheets').getByText('Connected').waitFor({ timeout: 15000 });
  await page.goto(lost.flowUrl);
  await page.getByRole('button', { name: '▶ Run' }).click();
  await page.waitForTimeout(2100);
  await shot('92-rejection-pending');
  await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /Slack — Notify/ }).first().click();
  await shot('93-rejection-args');
  await page.getByTestId('decision-box').getByRole('button', { name: 'Reject' }).click();
  await page.waitForTimeout(1800);
  await shot('94-rejected-no-post');
  const slack = await (await page.request.get('http://127.0.0.1:4010/__fake/state/slack')).json();
  events.push({ event: 'slack-after-reject', messages: slack.messages.filter(x => x.channel === lost.channel) });
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('final-functional-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'final-functional-check.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'final-functional-check.zip') });
  await browser.close();
}
