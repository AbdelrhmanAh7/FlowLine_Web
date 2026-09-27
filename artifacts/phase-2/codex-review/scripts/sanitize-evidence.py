"""Remove ephemeral test credentials from browser evidence before handoff."""
from __future__ import annotations

import json
import re
import tempfile
import urllib.parse
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence"
SESSION = EVIDENCE / "session.json"

known: set[str] = set()
if SESSION.exists():
    state = json.loads(SESSION.read_text(encoding="utf-8"))
    for cookie in state.get("cookies", []):
        value = cookie.get("value", "")
        if value:
            known.update({value, urllib.parse.unquote(value)})
            known.add(value.split(".")[0])


def scrub(s: str) -> str:
    for value in sorted(known, key=len, reverse=True):
        if value:
            s = s.replace(value, "[redacted]")
    s = re.sub(r"whsec_[A-Za-z0-9]+", "[redacted-secret]", s)
    s = re.sub(r"/api/hooks/[A-Za-z0-9_-]+", "/api/hooks/[redacted-token]", s)
    s = re.sub(r"params:\s*[A-Za-z0-9+/%=._-]{20,}", "params: [redacted]", s)
    s = re.sub(r'(?i)("(?:cookie|set-cookie|authorization)"\s*:\s*")[^"]*', r'\1[redacted]', s)
    s = re.sub(r'(?i)(better-auth\.session_token(?:=|%3D))[^;\s"\\]+', r'\1[redacted]', s)
    s = re.sub(r"(?i)([?&](?:code|state|token|secret)=)[^&\s\"']+", r"\1[redacted]", s)
    return s


for path in EVIDENCE.glob("*.json"):
    if path.name == "session.json":
        continue
    raw = path.read_text(encoding="utf-8")
    cleaned = scrub(raw)
    if cleaned != raw:
        path.write_text(cleaned, encoding="utf-8")

for path in (ROOT / "traces").glob("*.zip"):
    with tempfile.NamedTemporaryFile(prefix="flowline-trace-", suffix=".zip", dir=path.parent, delete=False) as tmp:
        tmp_path = Path(tmp.name)
    with zipfile.ZipFile(path) as source, zipfile.ZipFile(tmp_path, "w") as target:
        for item in source.infolist():
            data = source.read(item.filename)
            if item.filename.endswith((".trace", ".network", ".json", ".txt")):
                try:
                    data = scrub(data.decode("utf-8")).encode("utf-8")
                except UnicodeDecodeError:
                    pass
            target.writestr(item, data)
    tmp_path.replace(path)

print("Sanitized JSON evidence and Playwright traces. Remove session.json before handoff.")
