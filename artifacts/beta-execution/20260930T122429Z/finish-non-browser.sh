#!/usr/bin/env bash
set -uo pipefail
out=artifacts/beta-execution/20260930T122429Z
raw=artifacts/beta-execution/helper-logs/20260930T122429Z
for task in test:integration check:evidence; do
  name=${task//:/-}-restart
  echo "START $task"
  pnpm -s "$task" > "$raw/$name.log" 2>&1
  rc=$?
  echo "$task exit=$rc" >> "$out/remaining-gate-status.txt"
  echo "END $task exit=$rc"
  if [ "$rc" -ne 0 ]; then exit "$rc"; fi
done
