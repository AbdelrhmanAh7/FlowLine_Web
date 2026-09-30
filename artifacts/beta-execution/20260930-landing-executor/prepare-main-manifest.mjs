import {execFileSync} from 'node:child_process';
import {writeFileSync,statSync} from 'node:fs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024}).split('\0').filter(Boolean);
const forbidden=p=>p.split('/').some(n=>/^\.env|^helper-logs$|^\.profile$|^test-results/.test(n))||/KIMI_RESUME\.md|NOTES-draft\.md|closeout\/RESUME\.md|scratch-css\.mjs|gate\/\.current-run|\/STOP$|landing-reduced-ar-|trace\.zip/.test(p);
const tracked=git('diff','HEAD','--name-only','-z').filter(p=>!forbidden(p)&&!p.startsWith('artifacts/phase-3/screenshots/'));
const untracked=git('ls-files','--others','--exclude-standard','-z').filter(p=>!forbidden(p)&&(
 /^(src|e2e|tests|scripts|docs)\//.test(p)||
 /^(artifacts\/design-v2\/(chrome-qa\/final-keyboard|gate\/final-keyboard|closeout\/HANDOFF\.md)|artifacts\/beta-execution\/|artifacts\/company-builder\/)/.test(p)&&/\.(md|json|jsonl|txt|log|mjs|cjs|mts|ts|ps1|sh)$/.test(p)
));
const paths=[...new Set([...tracked,...untracked])].sort();
const report={at:new Date().toISOString(),paths,count:paths.length,bytes:paths.reduce((n,p)=>n+statSync(p).size,0),excludedPolicy:'No secrets/profiles/raw helpers/traces/scratch. Historical phase-3 screenshot overwrites and unreviewed new binary images are preserved locally, not substituted into old release evidence.'};
writeFileSync('artifacts/beta-execution/20260930-landing-executor/main-staging-manifest.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({count:report.count,bytes:report.bytes,forbidden:paths.filter(forbidden)}));
