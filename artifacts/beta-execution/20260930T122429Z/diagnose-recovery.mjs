import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { Client } from 'pg';
const env=parseEnv(readFileSync('.env.test','utf8'));
const url=new URL(env.DATABASE_URL);
if(env.FLOWLINE_ENV!=='test'||url.pathname!=='/flowline_test_dv2'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Named synthetic test DB required');
const c=new Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
try {
  await c.connect();
  const target=(await c.query("select r.id,r.status,w.name,w.created_at from run r join workspace w on w.id=r.workspace_id where w.name like 'Recover-%' order by w.created_at desc,r.created_at desc limit 1")).rows[0];
  if(!target)throw new Error('Synthetic recovery fixture unavailable');
  const attempts=(await c.query('select attempt,outcome,possible_charge,error_code,created_at from ai_attempt where run_id=$1 order by id',[target.id])).rows;
  const ledger=(await c.query("select regexp_replace(idempotency_key,'^.*:','') as attempt,status,cost_micros from usage_event where run_id=$1 and kind='ai' order by id",[target.id])).rows;
  const steps=(await c.query('select node_id,status,meta from run_step where run_id=$1 order by node_id',[target.id])).rows.map(s=>({node:s.node_id,status:s.status,recoveredAttempts:s.meta?.recoveredAttempts??null}));
  const requeue=(await c.query("select at from run_event where run_id=$1 and type='requeued' order by id desc limit 1",[target.id])).rows[0];
  const contemporaries=requeue?(await c.query("select e.run_id,r.created_at as fixture_created_at,r.status,w.name,e.type,e.at from run_event e join run r on r.id=e.run_id join workspace w on w.id=e.workspace_id where e.type='requeued' and e.at between $1::timestamptz-interval '1 second' and $1::timestamptz+interval '1 second' order by e.id",[requeue.at])).rows:[];
  const calls=requeue?(await c.query("select a.run_id,a.attempt,a.outcome,a.created_at,w.name from ai_attempt a join workspace w on w.id=a.workspace_id where a.created_at between $1::timestamptz and $1::timestamptz+interval '2 seconds' order by a.id",[requeue.at])).rows:[];
  const record={at:new Date().toISOString(),database:'flowline_test_dv2',target,attempts,ledger,steps,contemporaries,calls,readOnly:true,operatorDbAuthUsedInMemory:true,customerCredentialsRead:false,secretsPrintedOrPersisted:false};
  writeFileSync('artifacts/beta-execution/20260930T122429Z/recovery-failure-diagnosis.json',JSON.stringify(record,null,2));
  console.log(JSON.stringify(record,null,2));
}catch{console.error('Synthetic recovery diagnosis unavailable; no raw exception or secrets emitted.');process.exitCode=1;}
finally{await c.end();}
