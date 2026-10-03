import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const dir='artifacts/phase-4/paid-pilot-round2', head='448c68b74ee0be43868903ed8de49c29ad56b2a3';
if(existsSync(`${dir}/AUTH_THREAD_DISPOSITIONS.json`))throw Error('Replies already recorded');
const s=JSON.parse(readFileSync(`${dir}/snapshots/pr-17.json`,'utf8'));
if(s.pr.headRefOid!==head||!s.runs.some(r=>r.headSha===head&&r.conclusion==='success'))throw Error('Exact-head full CI required');
const reviewed=s.pr.reviews.nodes.some(r=>r.author?.login==='coderabbitai'&&r.commit?.oid===head)||s.pr.comments.nodes.some(c=>c.author?.login==='coderabbitai'&&c.body.includes(`"coveredCommitId":"${head}"`)&&c.body.includes('"kind":"reviewed"')&&/No actionable comments were generated in the recent review/.test(c.body));
if(!reviewed)throw Error('Exact-head CodeRabbit review required');
const replies={
 4171792701:'Fixed in 3743e34 (latest448c68b). Session lookup rejection now reaches the existing outer failure handler before completeSso consumes state. Added an integration regression proving the pending state survives a synthetic lookup failure.',
 4171792710:'Fixed in 3743e34 (latest448c68b). The English value contains a real U+2014 em dash, matching the existing E2E button name and Arabic translation; the expected label/assertion was retained.',
 4171792715:'Fixed in 3743e34 (latest448c68b). After currentSnapshot, the callback compares issuer, issuer revision and client ID with the fenced app before authFor. Added deterministic first-read/second-read mutation coverage for all three fields.',
 4171792719:'Fixed in 3743e34 (latest448c68b). Token preparation runs outside the locked transaction; the short transaction attaches its ID; delivery runs after commit. Attachment failure cleans up through global db after rollback, and delivery failure removes the prepared token. Ordinary issueAccountToken behaviour is preserved. Integration regressions cover eight blocked deliveries while the pool and proposal rows remain available, plus both cleanup failures and fail-closed mailbox proof.',
 4171792725:'Fixed in 3743e34 (latest448c68b). The assertion now awaits findUserById and checks the resolved victim account rather than a truthy Promise; existing assertions remain intact.'
};
const records=[];
for(const [id,explanation] of Object.entries(replies)){
 const t=s.pr.reviewThreads.nodes.find(t=>t.comments.nodes.some(c=>String(c.databaseId)===id));
 if(!t)throw Error('Original review thread missing');
 const body=explanation+' Fresh full Gate37100289007 passed on448c68b; latest-head CodeRabbit review completed. Independent exact-diff Fable approvals preceded pushes. No local tests/stacks/browsers/builds or live-provider calls; no merge.';
 const input=`${dir}/auth-thread-${id}.json`;writeFileSync(input,JSON.stringify({body}));
 const reply=JSON.parse(execFileSync('gh',['api',`repos/AbdelrhmanAh7/FlowLine_Web/pulls/17/comments/${id}/replies`,'--method','POST','--input',input],{encoding:'utf8'}));
 let resolution='Already auto-resolved before lead reply';
 if(!t.isResolved){const q=`mutation {resolveReviewThread(input:{threadId:"${t.id}"}){thread{id isResolved}}}`;resolution=JSON.parse(execFileSync('gh',['api','graphql','-f',`query=${q}`],{encoding:'utf8'}));}
 records.push({id,thread:t.id,path:t.path,reply:reply.html_url,resolution});
}
writeFileSync(`${dir}/AUTH_THREAD_DISPOSITIONS.json`,JSON.stringify({at:new Date().toISOString(),head,records},null,2)+'\n');
console.log(JSON.stringify(records));
