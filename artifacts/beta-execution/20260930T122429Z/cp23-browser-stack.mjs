import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import readline from 'node:readline';
const root=process.cwd(),out=path.resolve('artifacts/beta-execution/20260930T122429Z');
const cp=JSON.parse(readFileSync(path.join(out,'checkpoint-23.json'),'utf8'));
const privateDir=path.resolve('artifacts/beta-execution/.profile/local-staging-20260930/cp23-e2e');
mkdirSync(privateDir,{recursive:true});
const dist=path.relative(root,path.join(privateDir,'build')).replaceAll('\\','/');
const env={...process.env,...parseEnv(readFileSync('.env.test','utf8')),NEXT_DIST_DIR:dist,FLOWLINE_RELEASE_SHA:cp.commit,NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:'--max-old-space-size=2048'};
const dburl=new URL(env.DATABASE_URL);
if(env.FLOWLINE_ENV!=='test'||dburl.pathname!=='/flowline_test_dv2'||!['localhost','127.0.0.1','[::1]'].includes(dburl.hostname))throw new Error('Named isolated test DB required');
env.FLOWLINE_AI_TEST_OVERRIDE??='http://127.0.0.1:4011';
for(const k of ['FLOWLINE_AI_PROVIDER','FLOWLINE_AI_MODEL','OLLAMA_BASE_URL','OLLAMA_MODEL','ANTHROPIC_API_KEY','ANTHROPIC_MODEL','OPENAI_API_KEY'])delete env[k];
const secrets=Object.entries(env).filter(([k,v])=>/KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/.test(k)&&v?.length>=8).map(([,v])=>v);
secrets.push(decodeURIComponent(dburl.password));
const clean=line=>{for(const s of secrets.filter(s=>s.length>=8))line=line.split(s).join('[redacted]');return line.replace(/([?&](?:code|state|token|secret|key)=)[^&\s]+/gi,'$1[redacted]');};
const report={at:new Date().toISOString(),checkpoint:cp.commit,supervisorPid:process.pid,port:3100,database:'flowline_test_dv2',oneBuild:true,processes:[],state:'PREPARING',stopCommand:'write_stdin this supervised session with stop plus newline; only owned child trees'};
const save=()=>writeFileSync(path.join(out,'cp23-browser-stack.json'),JSON.stringify(report,null,2));
const children=new Set();let stopping=false;
function child(label,args,extra={}){
 const p=spawn(process.execPath,args,{cwd:root,env:{...env,...extra},stdio:['ignore','pipe','pipe'],windowsHide:true});children.add(p);
 const row={label,pid:p.pid,at:new Date().toISOString()};report.processes.push(row);save();
 for(const stream of [p.stdout,p.stderr]){let buffer='';stream.on('data',b=>{buffer+=b.toString('utf8');const lines=buffer.split(/\r?\n/);buffer=lines.pop();for(const l of lines)appendFileSync(path.join(out,'cp23-browser-stack.log'),'['+label+'] '+clean(l)+'\n');});stream.on('end',()=>{if(buffer)appendFileSync(path.join(out,'cp23-browser-stack.log'),clean(buffer)+'\n');});}
 p.on('exit',(code,signal)=>{children.delete(p);Object.assign(row,{exitCode:code,signal,endedAt:new Date().toISOString()});save();});return p;
}
function stop(code=0){if(stopping)return;stopping=true;for(const p of children)if(p.pid&&p.exitCode===null)spawn('taskkill',['/PID',String(p.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});report.stoppedAt=new Date().toISOString();save();setTimeout(()=>process.exit(code),1000);}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());readline.createInterface({input:process.stdin}).on('line',line=>{if(line.trim()==='stop')stop();});
function memory(){const m=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','$browserGateMemory=Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{freePhysicalKiB=$browserGateMemory.FreePhysicalMemory;freeVirtualKiB=$browserGateMemory.FreeVirtualMemory}|ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true}));appendFileSync(path.join(out,'cp23-browser-memory.jsonl'),JSON.stringify({at:new Date().toISOString(),...m})+'\n');if(m.freePhysicalKiB<3*1024*1024||m.freeVirtualKiB<4*1024*1024){report.state='STOP_UNSAFE_PRESSURE';save();stop(2);}}
async function run(label,args,extra){const p=child(label,args,extra);const code=await new Promise(r=>{p.once('exit',r);p.once('error',()=>r(127));});if(code!==0)throw new Error('Owned preparation failed');}
const digest=b=>createHash('sha256').update(b).digest('hex');
try{
 for(const port of [3100,4010,4011])await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(new Error('Test port occupied; preserve owner')));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
 const index=path.join(mkdtempSync(path.join(privateDir,'index-')),'index');const git=(...a)=>execFileSync('git',a,{encoding:'utf8',env:{...process.env,GIT_INDEX_FILE:index},stdio:['ignore','pipe','pipe']}).trim();
 git('read-tree','HEAD');git('add','--',...Object.keys(cp.inputs));const tree=git('write-tree');if(Object.entries(cp.inputs).some(([p,v])=>git('rev-parse',tree+':'+p)!==v))throw new Error('Candidate changed');
 memory();setInterval(memory,15000);
 await run('migrate',['node_modules/tsx/dist/cli.mjs','src/db/migrate.ts']);
 await run('seed-test-platform',['node_modules/tsx/dist/cli.mjs','scripts/test/seed-platform.mts']);
 const before=readFileSync('tsconfig.json');report.tsconfigPreimageSha256=digest(before);report.state='BUILDING_NO_BROWSER_EXPLORATION';save();console.log('cp23 isolated test build START; no browser exploration.');
 let buildError;try{await run('build',['node_modules/next/dist/bin/next','build'],{NODE_ENV:'production'});}catch(e){buildError=e;}
 const after=readFileSync('tsconfig.json');if(digest(before)!==digest(after)){const a=JSON.parse(before),b=JSON.parse(after),ai=a.include,bi=b.include;delete a.include;delete b.include;if(JSON.stringify(a)!==JSON.stringify(b)||ai.some(s=>!bi.includes(s))||bi.some(s=>!ai.includes(s)&&!s.startsWith(dist+'/')))throw new Error('Unexpected tsconfig change; preserved');writeFileSync('tsconfig.json',before);report.tsconfigRestored=true;save();}
 if(buildError)throw buildError;report.buildId=readFileSync(path.join(root,dist,'BUILD_ID'),'utf8').trim();
 const owned=[child('fake-providers',['node_modules/tsx/dist/cli.mjs','e2e/fakes/provider-server.ts','--port','4010']),child('fake-ai',['node_modules/tsx/dist/cli.mjs','e2e/fakes/ai-server.ts','--port','4011']),child('web',['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3100'],{NODE_ENV:'production'}),child('worker',['node_modules/tsx/dist/cli.mjs','worker/index.ts'],{NODE_ENV:'production'})];
 for(const p of owned)p.once('exit',()=>{if(!stopping){report.state='CHILD_EXITED';save();stop(1);}});
 let ready=false;for(let i=0;i<40&&!stopping;i++){try{const r=await fetch('http://localhost:3100/api/health?require=worker',{signal:AbortSignal.timeout(4000)});const h=await r.json();if(r.ok&&h.revision===cp.commit&&h.schemaVersion===20&&h.worker==='ok'&&h.db==='ok'){report.health=h;ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
 if(!ready)throw new Error('Bounded readiness failed');report.state='READY';save();console.log(JSON.stringify({state:'READY',checkpoint:cp.commit,buildId:report.buildId,port:3100,schemaVersion:20,oneBuild:true}));
 await new Promise(()=>{});
}catch{report.state='FAILED';save();console.log('cp23 browser stack failed; sanitized evidence retained.');stop(1);}
