import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { Client } from 'pg';
import { extractEmailToken } from '../../../scripts/release/lib/email-token.mjs';
const env = parseEnv(readFileSync('artifacts/beta-execution/.profile/local-staging-20260930/.env','utf8'));
const url = new URL(env.DATABASE_URL);
const base = 'http://localhost:3000';
if (env.FLOWLINE_ENV !== 'staging' || env.FLOWLINE_EMAIL_PROVIDER !== 'outbox' || url.pathname !== '/flowline_beta_local20260930' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || env.FLOWLINE_PUBLIC_URL !== base || !env.FLOWLINE_BETA_ADMINS || env.FLOWLINE_BETA_ADMINS.includes(',')) throw new Error('Named local staging target required');
const client = new Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
try {
  await client.connect();
  const email = env.FLOWLINE_BETA_ADMINS;
  const before = (await client.query('select email_verified from "user" where lower(email)=lower($1)',[email])).rows;
  if (before.length !== 1) throw new Error('Named owner signup not found');
  let endpointStatus = null;
  let httpStatus = null;
  if (!before[0].email_verified) {
    const rows = (await client.query("select plain_text, html from email_outbox where lower(recipient)=lower($1) and tags->>'purpose'='verify' order by created_at desc limit 1",[email])).rows;
    const token = rows[0] && (extractEmailToken(rows[0].plain_text) ?? extractEmailToken(rows[0].html));
    if (!token) throw new Error('Named verification message unavailable');
    const response = await fetch(base+'/api/email',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({action:'verify',token}),signal:AbortSignal.timeout(8000)});
    const body = await response.json();
    httpStatus = response.status;
    endpointStatus = body.status === 'done' ? 'done' : 'not_done';
    if (!response.ok || endpointStatus !== 'done') throw new Error('Actual verification endpoint did not complete');
  }
  const after = (await client.query('select email_verified from "user" where lower(email)=lower($1)',[email])).rows;
  const verified = after.length === 1 && after[0].email_verified === true;
  if (!verified) throw new Error('Verification not persisted');
  const record = {at:new Date().toISOString(),database:'flowline_beta_local20260930',via:'staging DB outbox -> real POST /api/email',httpStatus,endpointStatus,verified,alreadyVerified:before[0].email_verified===true,externalEmailSent:false,tokenPrintedOrPersisted:false,adminRoleGranted:false};
  writeFileSync('artifacts/beta-execution/20260930T122429Z/local-owner-verification.json',JSON.stringify(record,null,2));
  console.log(JSON.stringify(record));
} catch {
  console.error('Named local owner verification did not complete; no secret or arbitrary error output emitted.');
  process.exitCode=1;
} finally { await client.end(); }
