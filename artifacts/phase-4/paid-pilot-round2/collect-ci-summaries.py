"""Read CI summary JSON only; do not extract request logs, traces, or environments."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import zipfile

run_id = int(sys.argv[1])
repo = 'repos/AbdelrhmanAh7/FlowLine_Web'
def gh(*args):
    return subprocess.check_output(['gh', 'api', *args])
artifacts = json.loads(gh(f'{repo}/actions/runs/{run_id}/artifacts'))['artifacts']
out = Path('artifacts/phase-4/paid-pilot-round2/ci') / str(run_id)
out.mkdir(parents=True, exist_ok=True)
index = []
for artifact in artifacts:
    if not artifact['name'].startswith('flowline-gate-') or artifact['expired']:
        continue
    raw = gh(f"{repo}/actions/artifacts/{artifact['id']}/zip")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for name in archive.namelist():
            if name.endswith('/summary.json') or name == 'summary.json':
                content = archive.read(name)
                summary = json.loads(content)
                target = out / f"{artifact['name']}-summary.json"
                target.write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
                index.append({'artifactId':artifact['id'], 'artifactName':artifact['name'], 'originalPath':name, 'sha256':hashlib.sha256(content).hexdigest(), 'testedSha':summary.get('sha'), 'ok':summary.get('ok'), 'steps':summary.get('steps'), 'file':target.name})
(out / 'index.json').write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')
print(json.dumps(index))
