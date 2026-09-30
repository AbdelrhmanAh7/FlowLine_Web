import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const out=path.resolve('artifacts/beta-execution/20260930-landing-executor/chrome-landing');
mkdirSync(out,{recursive:true});
const profile=path.resolve('artifacts/beta-execution/.profile/landing-cp24-'+Date.now());
const cp=JSON.parse(readFileSync('artifacts/beta-execution/20260930-landing-executor/checkpoint-24.json','utf8'));
const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,reducedMotion:'no-preference',viewport:{width:1440,height:950}});
const record={checkpoint:cp.commit,buildId:readFileSync('.next-test/BUILD_ID','utf8').trim(),method:'Agent-driven Google Chrome exploratory QA via Playwright',headed:true,isolatedProfile:true,version:context.browser()?.version(),checks:[],scope:'Landing journey 1 only; no auth or provider pages; test doubles only'};
const page=context.pages()[0];const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await context.addCookies([{name:'fl_locale',value:'ar',url:'http://localhost:3100'},{name:'fl_theme',value:'light',url:'http://localhost:3100'}]);
 await page.goto('http://localhost:3100/',{waitUntil:'networkidle'});
 for(const id of ['templates','pricing','product']){
  await page.locator(`header a[href="#${id}"]`).click();
  await expect.poll(async()=>await page.locator(`#${id}`).evaluate(el=>Math.abs(el.getBoundingClientRect().top))).toBeLessThan(100);
  record.checks.push({header:id,status:'PASS',scrollY:await page.evaluate(()=>window.scrollY),hash:new URL(page.url()).hash});
 }
 await page.evaluate(()=>window.scrollTo(0,0));
 for(const locale of ['ar','en']){
  const language=page.getByTestId('landing-preferences').getByRole('group',{name:locale==='ar'?'Language':'اللغة'});
  if(locale==='en'){await language.getByRole('button',{name:'English',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('lang','en');}
  for(const theme of ['light','dark']){
   const label=locale==='ar'?(theme==='light'?'فاتح':'داكن'):(theme==='light'?'Light':'Dark');
   await page.getByTestId('landing-preferences').getByRole('button',{name:label,exact:true}).click();
   await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
   for(const width of [360,768,1024,1440]){
    await page.setViewportSize({width,height:950});await page.evaluate(()=>window.scrollTo(0,0));
    await expect(page.getByRole('img')).toContainText(locale==='ar'?'يبدأ سير العمل':'Starts the flow');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByRole('img').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${locale}-${theme}-${width}-hero.png`)});
    await page.getByRole('heading',{name:locale==='ar'?'تابع سير العمل خطوة بخطوة':'Follow a flow step by step'}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,`${locale}-${theme}-${width}-flow.png`)});
    await page.locator('#pricing').scrollIntoViewIfNeeded();await expect(page.locator('#pricing')).toContainText(locale==='ar'?'لم تُعلن الأسعار':'Pricing isn’t announced');
    record.checks.push({locale,theme,width,status:'PASS',overflow:false,plainLabels:true,pricingHonest:true});
   }
  }
 }
 await page.setViewportSize({width:360,height:950});await page.evaluate(()=>window.scrollTo(0,0));
 await page.locator('header a[href="/"]').first().focus();await page.keyboard.press('Tab');await expect(page.locator(':focus')).toHaveAccessibleName('Light');await page.keyboard.press('Enter');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 record.keyboard='PASS';expect(errors).toEqual([]);record.consoleErrors=0;record.status='PASS';
}catch(e){record.status='FAIL';record.error=String(e).replace(/[A-Za-z0-9+/_-]{32,}/g,'[redacted]');process.exitCode=1;}
finally{await context.close();record.stopped=true;writeFileSync(path.join(out,'REPORT.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({status:record.status,version:record.version,checks:record.checks.length,stopped:true}));}
