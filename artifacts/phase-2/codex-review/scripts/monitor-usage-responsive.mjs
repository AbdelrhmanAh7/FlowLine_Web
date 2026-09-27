import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts/phase-2/codex-review');
const evidence = path.join(root, 'evidence');
const identity = JSON.parse(await fs.readFile(path.join(evidence, 'identity.json')));
const template = JSON.parse(await fs.readFile(path.join(evidence, 'template-ids.json')));
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
  events.push({ event: 'state', name, url: page.url(), text: (await page.locator('body').innerText()).slice(0, 7000), overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) });
  console.log(name);
};
try {
  const slug = identity.workspaceSlug;
  await page.goto(`/w/${slug}/flows`);
  await shot('49-dashboard-populated');
  await page.goto(`/w/${slug}/runs`);
  await shot('50-run-history');
  await page.getByRole('button', { name: 'Failed', exact: true }).click();
  await shot('51-run-history-failed-filter');
  await page.getByRole('button', { name: 'All runs', exact: true }).click();
  await page.getByLabel('Search flows or run number').fill('Lead Enrichment');
  await shot('52-run-history-search');
  await page.goto(`/w/${slug}/settings`);
  await page.getByRole('button', { name: 'Usage & limits' }).click();
  await page.getByRole('heading', { name: 'Usage this month' }).waitFor();
  await page.waitForTimeout(500);
  await shot('53-usage-before-budget');
  const aiRow = page.locator('table tbody tr').filter({ has: page.getByRole('cell', { name: 'ai', exact: true }) }).first();
  const modelText = (await aiRow.locator('td').nth(1).innerText()).trim();
  const [provider, model] = modelText.split(' / ');
  events.push({ event: 'ai-model', provider, model });
  await page.getByLabel('Monthly budget (USD)').fill('0.01');
  await page.getByLabel('Concurrent runs').fill('1');
  await page.getByLabel('Queued runs').fill('1');
  await page.getByRole('button', { name: '+ Add price' }).click();
  const price = page.locator('div').filter({ has: page.getByLabel('Price key') }).last();
  await page.getByLabel('Price key').last().fill(`ai:${provider}/${model}`);
  await page.getByLabel('Input per million tokens').last().fill('1000000');
  await page.getByLabel('Output per million tokens').last().fill('1000000');
  await shot('54-usage-limits-filled');
  await page.getByRole('button', { name: 'Save limits' }).click();
  await page.getByText('Usage limits saved').waitFor({ timeout: 10000 });
  await shot('55-usage-limits-saved');
  await page.goto(template.flowUrl);
  await page.getByRole('button', { name: '▶ Run' }).click();
  await page.waitForTimeout(2500);
  await shot('56-ai-budget-refusal');
  await page.goto(`/w/${slug}/settings`);
  await page.getByRole('button', { name: 'Usage & limits' }).click();
  await page.getByLabel('Monthly budget (USD)').fill('');
  await page.getByLabel('Concurrent runs').fill('3');
  await page.getByLabel('Queued runs').fill('100');
  await page.getByRole('button', { name: 'Remove price' }).last().click();
  await page.getByRole('button', { name: 'Save limits' }).click();
  await page.getByText('Usage limits saved').waitFor({ timeout: 10000 });
  await shot('57-usage-limits-restored');
  for (const [width, height] of [[1440, 900], [1024, 768], [375, 812]]) {
    await page.setViewportSize({ width, height });
    for (const route of ['integrations', 'templates', 'runs']) {
      await page.goto(`/w/${slug}/${route}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await shot(`58-${route}-${width}`);
    }
    await page.goto(identity.builderUrl);
    await page.locator('.react-flow__node').first().waitFor();
    await shot(`59-builder-${width}`);
    if (width === 375) {
      await page.locator('.react-flow__node').first().click();
      await shot('60-mobile-builder-drawer');
    }
  }
} catch (error) {
  events.push({ event: 'script-error', text: String(error), stack: error.stack });
  await shot('monitor-usage-responsive-error').catch(() => {});
  console.error(error.stack || error);
} finally {
  await fs.writeFile(path.join(evidence, 'monitor-usage-responsive.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(evidence, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'monitor-usage-responsive.zip') });
  await browser.close();
}
