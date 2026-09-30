"""Send one interactive Playwright command; keep control files outside Git."""
import json
import pathlib
import sys
import time

session, number = sys.argv[1:3]
assert session in ('A', 'A-retest', 'B', 'B-resume', 'B-finish') and number.isdigit()
directory = pathlib.Path(__file__).parent / '.profile' / f'control-{session}'
directory.mkdir(parents=True, exist_ok=True)
command = directory / f'{number}.json'
assert not command.exists(), 'Command already submitted'
command.write_text(json.dumps({'code': sys.stdin.read()}), encoding='utf-8')
result = directory / f'{number}-result.json'
deadline = time.monotonic() + 20
while not result.exists() and time.monotonic() < deadline:
    time.sleep(0.25)
print(result.read_text(encoding='utf-8') if result.exists() else 'Command pending')
