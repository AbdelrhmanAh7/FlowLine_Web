import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='artifacts/phase-4/paid-pilot-round2';
const queue=[
 ['codex/pilot-security-deps-round1','main','build: prune unused Drizzle loader dependency','pilot-security-deps-round1.md'],
 ['codex/pilot-security-redact-round1','main','fix(security): redact secrets and enforce credential trust boundaries','pilot-security-redact-round1.md'],
 ['codex/pilot-security-resource-round1','main','fix(security): bound request bodies and knowledge extraction','pilot-security-resource-round1.md'],
 ['codex/pilot-security-auth-round1','main','fix(auth): enforce mailbox ownership and callback authority fences','pilot-security-auth-round1.md'],
 ['codex/paid-pilot-upload-admission-20261003','codex/pilot-security-resource-round1','fix(knowledge): atomically admit retained upload bytes','paid-pilot-upload-admission-20261003.md'],
 ['codex/paid-pilot-body-deadline-20261003','codex/pilot-security-resource-round1','fix(security): enforce whole-body request deadline','paid-pilot-body-deadline-20261003.md'],
 ['codex/paid-pilot-federated-mfa-20261003','codex/pilot-security-auth-round1','fix(auth): require enrolled MFA for federated sessions','paid-pilot-federated-mfa-20261003.md'],
 ['codex/paid-pilot-monitor-20261003','main','fix(ops): make monitor delivery and recovery failures visible','paid-pilot-monitor-20261003.md'],
 ['codex/paid-pilot-safe-retry-main-20261003','main','fix(engine): prevent duplicate non-idempotent writes after uncertain 5xx','paid-pilot-safe-retry-main-20261003.md'],
 ['paid-pilot-lighthouse','main','ci: collect Lighthouse evidence separately in Arabic and English','paid-pilot-lighthouse.md'],
 ['paid-pilot-p3','main','fix(ui): polish localized landing and provider failure states','paid-pilot-p3.md'],
 ['paid-pilot-copilot','main','test: add bounded copilot benchmark and honest provider evidence','paid-pilot-copilot.md'],
 ['paid-pilot-hubspot','main','feat(integrations): add bounded HubSpot contact reads','paid-pilot-hubspot.md'],
 ['codex/paid-pilot-product-20261003','main','feat(pilot): prepare retry metering and paid-pilot drafts','paid-pilot-product-20261003.md'],
 ['paid-pilot-tool-roster','main','docs(pilot): qualify provider verification and tool usage','paid-pilot-tool-roster.md'],
];
const gh=(...args)=>JSON.parse(execFileSync('gh',args,{encoding:'utf8',maxBuffer:12*1024*1024}));
const now=new Date();
if(now>=new Date('2026-10-03T06:30:00Z'))throw Error('Owner launch cutoff reached');
const ram=Number(execFileSync('powershell',['-NoProfile','-Command','(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB'],{encoding:'utf8'}).trim());
if(ram<6)throw Error('RAM below 6GB: pause 5 minutes before retry');
const log='docs/implementation/coderabbit-requests.log';
const sharedLog='../FlowLine/docs/implementation/coderabbit-requests.log';
const lines=[...new Set([readFileSync(log,'utf8'),readFileSync(sharedLog,'utf8')].flatMap(text=>text.split(/\r?\n/)).filter(Boolean))];
const recent=lines.map(x=>Date.parse(x.split(' ')[0])).filter(x=>Number.isFinite(x)&&now-x<3600000&&now>=x);
if(recent.length>=3)throw Error('Review slots exhausted until '+new Date(Math.min(...recent)+3600001).toISOString());
const prs=gh('pr','list','--state','all','--limit','100','--json','number,headRefName,state');
const next=queue.find(([ref])=>!prs.some(p=>p.headRefName===ref));
if(!next){console.log('Queue exhausted');process.exit(0);}
// Fable decision20: one final opening only, after the conservative completed-review rollover.
if(next[0]!=='codex/paid-pilot-body-deadline-20261003')throw Error('Remaining round2 lanes deferred; only final body-deadline opening is authorized');
if(now<new Date('2026-10-03T06:10:30Z'))throw Error('Fable decision20 provider rollover margin not reached');
for(const pr of prs.filter(p=>p.state==='OPEN'&&p.number>=12)) {
 const q=`query { repository(owner:"AbdelrhmanAh7",name:"FlowLine_Web") { pullRequest(number:${pr.number}) { headRefOid reviewThreads(first:100) { pageInfo {hasNextPage} nodes {isResolved comments(last:1) {nodes {author {login} body}}} } reviews(last:10) {nodes {author {login} submittedAt body commit {oid}}} comments(last:10) {nodes {author {login} body createdAt}} } } }`;
 const p=gh('api','graphql','-f',`query=${q}`).data.repository.pullRequest;
 if(p.reviewThreads.pageInfo.hasNextPage||p.reviewThreads.nodes.some(t=>!t.isResolved))throw Error(`PR${pr.number} unresolved threads`);
 const zero=p.comments.nodes.some(c=>c.author?.login==='coderabbitai'&&/No actionable comments were generated in the recent review/.test(c.body)&&c.body.includes(`"coveredCommitId":"${p.headRefOid}"`)&&c.body.includes('"kind":"reviewed"'));
 const reviewed=p.reviews.nodes.some(r=>r.author?.login==='coderabbitai'&&r.commit?.oid===p.headRefOid);
 const docsWaiver=pr.number===12&&p.headRefOid==='a9276f663a2984531ae4f4a76379f36eeff8ce18';
 if(!zero&&!reviewed&&!docsWaiver)throw Error(`PR${pr.number} exact-head review not finished`);
 const lastBot=p.comments.nodes.filter(c=>c.author?.login==='coderabbitai').at(-1);
 if(lastBot&&/rate limit|review limit reached/i.test(lastBot.body))throw Error('Latest provider reply still rate limited');
}
const [ref,base,title,body]=next;
const head=execFileSync('git',['rev-parse',ref],{encoding:'utf8'}).trim();
const remote=execFileSync('git',['ls-remote','--heads','origin',ref],{encoding:'utf8'}).split(/\s+/)[0];
if(head!==remote)throw Error('Remote head differs');
const paths=execFileSync('git',['diff','--name-only',`${base}...${head}`],{encoding:'utf8'}).trim().split('\n');
if(paths.length>150)throw Error('Over path cap');
const diff=execFileSync('git',['diff','--binary',`${base}...${head}`],{maxBuffer:24*1024*1024});
const hash=createHash('sha256').update(diff).digest('hex');
const audit=JSON.parse(readFileSync(`${dir}/worker-a/BACKUP_AND_CANDIDATE_AUDIT.json`));
const old=audit.candidateInventory.find(x=>x.ref===ref);
if(!old?.exactBinaryPriorApprovalMatch||old.binaryDiffSHA256!==hash) {
 const freshFile=`${dir}/worker-a/${ref.replace(/^codex\//,'')}-FRESH_INDEPENDENT_REVIEW.json`;
 const fresh=JSON.parse(readFileSync(freshFile));
 if(fresh.head!==head||fresh.binaryDiffSHA256!==hash||!fresh.outcome.startsWith('APPROVED'))throw Error('Independent review mismatch');
}
const started=new Date().toISOString();
const url=execFileSync('gh',['pr','create','--head',ref,'--base',base,'--title',title,'--body-file',`${dir}/worker-a/${body}`],{encoding:'utf8'}).trim();
const updatedLog=lines.join('\n')+`\n${started} ${url} initial automatic review; restart conservative slot reserved\n`;
writeFileSync(log,updatedLog);
writeFileSync(sharedLog,updatedLog);
appendFileSync(`${dir}/RESTART_OPENINGS.jsonl`,JSON.stringify({at:started,url,ref,base,head,hash,paths:paths.length,freeGB:ram})+'\n');
console.log(JSON.stringify({url,ref,base,head,paths:paths.length,freeGB:ram}));
