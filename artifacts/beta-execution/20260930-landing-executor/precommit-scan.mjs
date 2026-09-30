import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
const out='artifacts/beta-execution/20260930-landing-executor';
const git=(...a)=>execFileSync('git',a,{maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']});
const staged=git('diff','--cached','--name-only','-z').toString().split('\0').filter(Boolean);
const forbidden=staged.filter(p=>p.split('/').some(n=>/^\.env|^helper-logs$|^\.profile$|^test-results/.test(n))||/KIMI_RESUME\.md|NOTES-draft\.md|closeout\/RESUME\.md|scratch-css\.mjs|gate\/\.current-run|\/STOP$|landing-reduced-ar-|trace\.zip/.test(p));
if(forbidden.length){console.log(JSON.stringify({forbidden}));process.exit(1);}
const secrets=new Set();
for(const file of ['.env','.env.test','.env.local','../FlowLine/.env.test','../FL-wt-aihub/.env.test','artifacts/beta-execution/.profile/local-staging-20260930/.env']){
 if(!existsSync(file))continue;
 for(const [name,v] of Object.entries(parseEnv(readFileSync(file,'utf8'))))if(/KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/.test(name)){
  const vals=[v];if(name==='DATABASE_URL'){try{vals.push(decodeURIComponent(new URL(v).password));}catch{}}
  for(const value of vals)if(value.length>=12&&!/fake/i.test(value)){secrets.add(value);secrets.add(encodeURIComponent(value));secrets.add(JSON.stringify(value).slice(1,-1));}
 }
}
if(!secrets.size)throw Error('No named current secret values available; incomplete scan');
const hits=[];const check=(bytes,p)=>{if(bytes.includes(0))return false;const text=bytes.toString('utf8');for(const value of secrets)if(text.includes(value)){hits.push(p);break;}return true;};
let stagedText=0;
for(const p of staged){if(git('diff','--cached','--diff-filter=D','--name-only','--',p).toString().trim())continue;if(check(git('show',':'+p),'staged:'+p))stagedText++;}
const entries=git('rev-list','--objects','HEAD').toString().trim().split('\n');let historyText=0;
for(const entry of entries){const [oid,...name]=entry.split(' ');if(git('cat-file','-t',oid).toString().trim()!=='blob')continue;if(check(git('cat-file','blob',oid),'history:'+oid+':'+name.join(' ')))historyText++;}
const report={at:new Date().toISOString(),head:git('rev-parse','HEAD').toString().trim(),stagedPaths:staged,stagedTextBlobs:stagedText,reachableTextBlobs:historyText,currentSecretForms:secrets.size,hits,forbidden,status:hits.length?'FAIL':'PASS',limits:'Current named keys and encoded forms; prior exposed-key scan recorded separately in key-rotation-history.json. Binary pixels, compressed and unreachable objects not certified. No secret values emitted.'};
writeFileSync(`${out}/precommit-scan.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,stagedText,historyText,hits:hits.length}));process.exitCode=hits.length?1:0;