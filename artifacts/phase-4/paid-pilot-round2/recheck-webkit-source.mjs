import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='artifacts/phase-4/paid-pilot-round2';
const evidence=JSON.parse(readFileSync(`${dir}/worker-b/SOURCE_EVIDENCE.json`,'utf8'));
const paths=['e2e/tools/browser-docker.sh','scripts/gate-browser-native.mjs','worker/index.ts','scripts/gate.mjs'];
const rows=paths.map(path=>{
 const blob=execFileSync('git',['rev-parse',`main:${path}`],{encoding:'utf8'}).trim();
 const original=evidence.sourceBlobs.find(x=>x.path===path);
 return {path,currentMainBlob:blob,failingCandidateBlob:original?.candidateBlob,match:blob===original?.candidateBlob};
});
writeFileSync(`${dir}/WEBKIT_LEAD_READONLY_RECHECK.json`,JSON.stringify({at:new Date().toISOString(),main:execFileSync('git',['rev-parse','main'],{encoding:'utf8'}).trim(),rows,disposition:'ROOT_CAUSE_UNPROVEN',limits:'Read-only source and preserved findings; no raw trace/log re-extraction, instrumentation, CI dispatch, stack, browser, build or tests. Original ECONNRESET incident is distinct from PR14 Output-tab timeout. Native runner path excludes Docker-network patch as a causal fix; finally(done) is not persisted success. Missing socket reuse/request arrival/process-resource evidence prevents a causal diagnosis.'},null,2)+'\n');
if(rows.some(x=>!x.match))throw Error('Source drift; revise interpretation');
console.log(JSON.stringify(rows));
