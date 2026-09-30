import {readFileSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {Client} from 'pg';
const env=parseEnv(readFileSync('artifacts/beta-execution/.profile/local-staging-20260930/.env','utf8'));
const u=new URL(env.DATABASE_URL);
if(env.FLOWLINE_ENV!=='staging'||u.pathname!=='/flowline_beta_local20260930'||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||env.FLOWLINE_BETA_ADMINS.includes(','))throw new Error('Named local staging owner required');
const c=new Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
try{
 await c.connect();
 const rows=(await c.query('select u.email_verified as verified,u.two_factor_enabled as mfa_enrolled,a.status as admin_status from "user" u left join platform_admin a on a.user_id=u.id where lower(u.email)=lower($1)',[env.FLOWLINE_BETA_ADMINS])).rows;
 if(rows.length!==1)throw new Error('Named owner missing');
 const result={at:new Date().toISOString(),database:'flowline_beta_local20260930',...rows[0],readOnly:true,seedsCodesCredentialsRead:false};
 writeFileSync('artifacts/beta-execution/20260930T122429Z/local-owner-readiness.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch{console.log('Named owner readiness check unavailable; no arbitrary error or credential output.');process.exitCode=1;}
finally{await c.end();}
