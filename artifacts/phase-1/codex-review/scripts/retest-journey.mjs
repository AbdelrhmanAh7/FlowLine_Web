import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const root = 'artifacts/phase-1/codex-review';
const email = `codex-retest-${Date.now()}@flowline-e2e.test`;
const result = { email, revision: 'c35485e', stages: {}, events: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', m => { if (m.type() === 'error') result.events.push({ type: 'console', text: m.text().slice(0, 500) }); });
page.on('pageerror', e => result.events.push({ type: 'pageerror', text: e.message }));
page.on('response', r => { if (r.status() >= 400) result.events.push({ type: 'http', status: r.status(), url: r.url() }); });
async function snap(name) { await page.screenshot({ path: `${root}/screenshots/retest-${name}.png` }); }
async function stage(name, fn) {
  try { result.stages[name] = await fn(); console.log(name, JSON.stringify(result.stages[name])); }
  catch (e) { result.stages[name] = { error: String(e) }; console.log('FAIL', name, e.stack); await snap(`${name}-failure`); }
}
try {
  await stage('journey', async () => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Start free', exact: true }).click();
    await page.getByLabel('Name').fill('Codex Retest');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Codex-Test-Pass-1');
    await snap('journey-signup');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(/onboarding/);
    await page.getByLabel('Workspace name').fill('Codex Retest');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: /Sales & lead ops/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: /Lead Qualifier/ }).click();
    await snap('journey-onboarding');
    await page.getByRole('button', { name: /Create flow & open canvas/ }).click();
    await page.waitForURL(/\/flows\/[0-9a-f-]{36}$/);
    await page.locator('.react-flow__node[data-id="normalise"]').waitFor();
    const flowUrl = page.url();
    await snap('journey-builder');
    await page.getByRole('button', { name: '▶ Run' }).click();
    await page.getByTestId('run-dock').getByText('SUCCESS').first().waitFor({ timeout: 20000 });
    await snap('journey-run');
    await page.getByTestId('run-dock').getByRole('link', { name: /Open in inspector/ }).click();
    await page.waitForURL(/\/runs\?run=/);
    await page.getByTestId('step-panel').waitFor();
    await snap('journey-inspector');
    return { flowUrl, inspectorUrl: page.url(), stepPanel: (await page.getByTestId('step-panel').innerText()).slice(0, 1000) };
  });
  await stage('cr02', async () => {
    const flowUrl = result.stages.journey.flowUrl;
    await page.goto(flowUrl);
    const node = page.locator('.react-flow__node[data-id="normalise"]');
    await node.waitFor(); await node.click();
    await page.getByTestId('node-drawer').getByLabel('Expression (JSONata)').fill('$number("x")');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.getByTestId('save-status').getByText('Saved', { exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: '▶ Run' }).click();
    await page.getByTestId('run-dock').getByText('FAILED').first().waitFor({ timeout: 20000 });
    await snap('cr02-failed-run');
    await page.getByRole('complementary', { name: 'Workspace navigation' }).getByRole('link', { name: 'Flows' }).click();
    await page.waitForURL(/\/flows$/);
    const row = page.locator('tbody tr').filter({ hasText: 'Lead Qualifier' });
    await row.waitFor();
    const cells = await row.locator('td').allTextContents();
    await snap('cr02-success-rate');
    await page.reload(); await row.waitFor();
    const reloadedCells = await row.locator('td').allTextContents();
    await snap('cr02-success-rate-reload');
    return { cells, reloadedCells, expected: '50.0% (one success, one failure)' };
  });
} finally {
  writeFileSync(`${root}/retest-journey-results.json`, JSON.stringify(result, null, 2));
  await browser.close();
}
