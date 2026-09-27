import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const root='artifacts/phase-1/codex-review';
const prior=JSON.parse(readFileSync(`${root}/retest-journey-results.json`,'utf8'));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({baseURL:'http://localhost:3100',viewport:{width:1440,height:900}});
const page=await context.newPage();
const result={};
const drag=async(a,b)=>{const x=await a.boundingBox(),y=await b.boundingBox();await page.mouse.move(x.x+x.width/2,x.y+x.height/2);await page.mouse.down();await page.mouse.move(y.x+y.width/2,y.y+y.height/2,{steps:16});await page.mouse.up();await page.waitForTimeout(200);};
try{
 await page.goto('/sign-in');await page.getByLabel('Email').fill(prior.email);await page.getByLabel('Password').fill('Codex-Test-Pass-1');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(/\/w\//,{timeout:45000});
 await page.goto(prior.stages.journey.flowUrl);await page.locator('.react-flow__node').first().waitFor();
 const transform=page.locator('.react-flow__node[data-id="normalise"]');
 const trigger=page.locator('.react-flow__node').filter({hasText:'TRIGGER · MANUAL'}).first();
 const output=page.locator('.react-flow__node').filter({hasText:'OUTPUT · RESULT'}).first();
 result.initialEdges=await page.locator('.react-flow__edge').count();
 result.triggerInputHandles=await trigger.locator('.react-flow__handle.target').count();
 result.outputSourceHandles=await output.locator('.react-flow__handle.source').count();
 await drag(transform.locator('.react-flow__handle.source'),trigger);
 result.afterIntoTrigger=await page.locator('.react-flow__edge').count();
 await page.screenshot({path:`${root}/screenshots/retest-connection-into-trigger.png`});
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await drag(output,transform.locator('.react-flow__handle.target'));
 result.afterOutOfOutput=await page.locator('.react-flow__edge').count();
 await page.screenshot({path:`${root}/screenshots/retest-connection-out-of-output.png`});
 console.log(JSON.stringify(result));
}finally{writeFileSync(`${root}/retest-unavailable-connections-results.json`,JSON.stringify(result,null,2));await browser.close();}
