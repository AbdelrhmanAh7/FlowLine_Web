#!/usr/bin/env bash
set -euo pipefail
out=artifacts/design-v2/gate/final-keyboard/final-non-browser
mkdir -p "$out"
pnpm stop:test > "$out/stop.txt" 2>&1
for task in lint typecheck test test:contract test:integration check:evidence; do
  name=${task//:/-}
  rc=0
  pnpm -s "$task" > "artifacts/design-v2/helper-logs/keyboard-final-$name.log" 2>&1 || rc=$?
  cp "artifacts/design-v2/helper-logs/keyboard-final-$name.log" "$out/$name.txt"
  echo "$task exit=$rc" >> "$out/status.txt"
  if [ "$rc" -ne 0 ]; then exit "$rc"; fi
done
