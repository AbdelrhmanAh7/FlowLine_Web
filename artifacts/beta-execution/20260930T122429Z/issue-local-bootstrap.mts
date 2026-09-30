// The token is written only to protected, ignored operator storage; never stdout or arguments.
import { writeFileSync, existsSync } from 'node:fs';
import { userInfo } from 'node:os';
import path from 'node:path';
import { issueChallenge } from '../../../src/server/platform-setup';
import { pool } from '../../../src/db';

const privateDir = path.resolve('artifacts/beta-execution/.profile/local-staging-20260930');
const target = path.join(privateDir, 'setup-code.txt');
try {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.FLOWLINE_ENV !== 'staging' || url.pathname !== '/flowline_beta_local20260930' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Wrong local bootstrap target');
  if (existsSync(target)) throw new Error('Protected setup code file already exists; preserved');
  const email = process.env.FLOWLINE_BETA_ADMINS;
  if (!email || email.includes(',')) throw new Error('Exactly one bound local setup identity required');
  const challenge = await issueChallenge({ email, kind:'bootstrap', operator:userInfo().username });
  writeFileSync(target, `${challenge.token}\n`, {mode:0o600,flag:'wx'});
  writeFileSync('artifacts/beta-execution/20260930T122429Z/local-bootstrap-status.json', JSON.stringify({ at:new Date().toISOString(), database:'flowline_beta_local20260930', challengeId:challenge.id, expiresAt:challenge.expiresAt.toISOString(), tokenPrinted:false, operatorStorage:'restricted ignored local staging directory', roleGranted:false },null,2));
  console.log('One-time local bootstrap code prepared in protected operator storage; no role granted or secret printed.');
} catch(error) {
  console.log(JSON.stringify({phase:'local bootstrap',status:'failed',name:error instanceof Error?error.name:'Error',message:error instanceof Error?error.message:'Failed'}));
  process.exitCode=1;
} finally { await pool.end(); }
