import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const number = Number(process.argv[2]);
if (!Number.isInteger(number) || number < 12) throw new Error('Only round-2 PRs');
const gh = (...args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 }));
const query = `query { repository(owner:"AbdelrhmanAh7",name:"FlowLine_Web") { pullRequest(number:${number}) { number url state headRefOid headRefName baseRefName isDraft reviews(last:30) { nodes { id author { login } state submittedAt commit { oid } body } } reviewThreads(first:100) { pageInfo { hasNextPage endCursor } nodes { id isResolved isOutdated path comments(last:30) { pageInfo { hasPreviousPage } nodes { id databaseId author { login } createdAt body url } } } } comments(last:30) { nodes { id author { login } createdAt body url } } } } }`;
const pr = gh('api', 'graphql', '-f', `query=${query}`).data.repository.pullRequest;
if (pr.reviewThreads.pageInfo.hasNextPage || pr.reviewThreads.nodes.some(t => t.comments.pageInfo.hasPreviousPage)) throw new Error('Pagination required before audit');
const runs = gh('api', 'repos/AbdelrhmanAh7/FlowLine_Web/actions/runs?per_page=100').workflow_runs.filter(r => r.head_branch === pr.headRefName && r.created_at >= '2026-10-03T02:28:30Z');
const details = runs.map(r => {
  const jobs = gh('api', `repos/AbdelrhmanAh7/FlowLine_Web/actions/runs/${r.id}/jobs?per_page=100`).jobs;
  const result = {id:r.id, url:r.html_url, name:r.name, status:r.status, conclusion:r.conclusion, headSha:r.head_sha, isCurrentHead:r.head_sha === pr.headRefOid, createdAt:r.created_at, jobs: jobs.map(j => ({id:j.id,name:j.name,status:j.status,conclusion:j.conclusion,startedAt:j.started_at,completedAt:j.completed_at,url:j.html_url}))};
  if (r.status === 'completed') {
    try { result.timing = gh('api', `repos/AbdelrhmanAh7/FlowLine_Web/actions/runs/${r.id}/timing`); } catch { result.timingUnavailable = true; }
  }
  return result;
});
const result = {at:new Date().toISOString(), pr, runs:details};
mkdirSync('artifacts/phase-4/paid-pilot-round2/snapshots', {recursive:true});
writeFileSync(`artifacts/phase-4/paid-pilot-round2/snapshots/pr-${number}.json`, JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({at:result.at, number, head:pr.headRefOid, reviews:pr.reviews.nodes.map(x=>({author:x.author?.login,state:x.state,at:x.submittedAt,body:x.body.slice(0,220)})),threads:pr.reviewThreads.nodes.map(t=>({id:t.id,resolved:t.isResolved,path:t.path,last:t.comments.nodes.at(-1)?.body.slice(0,500)})),comments:pr.comments.nodes.map(c=>({author:c.author?.login,at:c.createdAt,body:c.body.slice(0,600)})),runs:details}));
