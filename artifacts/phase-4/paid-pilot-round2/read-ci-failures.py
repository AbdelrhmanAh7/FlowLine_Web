"""Read selected CI logs in memory; publish only bounded failure diagnostics."""
import hashlib, io, json, re, subprocess, sys, zipfile
from pathlib import Path
artifact_id=int(sys.argv[1])
raw=subprocess.check_output(['gh','api',f'repos/AbdelrhmanAh7/FlowLine_Web/actions/artifacts/{artifact_id}/zip'])
archive=zipfile.ZipFile(io.BytesIO(raw))
rows=[]
for name in archive.namelist():
    if '.env' in name or not (name.endswith('.log') or name.endswith('-report.txt')): continue
    if not ('integration/shard-' in name or name.endswith('-report.txt')): continue
    text=archive.read(name).decode('utf-8',errors='replace')
    text=re.sub(r'\x1b\[[0-9;]*m','',text)
    lines=text.splitlines()
    found=[i for i,line in enumerate(lines) if re.search(r'^\s*(?:FAIL\s+|\d+\) \[(?:chromium|firefox|webkit)\])',line)]
    excerpts=[]
    for i in found:
        excerpt='\n'.join(lines[i:min(len(lines),i+5)])
        excerpt=re.sub(r'(?i)(authorization|password|api[_-]?key|client[_-]?secret)\s*[:=]\s*\S+',r'\1=[REDACTED]',excerpt)
        excerpts.append(excerpt)
    if excerpts: rows.append({'path':name,'logSHA256':hashlib.sha256(archive.read(name)).hexdigest(),'excerpts':excerpts})
out=Path(f'artifacts/phase-4/paid-pilot-round2/ci/failure-artifact-{artifact_id}.json')
out.parent.mkdir(parents=True,exist_ok=True)
result={'artifactId':artifact_id,'zipSHA256':hashlib.sha256(raw).hexdigest(),'diagnostics':rows}
out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'artifactId':artifact_id,'file':str(out),'failedReports':[{'path':r['path'],'headlines':[x.splitlines()[0] for x in r['excerpts']]} for r in rows]}))
