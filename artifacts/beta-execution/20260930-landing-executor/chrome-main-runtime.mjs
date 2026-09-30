import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createInterface} from 'node:readline';
const out='artifacts/beta-execution/20260930-landing-executor';
const cp=JSON.parse(readFileSync(`${out}/checkpoint-28.json`));
const prior=JSON.parse(readFileSync(`${out}/cp28r1-browsers.json`));
if(prior.state!=='PASS'||readFileSync('.next-test/BUILD_ID','utf8').trim()!==prior.buildId)throw Error('Gated build required');
const testEnv=parseEnv(readFileSync('.env.test','utf8'));
if(testEnv.FLOWLINE_ENV!=='test')throw Error('Test environment required');
const env={...process.env,...testEnv,NEXT_DIST_DIR:'.next-test',FLOWLINE_RELEASE_SHA:cp.commit,NODE_ENV:'production'};
const values=Object.entries(testEnv).filter(([k,v])=>/KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL/.test(k)&&v.length>=8).map(([,v])=>v);
const clean=s=>{for(const v of values)s=s.split(v).join('[redacted]');return s.replace(/([?&](?:code|state|token|secret|key)=)[^&\s]+/gi,'$1[redacted]');};
const web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3100'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
const record={at:new Date().toISOString(),checkpoint:cp.commit,buildId:prior.buildId,pid:web.pid,supervisorPid:process.pid,onlyPublicPage:true,noRebuild:true,stop:'stop plus newline in this supervised session; then pnpm stop:test'};
const save=()=>writeFileSync(`${out}/chrome-main-runtime-runtime.json`,JSON.stringify(record,null,2));save();
for(const stream of [web.stdout,web.stderr]){let buffer='';stream.on('data',b=>{buffer+=b.toString();const lines=buffer.split(/\r?\n/);buffer=lines.pop();for(const line of lines)appendFileSync(`${out}/chrome-main-runtime-runtime.log`,clean(line)+'\n');});}
let stopped=false;function stop(){if(stopped)return;stopped=true;execFileSync('taskkill',['/PID',String(web.pid),'/T','/F'],{stdio:'ignore'});record.stoppedAt=new Date().toISOString();save();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);web.on('exit',()=>{if(!stopped){record.unexpectedExit=true;save();process.exit(1);}});
setTimeout(stop,12*60*1000);
setInterval(()=>{const m=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','$chromeMemory=Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{physical=$chromeMemory.FreePhysicalMemory;virtual=$chromeMemory.FreeVirtualMemory}|ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true}));appendFileSync(`${out}/chrome-main-runtime-memory.jsonl`,JSON.stringify(m)+'\n');if(m.physical<3*1024*1024||m.virtual<4*1024*1024)stop();},15000);
createInterface({input:process.stdin}).on('line',s=>{if(s.trim()==='stop')stop();});
console.log('Gated build public Chrome runtime started; stop plus newline; 12-minute bound.');