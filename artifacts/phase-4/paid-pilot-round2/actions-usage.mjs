import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
const dir='artifacts/phase-4/paid-pilot-round2/snapshots';
const runs=new Map();
for (const file of readdirSync(dir).filter(f=>/^pr-\d+\.json$/.test(f))) {
  for (const run of JSON.parse(readFileSync(`${dir}/${file}`,'utf8')).runs) runs.set(run.id,run);
}
const rows=[...runs.values()].map(run=>{
  const completed=run.jobs.filter(j=>j.startedAt&&j.completedAt&&j.conclusion!=='skipped'&&!(run.id===37102200387&&j.name==='gate'));
  const invalidDurationJobs=completed.filter(j=>Date.parse(j.completedAt)<Date.parse(j.startedAt)).map(j=>({name:j.name,startedAt:j.startedAt,completedAt:j.completedAt}));
  const jobs=completed.filter(j=>Date.parse(j.completedAt)>=Date.parse(j.startedAt)).map(j=>({...j,elapsedSeconds:(Date.parse(j.completedAt)-Date.parse(j.startedAt))/1000}));
  return {id:run.id,url:run.url,head:run.headSha,status:run.status,conclusion:run.conclusion,completedJobs:jobs.length,totalJobs:run.jobs.length,skippedJobs:run.jobs.filter(j=>j.conclusion==='skipped').length,invalidDurationJobs,observedRunnerMinutes:jobs.reduce((n,j)=>n+j.elapsedSeconds/60,0),roundedPerJobMinutes:jobs.reduce((n,j)=>n+Math.ceil(j.elapsedSeconds/60),0),apiBillableMs:run.timing?.billable?.UBUNTU?.total_ms??null,jobs};
});
const result={at:new Date().toISOString(),method:'Observed completed non-skipped job startedAt/completedAt durations, summed across runners. Skipped jobs and verified non-started gate111144511327 on run37102200387 excluded; invalid negative durations excluded and recorded. Per-job rounded minutes are an estimate, not a billing meter. Timing API returns zero billable milliseconds; included balance and billed consumption remain unverified. Superseded/cancelled runs included.',runs:rows,observedRunnerMinutes:rows.reduce((n,r)=>n+r.observedRunnerMinutes,0),roundedPerJobMinutes:rows.reduce((n,r)=>n+r.roundedPerJobMinutes,0),apiBillableMs:rows.every(r=>r.apiBillableMs!==null)?rows.reduce((n,r)=>n+r.apiBillableMs,0):null};
writeFileSync('artifacts/phase-4/paid-pilot-round2/ACTIONS_USAGE.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({at:result.at,runs:rows.map(({jobs,...r})=>r),totalObservedRunnerMinutes:result.observedRunnerMinutes,roundedEstimate:result.roundedPerJobMinutes,apiBillableMs:result.apiBillableMs}));
