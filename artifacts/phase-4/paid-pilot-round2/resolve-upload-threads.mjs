import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const dir='artifacts/phase-4/paid-pilot-round2';
if(existsSync(`${dir}/UPLOAD_THREAD_DISPOSITIONS.json`))throw Error('Already disposed');
const s=JSON.parse(readFileSync(`${dir}/snapshots/pr-18.json`,'utf8'));
if(s.pr.headRefOid!=='360078e9d3357267711f006888b578f5a0c6c434')throw Error('Head changed');
const replies={
 'src/server/retained-files.ts':'Valid Major, deferred and NOT repaired per Fable decision19. The full-table aggregate under the installation-wide lock is row-count proportional, and byte caps do not bound row count. PR18 remains BLOCKED on complete M5/scale acceptance: scaling risk is disclosed, not accepted. Followup must maintain installation/workspace retained-byte counters transactionally on every insertion/deletion/cascade path, including knowledge-source deletion and failed Company Builder installation rollback; add a Drizzle migration/backfill and concurrency, deletion and backfill-fault regressions. A generated length column alone is explicitly not a fix. No scale measurement or owner acceptance is claimed. Ledger: https://github.com/AbdelrhmanAh7/FlowLine_Web/blob/codex/paid-pilot-round2-20261003/docs/implementation/PAID_PILOT_STATUS.md . This thread resolution records deferral only.',
 'artifacts/phase-4/paid-pilot-round1/upload-admission/run-focused.mjs':'Valid, deferred and NOT repaired per Fable decision19. baseSha is a literal and the helper inherits process.env. DO NOT RUN it until source identity and environment authority are corrected: compute tested HEAD and tracked-file diff digest, refuse untracked src/tests changes, and allowlist child environment. Historical results are not backfilled or rerun. Immutable fast Gate37100978121 on candidate360078e is the authoritative current CI evidence; no claim of fresh execution of this helper. PR18 remains BLOCKED on complete M5/scale acceptance.'
};
const records=[];
for(const t of s.pr.reviewThreads.nodes.filter(t=>!t.isResolved)){
 const body=replies[t.path];if(!body)throw Error('Unexpected finding');
 const c=t.comments.nodes.find(c=>c.author?.login==='coderabbitai');
 const input=`${dir}/upload-thread-${c.databaseId}.json`;writeFileSync(input,JSON.stringify({body}));
 const reply=JSON.parse(execFileSync('gh',['api',`repos/AbdelrhmanAh7/FlowLine_Web/pulls/18/comments/${c.databaseId}/replies`,'--method','POST','--input',input],{encoding:'utf8'}));
 const q=`mutation {resolveReviewThread(input:{threadId:"${t.id}"}){thread{id isResolved}}}`;
 const resolution=JSON.parse(execFileSync('gh',['api','graphql','-f',`query=${q}`],{encoding:'utf8'}));
 records.push({thread:t.id,path:t.path,reply:reply.html_url,resolution,disposition:'VALID; DEFERRED; NOT REPAIRED'});
}
const original=readFileSync(`${dir}/worker-a/paid-pilot-upload-admission-20261003.md`,'utf8');
const bodyFile=`${dir}/UPLOAD_UPDATED_PR_BODY.md`;
writeFileSync(bodyFile,original+'\nCurrent round2 status: fast Gate37100978121 passed; exact-head CodeRabbit reviewed360078e. Both findings were acknowledged/replied and resolved as deferred, not repaired. **BLOCKED: valid Major row-count-proportional scan under the installation lock remains. Scaling risk is disclosed, not accepted; acceptance requires maintained transactional counters or an explicit owner decision for the bounded pilot.** Counter maintenance, migration/backfill and insert/delete/cascade regressions are still required. The archived focused runner is DO NOT RUN until computed source identity, untracked-source refusal and an allowlisted child environment are implemented. No scale proof, local rerun or merge.\n');
execFileSync('gh',['pr','edit','18','--body-file',bodyFile],{encoding:'utf8'});
writeFileSync(`${dir}/UPLOAD_THREAD_DISPOSITIONS.json`,JSON.stringify({at:new Date().toISOString(),head:s.pr.headRefOid,records},null,2)+'\n');
console.log(JSON.stringify(records));
