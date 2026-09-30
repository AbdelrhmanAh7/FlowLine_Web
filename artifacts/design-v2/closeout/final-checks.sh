#!/usr/bin/env bash
set -uo pipefail
out=artifacts/design-v2/gate/final-cp10/non-browser
mkdir -p "$out"
pnpm stop:test > "$out/stop.txt" 2>&1 || exit $?
if netstat -ano | grep -qE ':(3100|4010|4011) .*LISTENING'; then
  echo 'REFUSING: a test-stack port remains bound' > "$out/status.txt"
  exit 3
fi
echo "stack stopped before suites: $(date -Iseconds)" > "$out/status.txt"
for suite in lint typecheck test test:contract test:integration check:evidence; do
  file="${suite//:/-}"
  echo "start $suite: $(date -Iseconds)" >> "$out/status.txt"
  pnpm -s "$suite" > "$out/$file.txt" 2>&1
  rc=$?
  echo "$suite exit=$rc: $(date -Iseconds)" | tee -a "$out/status.txt"
  if [ "$rc" -ne 0 ]; then exit "$rc"; fi
done
