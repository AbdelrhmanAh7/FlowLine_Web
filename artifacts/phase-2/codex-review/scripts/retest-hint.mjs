import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const root = path.resolve('artifacts/phase-2/codex-review');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const observations = [];
const stamp = Date.now().toString(36);
await page.route('**/api/oauth/start', async route => {
  const response = await route.fetch();
  try {
    const body = await response.json();
    const url = new URL(body.url);
    observations.push({ at: new Date().toISOString(), provider: JSON.parse(route.request().postData() ?? '{}').provider, hasConnectionId: Boolean(JSON.parse(route.request().postData() ?? '{}').connectionId), authorizePath: url.pathname, hasLoginHint: url.searchParams.has('login_hint'), matchesOriginalAccount: url.searchParams.get('login_hint') === 'alice@flowline.test' });
  } catch (e) { observations.push({ at: new Date().toISOString(), error: String(e) }); }
  await route.fulfill({ response });
});
try {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Codex Hint Retest');
  await page.getByLabel('Email').fill(`codex-hint-${stamp}@flowline-e2e.test`);
  await page.getByLabel('Password').fill(randomBytes(24).toString('base64url'));
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: 'Name your workspace' }).waitFor({ timeout: 20000 });
  await page.getByLabel('Workspace name').fill(`Codex Hint ${stamp}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Sales & lead ops/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Blank flow/ }).click();
  await page.getByRole('button', { name: /Create flow & open canvas/ }).click();
  await page.getByText('Start with a trigger').waitFor();
  const slug = page.url().split('/')[4];
  await page.goto(`/w/${slug}/integrations`);
  await page.getByRole('listitem').filter({ has: page.getByText('Google Sheets', { exact: true }) }).getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('dialog', { name: 'Connect Google Sheets' }).getByRole('button', { name: 'Continue to Google Sheets' }).click();
  await page.getByTestId('connection-google_sheets').waitFor({ timeout: 15000 });
  await page.getByTestId('connection-google_sheets').getByRole('button', { name: 'Reconnect' }).click();
  await page.screenshot({ path: path.join(root, 'screenshots', 'retest-google-preselect-dialog.png'), fullPage: true });
  await page.getByRole('dialog', { name: 'Reconnect Google Sheets' }).getByRole('button', { name: 'Continue to Google Sheets' }).click();
  await page.getByTestId('connection-google_sheets').getByText('Connected').waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(root, 'screenshots', 'retest-google-preselect-done.png'), fullPage: true });
  observations.push({ at: new Date().toISOString(), result: 'UI returned Connected after reconnect' });
} catch (e) { observations.push({ at: new Date().toISOString(), error: String(e), stack: String(e.stack).slice(0, 900) }); }
finally { await fs.writeFile(path.join(root, 'evidence', 'retest-google-hint.json'), JSON.stringify(observations, null, 2)); await browser.close(); }
