import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const root = path.resolve('artifacts/phase-2/codex-review');
const out = path.join(root, 'evidence');
await fs.mkdir(out, { recursive: true });
await fs.mkdir(path.join(root, 'screenshots'), { recursive: true });
await fs.mkdir(path.join(root, 'traces'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const events = [];
page.on('console', m => { if (m.type() === 'error') events.push({ type: 'console', url: page.url(), text: m.text() }); });
page.on('pageerror', e => events.push({ type: 'pageerror', url: page.url(), text: e.message }));
page.on('response', r => { if (r.status() >= 400) events.push({ type: 'response', status: r.status(), url: r.url() }); });
await context.tracing.start({ screenshots: true, snapshots: true, sources: false });

async function shot(name) {
  await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`), fullPage: true });
  const text = await page.locator('body').innerText();
  await fs.writeFile(path.join(out, `${name}.txt`), `URL: ${page.url()}\n\n${text}\n`);
  console.log(`SHOT ${name} ${page.url()}`);
}
async function finish() {
  await fs.writeFile(path.join(out, 'events.json'), JSON.stringify(events, null, 2));
  await fs.writeFile(path.join(out, 'session.json'), JSON.stringify(await context.storageState(), null, 2));
  await context.tracing.stop({ path: path.join(root, 'traces', 'explore.zip') });
  await browser.close();
}

try {
  const stamp = Date.now().toString(36);
  const email = `codex-${stamp}@flowline-e2e.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Codex Independent Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(randomBytes(24).toString('base64url'));
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: 'Name your workspace' }).waitFor();
  await page.getByLabel('Workspace name').fill(`Codex QA ${stamp}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Sales & lead ops/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Blank flow/ }).click();
  await page.getByRole('button', { name: /Create flow & open canvas/ }).click();
  await page.getByText('Start with a trigger').waitFor();
  await fs.writeFile(path.join(out, 'identity.json'), JSON.stringify({ email, workspaceSlug: page.url().split('/')[4], flowId: page.url().split('/').pop(), builderUrl: page.url() }, null, 2));
  await shot('01-blank-start');
  await page.getByRole('button', { name: /Add node/ }).click();
  await shot('02-node-palette');
  const pane = page.locator('.react-flow__pane');
  const add = async (name, search, x, y) => {
    const palette = page.getByRole('dialog', { name: 'Add node' });
    await palette.getByLabel('Search nodes').fill(search);
    await palette.getByRole('option', { name }).dragTo(pane, { targetPosition: { x, y } });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Add node/ }).click();
  };
  await add(/Manual trigger/, 'manual', 350, 480);
  await add(/HTTP request/, 'http', 570, 480);
  await add(/JSON transform/, 'json', 790, 480);
  const palette = page.getByRole('dialog', { name: 'Add node' });
  await palette.getByLabel('Search nodes').fill('output');
  await palette.getByRole('option', { name: /Output/ }).dragTo(pane, { targetPosition: { x: 1010, y: 480 } });
  await page.keyboard.press('Escape');
  await shot('03-blank-four-nodes');
  const ids = await page.locator('.react-flow__node').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
  await fs.writeFile(path.join(out, 'blank-node-ids.json'), JSON.stringify(ids));
  const http = page.locator(`.react-flow__node[data-id="${ids[1]}"]`);
  await http.click();
  await shot('04-http-drawer');
} catch (e) {
  console.error(e.stack || e);
  await shot('error-explore').catch(() => {});
} finally {
  await finish();
}
