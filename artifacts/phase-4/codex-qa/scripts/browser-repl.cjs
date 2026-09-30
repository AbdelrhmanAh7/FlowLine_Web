const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const baseURL = 'http://localhost:3200';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
const password = `Cq!${crypto.randomBytes(18).toString('base64url')}`;
const emails = Object.fromEntries(['owner', 'member', 'outsider'].map(role => [role, `codex-${role}-${stamp}@flowline-qa.test`]));
const events = [];
const betaCode = fs.readFileSync('C:/Users/ABDELR~1/AppData/Local/Temp/claude/C--Users-Abdelrahman-Desktop-Personal-Project-FlowLine/1de60827-acfa-4d1d-8b34-1de4bdc07c48/scratchpad/qa-beta-code.txt', 'utf8').match(/FL-[A-Za-z0-9-]+/)[0];
for (const dir of ['screenshots', 'evidence']) fs.mkdirSync(path.join(root, dir), { recursive: true });
function redact(value) { return String(value).split(password).join('[REDACTED]').split(betaCode).join('[REDACTED]').replace(/(token|code|key)=([^&\s]+)/gi, '$1=[REDACTED]'); }
let pageLoads = 0;

function safeUrl(value) {
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname.replace(/\/invite\/[^/]+/g, '/invite/[REDACTED]')}`;
  } catch { return String(value).split('?')[0]; }
}
function watch(page, label) {
  page.on('console', msg => {
    if (msg.type() === 'error' || /hydration|did not match|server rendered/i.test(msg.text())) {
      events.push({ kind: 'console', label, page: safeUrl(page.url()), type: msg.type(), text: msg.text().slice(0, 1200) });
    }
  });
  page.on('pageerror', err => events.push({ kind: 'pageerror', label, page: safeUrl(page.url()), text: err.message.slice(0, 1200) }));
  page.on('response', response => {
    if (response.status() >= 400) events.push({ kind: 'http', label, page: safeUrl(page.url()), status: response.status(), url: safeUrl(response.url()) });
  });
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) pageLoads++; });
  return page;
}
async function shot(page, name) {
  const file = path.join(root, 'screenshots', `${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  return path.relative(root, file);
}
async function dump() {
  fs.writeFileSync(path.join(root, 'evidence', 'browser-events.json'), redact(JSON.stringify({ baseURL, stamp, pageLoads, emails, events }, null, 2)));
}
async function visible(page) {
  return { url: safeUrl(page.url()), text: (await page.locator('body').innerText()).slice(0, 5000), buttons: await page.getByRole('button').allTextContents() };
}
async function signup(page, role, name) {
  await page.goto(`${baseURL}/sign-up`);
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(emails[role]);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForTimeout(1200);
  return visible(page);
}
async function signIn(page, role) {
  await page.goto(`${baseURL}/sign-in`);
  await page.getByLabel('Email').fill(emails[role]);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(1000);
  return visible(page);
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const owner = watch(await context.newPage(), 'owner');
  Object.assign(globalThis, { browser, context, owner, baseURL, emails, password, betaCode, events, watch, shot, dump, visible, signup, signIn });
  console.log(JSON.stringify({ ready: true, baseURL, emails, browserVersion: browser.version() }));
  const input = readline.createInterface({ input: process.stdin, terminal: false });
  for await (const line of input) {
    try {
      const result = await new (Object.getPrototypeOf(async function () {}).constructor)(`return (${line})`)();
      console.log('RESULT ' + JSON.stringify(result ?? null));
    } catch (error) {
      console.log('ERROR ' + String(error?.stack ?? error));
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
