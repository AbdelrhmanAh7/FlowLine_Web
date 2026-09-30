import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, mkdtempSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';
const out = path.resolve('artifacts/beta-execution/20260930-landing-executor');
const cp = JSON.parse(readFileSync(path.join(out,'checkpoint-25.json'),'utf8'));
const privateDir = path.resolve('artifacts/beta-execution/.profile/local-staging-20260930');
const index = path.join(mkdtempSync(path.join(privateDir,'gate-index-')),'index');
const git = (...args) => execFileSync('git',args,{encoding:'utf8',env:{...process.env,GIT_INDEX_FILE:index},stdio:['ignore','pipe','pipe']}).trim();
const verify = () => {
  git('read-tree','HEAD'); git('add','--',...Object.keys(cp.inputs));
  const tree = git('write-tree');
  if (Object.entries(cp.inputs).some(([p,v])=>git('rev-parse',tree+':'+p)!==v)) throw new Error('Frozen execution inputs changed');
};
const known = [];
for (const file of ['.env','.env.test','.env.local',path.join(privateDir,'.env')]) if (existsSync(file)) {
  for (const [key,value] of Object.entries(parseEnv(readFileSync(file,'utf8')))) if (/KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|ADMINS/.test(key) && value.length>=8) {
    known.push(value);
    if (key==='DATABASE_URL') { try { known.push(decodeURIComponent(new URL(value).password)); } catch {} }
  }
}
const secrets = [...new Set(known.filter(v=>v.length>=8))].sort((a,b)=>b.length-a.length);
const sanitize = line => {
  for (const value of secrets) line=line.split(value).join('[redacted]');
  return line.replace(/([?&](?:token|code|state|secret|key)=)[^&\s]+/gi,'$1[redacted]').replace(/Bearer\s+[^\s"']+/gi,'Bearer [redacted]');
};
const result = {at:new Date().toISOString(),checkpoint:cp.commit,supervisorPid:process.pid,sequence:[],independentReview:false,providerCalls:0};
const save = () => writeFileSync(path.join(out,'cp25-nonbrowser-gates.json'),JSON.stringify(result,null,2));
let active = null;
let unsafe = false;
const terminate = () => { if (active?.pid && active.exitCode===null) spawn('taskkill',['/PID',String(active.pid),'/T','/F'],{stdio:'ignore',windowsHide:true}); };
const memory = () => {
  const sample = JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','$gateMemory=Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{freePhysicalKiB=$gateMemory.FreePhysicalMemory;freeVirtualKiB=$gateMemory.FreeVirtualMemory}|ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true}));
  appendFileSync(path.join(out,'cp25-gate-memory.jsonl'),JSON.stringify({at:new Date().toISOString(),...sample})+'\n');
  if (sample.freePhysicalKiB<3*1024*1024 || sample.freeVirtualKiB<4*1024*1024) {unsafe=true;terminate();}
};
process.on('SIGINT',terminate);process.on('SIGTERM',terminate);
const tasks = [
  ['lint',['-s','lint']], ['typecheck',['-s','typecheck']],
  ['benchmark-typecheck',['exec','tsc','--noEmit','--project','artifacts/beta-execution/20260930T122429Z/copilot-hub-check.tsconfig.json']],
  ['unit',['-s','test','--maxWorkers=1']], ['contract',['-s','test:contract','--maxWorkers=1']],
  ['integration',['-s','test:integration','--maxWorkers=1']], ['evidence',['-s','check:evidence']],
];
let timer;
try {
  verify();memory();if(unsafe)throw new Error('Unsafe memory');
  timer=setInterval(memory,15000);
  for (const [name,args] of tasks) {
    verify();
    const row={name,startedAt:new Date().toISOString(),command:'pnpm '+args.join(' ')};result.sequence.push(row);save();
    const log=path.join(out,'cp25-'+name+'.log');writeFileSync(log,'',{flag:'wx'});
    active=spawn('pnpm.cmd',args,{shell:true,windowsHide:true,stdio:['ignore','pipe','pipe']});row.pid=active.pid;save();
    for(const stream of [active.stdout,active.stderr]) {
      let buffer='';stream.on('data',bytes=>{buffer+=bytes.toString('utf8');const lines=buffer.split(/\r?\n/);buffer=lines.pop();for(const line of lines)appendFileSync(log,sanitize(line)+'\n');});
      stream.on('end',()=>{if(buffer)appendFileSync(log,sanitize(buffer)+'\n');});
    }
    console.log(JSON.stringify({name,state:'START',pid:active.pid,checkpoint:cp.commit}));
    row.exitCode=await new Promise(resolve=>{active.once('exit',resolve);active.once('error',()=>resolve(127));});
    row.endedAt=new Date().toISOString();save();console.log(JSON.stringify({name,state:'END',exitCode:row.exitCode}));
    if(row.exitCode!==0 || unsafe)throw new Error('Gate failed or unsafe pressure');
  }
  verify();result.status='PASS';save();console.log('Sequential cp25 non-browser gates PASS. Browser gates and Claude review remain pending.');
} catch {result.status=unsafe?'STOP_UNSAFE_PRESSURE':'FAIL';save();process.exitCode=1;console.log('Gate stopped; sanitized evidence retained.');}
finally {clearInterval(timer);}

