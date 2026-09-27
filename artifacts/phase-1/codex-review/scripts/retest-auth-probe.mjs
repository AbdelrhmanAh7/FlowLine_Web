import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const root = 'artifacts/phase-1/codex-review';
const prior = JSON.parse(readFileSync(`${root}/retest-journey-results.json`, 'utf8'));
const events = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL:'http://localhost:3100', viewport:{width:1440,height:900} });
const page = await context.newPage();
page.on('request', r => { if (r.url().includes('/api/auth/')) events.push({event:'request',method:r.method(),url:r.url()}); });
page.on('response', r => { if (r.url().includes('/api/auth/')) events.push({event:'response',status:r.status(),url:r.url()}); });
page.on('requestfailed', r => events.push({event:'failed',url:r.url(),failure:r.failure()}));
try {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(prior.email);
  await page.getByLabel('Password').fill('Codex-Test-Pass-1');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  try { await page.waitForURL(/\/w\//,{timeout:45000}); } catch {}
  await page.screenshot({path:`${root}/screenshots/retest-auth-probe.png`});
  console.log(JSON.stringify({url:page.url(),body:(await page.locator('body').innerText()).slice(0,700),events},null,2));
} finally { writeFileSync(`${root}/retest-auth-probe.json`,JSON.stringify({events,url:page.url()},null,2)); await browser.close(); }
