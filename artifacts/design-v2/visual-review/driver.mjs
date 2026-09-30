import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
const root = path.resolve('artifacts/design-v2/visual-review');
const context = await chromium.launchPersistentContext(path.join(root,'.profile'), {channel:'chrome',headless:true,viewport:{width:1440,height:1000},baseURL:'http://localhost:3100'});
const page=context.pages()[0] ?? await context.newPage();
page.setDefaultTimeout(12000);
const state={};
const measurements=[];
const shot=async(name)=>{
 await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(450);
 await page.screenshot({path:path.join(root,'screenshots',name+'.png'),fullPage:false});
 measurements.push({name,url:page.url().replace(/token=[^&]+/g,'token=REDACTED'),...await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,lang:document.documentElement.lang,dir:document.documentElement.dir,theme:document.documentElement.dataset.theme,font:getComputedStyle(document.body).fontFamily}))});
 await fs.writeFile(path.join(root,'capture-metadata.json'),JSON.stringify(measurements,null,2));
 console.log('CAPTURE '+name);
};
const prefs=async(theme,lang)=>{await context.addCookies([{name:'fl_theme',value:theme,url:'http://localhost:3100'},{name:'fl_locale',value:lang,url:'http://localhost:3100'}]);};
console.log('READY '+context.browser().version());
for await(const line of readline.createInterface({input:process.stdin,terminal:false})){
 try {if(line==='CLOSE'){await context.close();console.log('CLOSED');break;} const result=await eval('(async()=>{'+line+'})()'); if(result!==undefined) console.log(JSON.stringify(result));console.log('DONE');}catch(e){console.log('ERROR '+e.message.replace(/token=[^&\s]+/g,'token=REDACTED'));}
}
