import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
const out='artifacts/beta-execution/20260930-landing-executor';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024});
const report=JSON.parse(readFileSync(`${out}/precommit-scan.json`));
writeFileSync(`${out}/precommit-raw-detections.json`,JSON.stringify(report,null,2));
const sample=parseEnv(git('show','HEAD:.env.example'));
const samplePassword=decodeURIComponent(new URL(sample.DATABASE_URL).password);
if(samplePassword.length<12)throw Error('No exact documented development default');
const forms=[];
const files=['.env','.env.test','.env.local','../FlowLine/.env.test','../FL-wt-aihub/.env.test','artifacts/beta-execution/.profile/local-staging-20260930/.env'];
for(const file of files){
 if(!existsSync(file))continue;
 for(const [key,value]of Object.entries(parseEnv(readFileSync(file,'utf8')))){
  if(!/KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/.test(key))continue;
  let documented=false;const values=[value];
  if(key==='DATABASE_URL'){
   const url=new URL(value);const password=decodeURIComponent(url.password);values.push(password);
   documented=password===samplePassword&&['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname)&&url.pathname.startsWith('/flowline');
  }
  for(const v of values)if(v.length>=12&&!/fake/i.test(v))for(const encoded of [v,encodeURIComponent(v),JSON.stringify(v).slice(1,-1)])forms.push({value:encoded,variable:file+':'+key,documented});
 }
}
const classified=[];
for(const hit of report.hits){
 if(!hit.startsWith('history:'))throw Error('A newly staged credential matched; do not publish');
 const oid=hit.split(':')[1];const text=git('cat-file','blob',oid);
 const matched=forms.filter(f=>text.includes(f.value));
 if(!matched.length||matched.some(f=>!f.documented))throw Error('Undocumented credential matched; do not publish');
 classified.push({path:hit,variables:[...new Set(matched.map(f=>f.variable))],exactCommittedDevelopmentDefault:true,loopbackFlowlineDatabase:true});
}
const classification={at:new Date().toISOString(),rawDetectionStatus:report.status,classifiedStatus:'PASS_CLASSIFIED',rawDetectionPaths:report.hits,stagedMatches:0,unclassifiedMatches:0,documentedDevelopmentDefaults:classified,limits:'No values emitted. Existing documented loopback development DB defaults are not private vendor/auth/encryption keys. Defaults are not production credentials. Raw detections preserved; no rotation or host/database change performed.'};
writeFileSync(`${out}/development-default-classification.json`,JSON.stringify(classification,null,2));
report.classifiedStatus=classification.classifiedStatus;report.unclassifiedHits=[];report.classificationEvidence=`${out}/development-default-classification.json`;
writeFileSync(`${out}/precommit-scan.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({classifiedStatus:report.classifiedStatus,stagedMatches:0,documentedHistoricalMatches:classified.length,unclassifiedMatches:0}));
