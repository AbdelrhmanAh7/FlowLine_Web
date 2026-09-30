import {chromium,expect} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const out='artifacts/beta-execution/20260930-landing-executor/chrome-main-handoff';
mkdirSync(out,{recursive:true});
const gate=JSON.parse(readFileSync('artifacts/beta-execution/20260930-landing-executor/cp28r1-browsers.json'));
if(gate.state!=='PASS')throw Error('Final browser run must complete first');
const context=await chromium.launchPersistentContext(path.resolve('artifacts/beta-execution/.profile/main-header-chrome'),{channel:'chrome',headless:false,viewport:{width:1440,height:900},reducedMotion:'no-preference'});
const record={at:new Date().toISOString(),checkpoint:gate.checkpoint,buildId:gate.buildId,method:'Agent-driven Google Chrome exploratory QA via Playwright',headed:true,dedicatedProfile:true,version:context.browser().version(),checks:[],state:'RUNNING',limits:'Public landing and account navigation only; no human usability, owner login or Company Builder acceptance.'};
const page=context.pages()[0]??await context.newPage();
page.setDefaultTimeout(15000);
try{
 for(const locale of ['en','ar']){
  await context.addCookies([{name:'fl_locale',value:locale,url:'http://localhost:3100'},{name:'fl_theme',value:'light',url:'http://localhost:3100'}]);
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://localhost:3100/');
  await expect(page.locator('html')).toHaveAttribute('lang',locale);
  await expect(page.locator('html')).toHaveClass(/lenis/);
  const hero=page.locator('h1'),text=await hero.textContent();
  const nav=page.getByRole('navigation',{name:locale==='en'?'Site navigation':'روابط الموقع'});
  for(const [name,id]of locale==='en'?[['Product','product'],['Templates','templates'],['Pricing','pricing']]:[['المنتج','product'],['القوالب','templates'],['الأسعار','pricing']]){
   await nav.getByRole('link',{name,exact:true}).press('Enter');
   await expect(page).toHaveURL(new RegExp('#'+id+'$'));
   await expect(page.locator('#'+id)).toBeInViewport();
   await page.getByRole('link',{name:locale==='en'?'Sign in':'تسجيل الدخول',exact:true}).press('Enter');
   await expect(page.getByRole('textbox',{name:locale==='en'?'Email':'البريد الإلكتروني',exact:true})).toBeVisible();
   await page.goBack();await expect(hero).toHaveText(text);await expect(nav).toBeVisible();
   await page.goForward();await expect(page).toHaveURL(/\/sign-in$/);await expect(nav).toHaveCount(0);
   await page.goBack();await expect(hero).toHaveText(text);
   record.checks.push({locale,section:id,keyboard:true,backForward:true,state:'PASS'});
  }
  for(const width of [1440,360]){
   await page.setViewportSize({width,height:900});await page.goto('http://localhost:3100/');
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
   await expect(page.getByRole('img')).not.toContainText(/JSONATA|JSON|IF \/ ELSE/);
   await page.screenshot({path:path.join(out,`landing-${locale}-light-${width}.png`)});
   record.checks.push({locale,width,plainCopy:true,overflow:false,state:'PASS'});
  }
 }
 record.state='PASS';
}catch(error){record.state='FAIL';record.error=error.message.replace(/http[^\s]+/g,'[public-local-url]');process.exitCode=1;}
finally{record.endedAt=new Date().toISOString();writeFileSync(path.join(out,'REPORT.json'),JSON.stringify(record,null,2));await context.close();console.log(JSON.stringify({state:record.state,checks:record.checks.length,version:record.version}));}
