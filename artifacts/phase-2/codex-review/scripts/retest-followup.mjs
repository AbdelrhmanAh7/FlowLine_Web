import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const root = path.resolve('artifacts/phase-2/codex-review');
const events = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const mark = (kind, data = {}) => { const item = { at: new Date().toISOString(), kind, ...data }; events.push(item); console.log(JSON.stringify(item)); };
const shot = async name => { await page.screenshot({ path: path.join(root, 'screenshots', `retest-${name}.png`), fullPage: true }); mark('state', { name, text: (await page.locator('body').innerText()).slice(0, 9000) }); };
const save = async () => fs.writeFile(path.join(root, 'evidence', 'retest-followup.json'), JSON.stringify(events, null, 2));
const stamp = Date.now().toString(36);
const hints = [];
page.on('response', async r => {
  if (r.url().includes('/api/oauth/start') && r.status() === 200) {
    try { const body = await r.json(); const u = new URL(body.url); hints.push({ pathname: u.pathname, hasHint: u.searchParams.has('login_hint'), matchesOriginalAccount: u.searchParams.get('login_hint') === 'alice@flowline.test' }); mark('oauth-start-observed', hints.at(-1)); } catch (e) { mark('oauth-observation-error', { error: String(e) }); }
  }
  if (r.status() >= 400) mark('response-error', { status: r.status(), path: new URL(r.url()).pathname });
});
page.on('console', m => { if (m.type() === 'error') mark('console', { text: m.text().slice(0, 280) }); });

try {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Codex Followup');
  await page.getByLabel('Email').fill(`codex-followup-${stamp}@flowline-e2e.test`);
  await page.getByLabel('Password').fill(randomBytes(24).toString('base64url'));
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: 'Name your workspace' }).waitFor({ timeout: 20000 });
  await page.getByLabel('Workspace name').fill(`Codex Followup ${stamp}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Sales & lead ops/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Blank flow/ }).click();
  await page.getByRole('button', { name: /Create flow & open canvas/ }).click();
  await page.getByText('Start with a trigger').waitFor();
  const slug = page.url().split('/')[4]; mark('signup', { slug });

  await page.goto(`/w/${slug}/integrations`);
  await page.getByRole('listitem').filter({ has: page.getByText('Google Sheets', { exact: true }) }).getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('dialog', { name: 'Connect Google Sheets' }).getByRole('button', { name: 'Continue to Google Sheets' }).click();
  await page.getByTestId('connection-google_sheets').waitFor({ timeout: 15000 });
  await page.getByTestId('connection-google_sheets').getByRole('button', { name: 'Reconnect' }).click(); await shot('followup-reconnect-dialog');
  await page.getByRole('dialog', { name: 'Reconnect Google Sheets' }).getByRole('button', { name: 'Continue to Google Sheets' }).click();
  await page.getByTestId('connection-google_sheets').getByText('Connected').waitFor({ timeout: 15000 });
  mark('hint-result', { observations: hints }); await shot('followup-reconnected');

  await page.goto(`/w/${slug}/templates`);
  await page.getByRole('listitem').filter({ has: page.getByText('Lead Qualifier', { exact: true }) }).getByRole('button', { name: 'Use template' }).click();
  await page.locator('.react-flow__node').first().waitFor();
  for (let i = 1; i <= 27; i++) {
    const dock = page.getByTestId('run-dock');
    const before = await dock.locator(':scope > div').first().textContent().catch(() => null);
    await page.getByRole('button', { name: '▶ Run' }).click();
    await dock.waitFor();
    if (before) await page.waitForFunction(old => document.querySelector('[data-testid="run-dock"] > div')?.textContent !== old, before, { timeout: 15000 });
    await dock.locator(':scope > div').first().getByText('Success', { exact: true }).waitFor({ timeout: 30000 });
    mark('run', { index: i, header: (await dock.locator(':scope > div').first().innerText()).replace(/\s+/g, ' ').slice(0, 90) });
  }
  await page.goto(`/w/${slug}/runs`);
  await page.getByRole('button', { name: 'Load older runs' }).waitFor({ timeout: 15000 }); await shot('followup-load-older-before');
  await page.getByRole('button', { name: 'Load older runs' }).click();
  await page.getByRole('list', { name: 'Runs' }).getByRole('button', { name: /#1.*Lead Qualifier/ }).waitFor({ timeout: 15000 }); await shot('followup-load-older-after');
  mark('complete', { runs: 27 });
} catch (e) { mark('error', { message: String(e), stack: String(e.stack).slice(0, 1300) }); await shot('followup-error').catch(() => {}); }
finally { await save(); await browser.close(); }
