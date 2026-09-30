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
const hits=[];
const check=(bytes,p)=>{
 const textFile=/\.(txt|log|md|json|jsonl|ts|tsx|js|mjs|cjs|mts|css|yml|yaml|sql|csv|html|sh|ps1|toml|example)$/i.test(p);
 let text;
 if(bytes[0]===255&&bytes[1]===254)text=new TextDecoder('utf-16le',{fatal:true}).decode(bytes);
 else if(bytes[0]===254&&bytes[1]===255)text=new TextDecoder('utf-16be',{fatal:true}).decode(bytes);
 else if(bytes.includes(0)){
  if(!textFile)return false;
  let evenZero=0,oddZero=0;const size=Math.min(bytes.length,2048);
  for(let i=0;i<size;i++)if(bytes[i]===0){if(i%2)oddZero++;else evenZero++;}
  const half=size/2;
  if(oddZero/half>0.6&&evenZero/half<0.15)text=new TextDecoder('utf-16le',{fatal:true}).decode(bytes);
  else if(evenZero/half>0.6&&oddZero/half<0.15)text=new TextDecoder('utf-16be',{fatal:true}).decode(bytes);
  else throw Error('Unknown NUL-containing text encoding; do not publish');
 }else text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 if(text.includes('\0'))throw Error('NUL in decoded text; do not publish');
 for(const value of secrets)if(text.includes(value)){hits.push(p);break;}
 return true;
};
const scanBatch=(entryList,prefix)=>{
const entries=entryList;let count=0;
const objectIds=entries.map(e=>e.split(' ')[0]);
const metadata=execFileSync('git',['cat-file','--batch-check'],{input:objectIds.join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']}).trim().split('\n');
if(metadata.length!==entries.length)throw Error('Incomplete object metadata');
const blobs=[];let totalBytes=0;
for(let i=0;i<metadata.length;i++){
 const [oid,type,sizeText]=metadata[i].split(' ');const size=Number(sizeText);
 if(oid!==objectIds[i]||!['blob','tree','commit','tag'].includes(type)||!Number.isSafeInteger(size)||size<0)throw Error('Invalid object metadata');
 if(type==='blob'){blobs.push({oid,size,name:entries[i].slice(oid.length+1)});totalBytes+=size;}
}
if(totalBytes>480*1024*1024)throw Error('Reachable blobs exceed bounded scan size');
const batch=execFileSync('git',['cat-file','--batch'],{input:blobs.map(b=>b.oid).join('\n')+'\n',maxBuffer:512*1024*1024,stdio:['pipe','pipe','pipe']});
let offset=0;
for(const blob of blobs){
 const newline=batch.indexOf(10,offset);if(newline<0)throw Error('Missing object header');
 const header=batch.subarray(offset,newline).toString('ascii');
 if(header!==`${blob.oid} blob ${blob.size}`)throw Error('Object header mismatch');
 offset=newline+1;const end=offset+blob.size;
 if(end>=batch.length||batch[end]!==10)throw Error('Incomplete object content');
 if(check(batch.subarray(offset,end),prefix+':'+blob.oid+':'+blob.name))count++;
 offset=end+1;
}
if(offset!==batch.length)throw Error('Unexpected batch data');

return count;};
const indexEntries=git('ls-files','--stage','-z').toString().split('\0').filter(Boolean);
const indexBlobs=new Map(indexEntries.map(entry=>{const tab=entry.indexOf('\t');const [mode,oid,stage]=entry.slice(0,tab).split(' ');if(stage!=='0')throw Error('Unmerged index');return [entry.slice(tab+1),{oid,mode}];}));
const stagedEntries=staged.map(p=>{const entry=indexBlobs.get(p);if(!entry||!['100644','100755','120000'].includes(entry.mode))throw Error('Unsupported staged entry');return entry.oid+' '+p;});
const stagedText=scanBatch(stagedEntries,'staged');
const historyText=scanBatch(git('rev-list','--objects','HEAD').toString().trim().split('\n'),'history');
const report={at:new Date().toISOString(),head:git('rev-parse','HEAD').toString().trim(),stagedPaths:staged,stagedTextBlobs:stagedText,reachableTextBlobs:historyText,currentSecretForms:secrets.size,hits,forbidden,status:hits.length?'FAIL':'PASS',limits:'Current named keys and encoded forms; prior exposed-key scan recorded separately in key-rotation-history.json. Binary pixels, compressed and unreachable objects not certified. No secret values emitted.'};
writeFileSync(`${out}/precommit-scan.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,stagedText,historyText,hits:hits.length}));process.exitCode=hits.length?1:0;
