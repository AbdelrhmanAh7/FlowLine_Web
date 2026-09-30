// Local-only candidate runtime. No provider credential is imported or seeded.
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, mkdtempSync } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';
import net from 'node:net';
import readline from 'node:readline';
import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const root = process.cwd();
const out = path.resolve('artifacts/beta-execution/20260930-landing-executor');
const privateDir = path.resolve('artifacts/beta-execution/.profile/local-staging-20260930');
const envFile = path.join(privateDir, '.env');
const dist = 'artifacts/beta-execution/.profile/local-staging-20260930/build-cp28';
const database = 'flowline_beta_local20260930';
const base = 'http://localhost:3000';
const cp = JSON.parse(readFileSync(path.join(out, 'checkpoint-28.json'), 'utf8'));
const children = new Set();
const report = { startedAt: new Date().toISOString(), supervisorPid: process.pid, base, database, checkpoint: cp.commit, environment: 'staging', workerConcurrency: 1, externalCredentialsImported: false, billing: 'sandbox only, unconfigured', spendCap: 0, phases: [], processes: [], stopCommand: 'write_stdin this supervised session with stop plus newline; only its recorded child trees are stopped' };
let stopped = false;
let env;
let sensitive = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const save = () => writeFileSync(path.join(out, 'cp28-local-staging-status.json'), JSON.stringify(report, null, 2));
const emit = (phase, state, extra = {}) => { report.phases.push({ at: new Date().toISOString(), phase, state, ...extra }); save(); console.log(JSON.stringify({ phase, state, ...extra })); };
const clean = text => {
  for (const value of sensitive) text = text.split(value).join('[redacted]');
  return text.replace(/([?&](?:code|state|token|key|secret|otp)=)[^&\s]+/gi, '$1[redacted]');
};
function pipe(stream, label) {
  let buffer = '';
  stream.on('data', bytes => {
    buffer += bytes.toString('utf8');
    const lines = buffer.split(/\r?\n/); buffer = lines.pop();
    for (const line of lines) appendFileSync(path.join(out, 'cp28-local-staging-sanitized.log'), `[${label}] ${clean(line)}\n`);
  });
  stream.on('end', () => { if (buffer) appendFileSync(path.join(out, 'cp28-local-staging-sanitized.log'), `[${label}] ${clean(buffer)}\n`); });
}
function ownedChild(label, executable, args, extraEnv = {}) {
  const child = spawn(executable, args, { cwd: root, env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  children.add(child);
  report.processes.push({ label, pid: child.pid, startedAt: new Date().toISOString() }); save();
  pipe(child.stdout, label); pipe(child.stderr, label);
  child.on('exit', (code, signal) => {
    children.delete(child);
    const row = report.processes.find(p => p.pid === child.pid); Object.assign(row, { exitCode: code, signal, endedAt: new Date().toISOString() }); save();
  });
  return child;
}
function stop(code = 0) {
  if (stopped) return;
  stopped = true;
  for (const child of children) if (child.pid && child.exitCode === null) {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
  }
  report.stoppedAt = new Date().toISOString(); report.stopExitCode = code; save();
  setTimeout(() => process.exit(code), 1200);
}
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => { if (line.trim() === 'stop') stop(); });
function memory() {
  const command = '$m = Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{freePhysicalKiB=$m.FreePhysicalMemory;freeVirtualKiB=$m.FreeVirtualMemory}|ConvertTo-Json -Compress';
  const sample = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true }));
  appendFileSync(path.join(out, 'cp28-local-staging-memory.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...sample }) + '\n');
  if (sample.freePhysicalKiB < 3 * 1024 * 1024 || sample.freeVirtualKiB < 4 * 1024 * 1024) { emit('memory', 'STOP_UNSAFE_PRESSURE'); stop(2); }
  return sample;
}
function restoreTsconfig(before) {
  const current = readFileSync('tsconfig.json');
  if (sha(current) === sha(before)) return;
  const initial = JSON.parse(before); const after = JSON.parse(current);
  const initialIncludes = initial.include; const afterIncludes = after.include;
  delete initial.include; delete after.include;
  if (JSON.stringify(initial) !== JSON.stringify(after) || initialIncludes.some(s => !afterIncludes.includes(s)) || afterIncludes.some(s => !initialIncludes.includes(s) && !s.startsWith(`${dist}/`))) {
    throw new Error('Unexpected tsconfig change; preserved for review');
  }
  writeFileSync('tsconfig.json', before);
  report.tsconfigRestoredToPreimage = true; save();
}

try {
  await new Promise((resolve, reject) => {
    const test = net.createServer();
    test.once('error', () => reject(new Error('Local port 3000 is occupied; do not stop its owner')));
    test.listen(3000, '127.0.0.1', () => test.close(resolve));
  });
  mkdirSync(privateDir, { recursive: true });
  // Restrict this newly owned operator-storage directory, not host security policy.
  const sid = execFileSync('powershell.exe', ['-NoProfile', '-Command', '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { encoding: 'utf8', windowsHide: true }).trim();
  if (!/^S-1-5-\d+(?:-\d+)+$/.test(sid)) throw new Error('Could not identify current operator SID');
  execFileSync('icacls.exe', [privateDir, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { stdio: 'ignore', windowsHide: true });
  const index = path.join(mkdtempSync(path.join(privateDir, 'candidate-index-')), 'index');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, GIT_INDEX_FILE: index }, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  if (git('branch', '--show-current') !== 'design-v2') throw new Error('Wrong branch');
  git('read-tree', 'HEAD'); git('add', '--', ...Object.keys(cp.inputs));
  const tree = git('write-tree');
  const inputs = Object.fromEntries(Object.keys(cp.inputs).map(key => [key, git('rev-parse', `${tree}:${key}`)]));
  const drift = Object.keys(inputs).filter(key => inputs[key] !== cp.inputs[key]);
  report.inputs = inputs; report.head = git('rev-parse', 'HEAD'); report.executionTree = tree;
  if (drift.length) { report.drift = drift; throw new Error('Candidate changed; freeze and review before build'); }
  emit('candidate', 'CP28_INPUTS_MATCH');
  const source = parseEnv(readFileSync('.env.test', 'utf8'));
  const sourceUrl = new URL(source.DATABASE_URL);
  if (source.FLOWLINE_ENV !== 'test' || !sourceUrl.pathname.startsWith('/flowline_test') || !['localhost', '127.0.0.1', '[::1]'].includes(sourceUrl.hostname)) throw new Error('Disposable local operator connection required');
  const adminUrl = new URL(sourceUrl); adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
  await admin.connect();
  const exists = (await admin.query('select datname from pg_database where datname=$1', [database])).rowCount;
  if (existsSync(envFile)) {
    env = parseEnv(readFileSync(envFile, 'utf8'));
    if (!exists || new URL(env.DATABASE_URL).pathname !== `/${database}` || env.FLOWLINE_ENV !== 'staging' || env.FLOWLINE_PUBLIC_URL !== base) throw new Error('Existing local runtime state does not match; preserved');
    env.NEXT_DIST_DIR = dist;
    env.FLOWLINE_RELEASE_SHA = cp.commit;
    writeFileSync(envFile, Object.entries(env).map(([key,value]) => `${key}=${value}\n`).join(''), { mode: 0o600 });
    emit('operator-storage', 'REUSED_OWN_DEDICATED_CONFIG');
  } else { throw new Error('Existing protected staging configuration required; no new database or keys created'); }
  await admin.end();
  env = { ...process.env, ...env };
  for (const key of ['FLOWLINE_AI_PROVIDER','FLOWLINE_AI_MODEL','OLLAMA_BASE_URL','OLLAMA_MODEL','ANTHROPIC_API_KEY','ANTHROPIC_MODEL','OPENAI_API_KEY']) delete env[key];
  for (const file of ['.env','.env.test','.env.local',envFile]) if (existsSync(file)) {
    const values = parseEnv(readFileSync(file,'utf8'));
    for (const [key,value] of Object.entries(values)) if (/SECRET|KEY|TOKEN|PASSWORD|DATABASE_URL/.test(key) && value.length >= 8) {
      sensitive.push(value);
      if (key === 'DATABASE_URL') { try { sensitive.push(decodeURIComponent(new URL(value).password)); } catch {} }
    }
  }
  sensitive = [...new Set(sensitive.filter(value=>value.length >= 8))].sort((a,b)=>b.length-a.length);
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  await migrate(drizzle(pool), { migrationsFolder: path.join(root,'drizzle') });
  report.schemaVersion = (await pool.query('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n;
  report.initialUserCount = (await pool.query('select count(*)::int as n from "user"')).rows[0].n;
  report.initialWorkspaceCount = (await pool.query('select count(*)::int as n from workspace')).rows[0].n;
  await pool.end();
  emit('database', 'MIGRATED_NEW_LOCAL_STAGING', { schemaVersion: report.schemaVersion, users: report.initialUserCount, workspaces: report.initialWorkspaceCount });
  memory();
  const monitor = setInterval(memory,15000);
  const tsBefore = readFileSync('tsconfig.json'); report.tsconfigSha = sha(tsBefore); save();
  emit('build', 'STARTED_NO_BROWSER_EXPLORATION');
  const build = ownedChild('build', process.execPath, ['node_modules/next/dist/bin/next','build'], { NODE_ENV:'production' });
  const code = await new Promise((resolve,reject)=>{build.once('exit',resolve);build.once('error',reject);});
  restoreTsconfig(tsBefore);
  if (code !== 0) throw new Error('Candidate build failed; sanitized log retained');
  report.buildId = readFileSync(path.join(root,dist,'BUILD_ID'),'utf8').trim();
  emit('build', 'PASS', { buildId: report.buildId });
  const web = ownedChild('web',process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3000'],{NODE_ENV:'production'});
  const worker = ownedChild('worker',process.execPath,['node_modules/tsx/dist/cli.mjs','worker/index.ts'],{NODE_ENV:'production'});
  for (const child of [web,worker]) child.once('exit',()=>{if(!stopped){emit('runtime','CHILD_EXITED');stop(1);}});
  let healthy = false;
  for (let attempt=0;attempt<40 && !stopped;attempt++) {
    try {
      const response = await fetch(`${base}/api/health?require=worker`,{signal:AbortSignal.timeout(4000)});
      const health = await response.json();
      if (response.ok && health.revision === cp.commit && health.schemaVersion === report.schemaVersion && health.db === 'ok' && health.worker === 'ok') {report.health=health;healthy=true;break;}
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if (!healthy) throw new Error('Runtime did not pass bounded readiness');
  emit('runtime','READY', {base,checkpoint:cp.commit,worker:'ok',schemaVersion:report.schemaVersion});
  console.log('Supervised local web and worker running. Stop with stop plus newline. No provider credentials configured; email is local outbox, not delivery certification.');
  await new Promise(()=>{});
  clearInterval(monitor);
} catch(error) {
  report.failure = {name:error?.name??'Error',code:error?.code??null,message:clean(error?.message??'Local setup failed')};save();
  console.log(JSON.stringify({phase:'runtime',state:'FAILED',...report.failure}));stop(1);
}
