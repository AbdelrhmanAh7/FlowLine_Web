import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),out=path.resolve('artifacts/beta-execution/20260930-landing-executor');
const cp=JSON.parse(readFileSync(path.join(out,'checkpoint-26.json'),'utf8'));
const stack={state:'READY',checkpoint:cp.commit,buildId:readFileSync('.next-test/BUILD_ID','utf8').trim(),health:await (await fetch('http://localhost:3100/api/health?require=worker')).json()};
writeFileSync(path.join(out,'cp26-browser-stack.json'),JSON.stringify(stack,null,2));
if(stack.state!=='READY'||stack.health?.revision!==stack.checkpoint)throw new Error('Frozen one-build stack not ready');
const record={at:new Date().toISOString(),checkpoint:stack.checkpoint,buildId:stack.buildId,supervisorPid:process.pid,oneBuild:true,workers:1,retries:0,trace:'off',failureScreenshots:'off',browsers:[],independentReview:false};
const save=()=>writeFileSync(path.join(out,'cp26-browsers.json'),JSON.stringify(record,null,2));
const redact=text=>text.replace(/([?&](?:code|state|token|secret|key)=)[^&\s"]+/gi,'$1[redacted]').replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g,'[redacted-long-value]');
let active=null,container=null,unsafe=false;
function stop(){if(container){try{execFileSync('docker',['stop','--time','2',container],{stdio:'ignore',windowsHide:true,timeout:10000});}catch{}}if(active?.pid&&active.exitCode===null)spawn('taskkill',['/PID',String(active.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
function memory(){const m=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','$suiteMemory=Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{freePhysicalKiB=$suiteMemory.FreePhysicalMemory;freeVirtualKiB=$suiteMemory.FreeVirtualMemory}|ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true}));appendFileSync(path.join(out,'cp26-suite-memory.jsonl'),JSON.stringify({at:new Date().toISOString(),...m})+'\n');if(m.freePhysicalKiB<3*1024*1024||m.freeVirtualKiB<4*1024*1024){unsafe=true;stop();}}
const dockerScript='set -e; mkdir -p /run/pw/artifacts/beta-execution/20260930-landing-executor; cp -r /source/e2e /run/pw/e2e; cp /source/playwright.config.ts /run/pw/playwright.config.ts; cp /source/control.config.ts /run/pw/artifacts/beta-execution/20260930-landing-executor/cp26-playwright.config.ts; cd /run/pw; npm init --yes >/dev/null; npm install --silent --no-audit --no-fund @playwright/test@1.63.0 >/dev/null; node e2e/tools/tcp-forward.mjs 3100 4010 4011 >/tmp/forward.log 2>&1 & forward=$!; trap "kill $forward 2>/dev/null || true" EXIT; npx playwright test --config artifacts/beta-execution/20260930-landing-executor/cp26-playwright.config.ts --project "$1" --workers=1 --retries=0 --trace=off --fail-on-flaky-tests --forbid-only --update-snapshots=none --output /out/results';
let timer;
try{
 const h=await fetch('http://localhost:3100/api/health?require=worker',{signal:AbortSignal.timeout(5000)});const health=await h.json();if(!h.ok||health.revision!==stack.checkpoint||health.worker!=='ok')throw new Error('Readiness drift');
 memory();if(unsafe)throw new Error('Memory pressure');timer=setInterval(memory,15000);
 for(const project of ['chromium','firefox','webkit']){
  const row={project,platform:project==='chromium'?'Windows':'Linux Docker',startedAt:new Date().toISOString(),checkpoint:stack.checkpoint,buildId:stack.buildId};record.browsers.push(row);save();
  const dest=path.join(out,'cp26-'+project);mkdirSync(dest,{recursive:false});
  let executable,args;
  if(project==='chromium'){
   executable=process.execPath;args=['node_modules/@playwright/test/cli.js','test','--config',path.join(out,'cp26-playwright.config.ts'),'--project',project,'--workers=1','--retries=0','--trace=off','--fail-on-flaky-tests','--forbid-only','--update-snapshots=none','--output',path.join(dest,'results')];
  }else{
   container='flowline-cp26-'+project+'-'+Date.now();row.container=container;
   executable='docker';args=['run','--rm','--name',container,'--memory','4g','--memory-swap','4g','--cpus','2','--ipc=host','--add-host','host.docker.internal:host-gateway','-v',path.join(root,'e2e')+':/source/e2e:ro','-v',path.join(root,'playwright.config.ts')+':/source/playwright.config.ts:ro','-v',path.join(out,'cp26-playwright.config.ts')+':/source/control.config.ts:ro','-v',dest+':/out','mcr.microsoft.com/playwright:v1.63.0-noble','bash','-c',dockerScript,'--',project];
  }
  active=spawn(executable,args,{cwd:root,env:{...process.env,PLAYWRIGHT_JSON_OUTPUT_NAME:'',PLAYWRIGHT_JSON_OUTPUT_FILE:''},stdio:['ignore','pipe','pipe'],windowsHide:true});row.pid=active.pid;save();console.log(JSON.stringify({project,state:'START',pid:active.pid,buildId:stack.buildId}));
  let stdout='',stderr='',progress=0;active.stdout.on('data',b=>{stdout+=b.toString('utf8');for(const m of b.toString('utf8').matchAll(/\[(\d+)\/(\d+)\]/g)){const done=Number(m[1]),total=Number(m[2]);if(total>20&&done>=progress+10){progress=done;row.progress={done,total};save();console.log(JSON.stringify({project,state:'PROGRESS',done,total}));}}});active.stderr.on('data',b=>{stderr+=b.toString('utf8');});
  row.exitCode=await new Promise(r=>{active.once('exit',r);active.once('error',()=>r(127));});row.endedAt=new Date().toISOString();container=null;
  writeFileSync(path.join(dest,'stderr.log'),redact(stderr),{flag:'wx'});
  const start=stdout.search(/\{\s*"config"\s*:/);let report;
  try{report=JSON.parse(stdout.slice(start));}catch{writeFileSync(path.join(dest,'stdout.log'),redact(stdout),{flag:'wx'});throw new Error('Missing browser JSON report');}
  writeFileSync(path.join(dest,'report.sanitized.json'),redact(JSON.stringify(report,null,2)),{flag:'wx'});
  row.stats=report.stats;row.version=report.config?.version;save();console.log(JSON.stringify({project,state:'END',exitCode:row.exitCode,stats:row.stats}));
  if(row.exitCode!==0||!row.stats?.expected||row.stats.unexpected||row.stats.skipped||row.stats.flaky||unsafe)throw new Error('Browser failure, skip, flake or pressure');
 }
 record.state='PASS';save();console.log('cp26 sequential browsers PASS; same frozen build; independent review still pending.');
}catch{record.state=unsafe?'STOP_UNSAFE_PRESSURE':'FAIL';save();stop();console.log('Browser gate stopped; existing evidence preserved and new sanitized diagnostics recorded.');process.exitCode=1;}
finally{clearInterval(timer);}

if (!process.exitCode) {
 console.log('READY_FOR_CHROME: automated runners stopped; supervised stack remains for one bounded public Chrome exploration. Enter done to stop.');
 const {createInterface}=await import('node:readline');
 const rl=createInterface({input:process.stdin});
 await new Promise(resolve=>rl.on('line',line=>{if(line.trim()==='done'){rl.close();resolve();}}));
}
