const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {chromium, expect} = require('@playwright/test');
const dir = __dirname;
const secrets = [];
const redact = value => secrets.reduce((s,k) => s.split(k).join('[REDACTED]'), typeof value === 'string' ? value : JSON.stringify(value,null,2)).replace(/([?&]token=)[^&\s"<>]+/g,'$1[REDACTED]');
const save = (name, value) => fs.writeFileSync(path.join(dir,name),redact(value));
(async()=>{
 const browser = await chromium.launch({channel:'chrome',headless:true});
 const context = await browser.newContext({baseURL:'http://localhost:3100',viewport:{width:1440,height:900}});
 const page = await context.newPage();
 page.setDefaultTimeout(12000);
 const events = {console:[],pageErrors:[],httpErrors:[],failedRequests:[],urls:[],apiResponses:[]};
 page.on('console',m=>{if(['warning','error'].includes(m.type()))events.console.push({type:m.type(),text:m.text(),location:m.location()});});
 page.on('pageerror',e=>events.pageErrors.push(String(e)));
 page.on('request',r=>events.urls.push(r.url()));
 page.on('requestfailed',r=>events.failedRequests.push({url:r.url(),error:r.failure()}));
 page.on('response',async r=>{if(r.status()>=400)events.httpErrors.push({url:r.url(),status:r.status()});if(r.url().includes('/api/'))events.apiResponses.push({url:r.url(),status:r.status(),body:await r.text().catch(()=>'<unavailable>')});});
 const cdp = await context.newCDPSession(page);
 const version = await cdp.send('Browser.getVersion');
 save('chrome-version.json',version);
 const email = 'cxq-c2fd494-'+Date.now()+'@flowline-qa.test';
 const password = 'Qa!'+randomUUID();
 const key = 'sk-fake-CXQ-'+randomUUID().replaceAll('-','');
 secrets.push(password,key);
 const state = {};
 fs.mkdirSync(path.join(dir,'screenshots'),{recursive:true});
 const shot = async name => page.screenshot({path:path.join(dir,'screenshots',name+'.png'),fullPage:false,mask:[page.locator('input[type=password]')]});
 const snap = async()=>({url:page.url(),text:await page.locator('body').innerText()});
 save('ready.json',{version:version.product,email});
 let last='';
 while(true){
  if(fs.existsSync(path.join(dir,'command.json'))){
   const command=JSON.parse(fs.readFileSync(path.join(dir,'command.json'),'utf8'));
   if(command.id!==last){
    last=command.id;
    try{const result=await eval('(async()=>{'+command.code+'})()');save('result.json',{id:last,ok:true,result});}
    catch(e){save('result.json',{id:last,ok:false,error:String(e),snapshot:await snap().catch(()=>null)});}
    if(command.close){await browser.close();break;}
   }
  }
  await new Promise(r=>setTimeout(r,150));
 }
})().catch(e=>{save('fatal.json',String(e));process.exitCode=1;});
