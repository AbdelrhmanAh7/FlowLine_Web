import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const gh=(...args)=>JSON.parse(execFileSync('gh',['api',...args],{encoding:'utf8'}));
const job=gh('repos/AbdelrhmanAh7/FlowLine_Web/actions/jobs/111144511327');
const check=gh(job.check_run_url);
const annotations=gh(check.url+'/annotations');
const result={at:new Date().toISOString(),run:37102200387,job:{id:job.id,conclusion:job.conclusion,startedAt:job.started_at,completedAt:job.completed_at,steps:job.steps,runnerId:job.runner_id},check:{id:check.id,status:check.status,conclusion:check.conclusion,title:check.output?.title,summary:check.output?.summary,text:check.output?.text},annotations:annotations.map(a=>({title:a.title,message:a.message,level:a.annotation_level}))};
writeFileSync('artifacts/phase-4/paid-pilot-round2/BODY_FINAL_GATE_DIAGNOSTIC.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
