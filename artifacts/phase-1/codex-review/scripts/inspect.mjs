import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = 'http://localhost:3100';
const out = 'artifacts/phase-1/codex-review/screenshots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: base });
const page = await context.newPage();
const events = [];
page.on('console', m => { if (m.type() === 'error') events.push(`console: ${m.text()}`); });
page.on('pageerror', e => events.push(`pageerror: ${e.message}`));
page.on('response', r => { if (r.status() >= 400) events.push(`http ${r.status()}: ${r.url()}`); });
for (const [path, name] of [['/', 'landing'], ['/sign-up', 'signup'], ['/sign-in', 'signin']]) {
  await page.goto(path);
  await page.screenshot({ path: `${out}/probe-${name}.png` });
  console.log(JSON.stringify({ name, url: page.url(), title: await page.title(), text: (await page.locator('body').innerText()).slice(0, 2500), controls: await page.locator('button, input, a').evaluateAll(els => els.map(e => ({ tag: e.tagName, text: (e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim(), href: e.getAttribute('href') })).slice(0, 80)) }));
}
console.log('EVENTS', JSON.stringify(events));
await browser.close();
