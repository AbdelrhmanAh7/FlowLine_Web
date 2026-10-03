import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='artifacts/phase-4/paid-pilot-round2';
const s=JSON.parse(readFileSync(`${dir}/snapshots/pr-16.json`,'utf8'));
if(s.pr.headRefOid!=='a9f7597c90b98128a1cebf46a949810e0586c31d')throw Error('Head changed');
const replies={
 'deploy/beta/Caddyfile':'Valid and deferred, not repaired in this PR. Fable decision14 confirms M4 remains PARTIAL and this PR stays blocked on deployed proxy proof. The queued body-deadline candidate 9d7f0c4 adds a 30s whole-body app deadline for capBody routes, but does not certify Caddy connection limits or paths without that helper. The deployment-validation followup must add and execute-check a proxy body deadline coherent with legitimate 5 MiB uploads, tighter public-route matchers, mid-stream 413 behaviour, and routes without capBody. No proxy runtime acceptance was executed, no deployment is authorized, and this thread resolution records deferral rather than a product fix.',
 'src/server/public-body.ts':'Not changed, deliberate rate-first admission; Fable decision14 approved this disposition. Trusted-IP admission is 60 requests/minute before body consumption, and the exhausted-window test asserts request.bodyUsed remains false on 429. Moving the cap first would avoid DB work for oversized streams but exempt those streams from the current admission budget; small valid-length requests can still generate the same short advisory-locked transaction. Counting an oversized sender against its window is intentional. Declared-oversize Content-Length already short-circuits before the DB. The streaming cap still returns 413 for missing or inaccurate lengths. The separate queued deadline addresses slow reads; M4 remains PARTIAL until proxy/deployment proof.'
};
const records=[];
for(const t of s.pr.reviewThreads.nodes.filter(t=>!t.isResolved)){
 const body=replies[t.path];if(!body)throw Error('Unapproved thread');
 const comment=t.comments.nodes.find(c=>c.author?.login==='coderabbitai');
 const input=`${dir}/resource-thread-${comment.databaseId}.json`;writeFileSync(input,JSON.stringify({body}));
 const reply=JSON.parse(execFileSync('gh',['api',`repos/AbdelrhmanAh7/FlowLine_Web/pulls/16/comments/${comment.databaseId}/replies`,'--method','POST','--input',input],{encoding:'utf8'}));
 const mutation=`mutation { resolveReviewThread(input:{threadId:"${t.id}"}) {thread {id isResolved}} }`;
 const resolved=JSON.parse(execFileSync('gh',['api','graphql','-f',`query=${mutation}`],{encoding:'utf8'}));
 records.push({thread:t.id,path:t.path,reply:reply.html_url,resolution:resolved,disposition:'NOT_REPAIRED; Fable decision14'});
}
writeFileSync(`${dir}/RESOURCE_THREAD_DISPOSITIONS.json`,JSON.stringify({at:new Date().toISOString(),head:s.pr.headRefOid,records},null,2)+'\n');
console.log(JSON.stringify(records));
