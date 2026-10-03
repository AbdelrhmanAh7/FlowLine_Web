import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const gh=(...args)=>JSON.parse(execFileSync('gh',args,{encoding:'utf8'}));
const dir='artifacts/phase-4/paid-pilot-round2';
if(process.argv[2]==='runtime-reply') {
 const p=JSON.parse(readFileSync(`${dir}/snapshots/pr-13.json`)).pr;
 const t=p.reviewThreads.nodes.find(t=>!t.isResolved);
 if(!t) {console.log('No unresolved runtime thread');process.exit(0);}
 if(t.path!=='tests/unit/release-input-policy.test.ts')throw Error('Unexpected finding');
 const body='Not changed, per the recorded Fable disposition. `setup-gate/action.yml` uses unquoted `node-version: 22` with a trailing newline, which the current regex matches; it rejects `22.1`. Exact-head full CI is green at `56f96d9ee31498d2a38d1b4516dadcc49b7ac352`. Quoted-value/EOF formatting support can accompany a future action-format change. No runtime or configuration defect is present in this head.';
 const reply=gh('api','repos/AbdelrhmanAh7/FlowLine_Web/pulls/13/comments', '-f',`body=${body}`,'-F',`in_reply_to=${t.comments.nodes[0].databaseId}`);
 writeFileSync(`${dir}/restart-runtime-reply.json`,JSON.stringify(reply,null,2)+'\n');
 const resolution=gh('api','graphql','-f',`query=mutation { resolveReviewThread(input:{threadId:"${t.id}"}) { thread {id isResolved} } }`);
 if(resolution.errors)throw Error(JSON.stringify(resolution.errors));
 writeFileSync(`${dir}/restart-runtime-resolution.json`,JSON.stringify(resolution,null,2)+'\n');
 console.log(JSON.stringify({reply:reply.html_url,resolution}));
}
if(process.argv[2]==='backups') {
 const refs=execFileSync('git',['for-each-ref','--format=%(refname:short)','refs/heads'],{encoding:'utf8'}).trim().split('\n').filter(x=>/^(paid-pilot-|codex\/(?:pilot-|paid-pilot-))/.test(x));
 const remote=new Map(execFileSync('git',['ls-remote','--heads','origin'],{encoding:'utf8'}).trim().split('\n').map(x=>{const [sha,ref]=x.split(/\s+/);return [ref.replace('refs/heads/',''),sha];}));
 const rows=[];
 for(const ref of refs) {
  const local=execFileSync('git',['rev-parse',ref],{encoding:'utf8'}).trim();
  const upstream=remote.get(ref)??null;
  if(upstream!==local)throw Error('Backup drift needs a fresh exact-diff review before push: '+ref);
  rows.push({ref,local,previousRemote:upstream,pushed:upstream!==local});
 }
 const after=new Map(execFileSync('git',['ls-remote','--heads','origin'],{encoding:'utf8'}).trim().split('\n').map(x=>{const [sha,ref]=x.split(/\s+/);return [ref.replace('refs/heads/',''),sha];}));
 for(const row of rows){row.remote=after.get(row.ref);if(row.remote!==row.local)throw Error('Backup mismatch '+row.ref);}
 writeFileSync(`${dir}/RESTART_BACKUPS.json`,JSON.stringify({at:new Date().toISOString(),rows},null,2)+'\n');
 console.log(JSON.stringify({count:rows.length,pushed:rows.filter(r=>r.pushed)}));
}
