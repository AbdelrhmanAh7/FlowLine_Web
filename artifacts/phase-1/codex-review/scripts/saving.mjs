import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const root = 'artifacts/phase-1/codex-review';
const email = JSON.parse(readFileSync(`${root}/journey-events.json`, 'utf8')).email;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
try {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email); await page.getByLabel('Password').fill('Codex-Test-Pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/flows$/);
  await page.getByRole('link', { name: /Codex Local Conflict/ }).first().click();
  await page.locator('.react-flow__node').first().waitFor();
  await page.route('**/api/flows/54b3471b-b85f-474e-ba77-637f9ff687b8', async route => {
    if (route.request().method() === 'PUT') await new Promise(resolve => setTimeout(resolve, 2000));
    await route.continue();
  });
  const status = page.getByTestId('save-status');
  await page.getByLabel('Flow name').fill('Codex Autosave States');
  await status.getByText('Unsaved').waitFor({ timeout: 5000 });
  console.log('STATUS', 'Unsaved');
  await status.getByText('Saving').waitFor({ timeout: 5000 });
  console.log('STATUS', 'Saving');
  await page.screenshot({ path: `${root}/screenshots/autosave-saving.png` });
  await status.getByText('Saved', { exact: true }).waitFor({ timeout: 10000 });
  console.log('STATUS', 'Saved');
  await page.screenshot({ path: `${root}/screenshots/autosave-saved.png` });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
} finally { await browser.close(); }
