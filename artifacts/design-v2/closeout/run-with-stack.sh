#!/usr/bin/env bash
# Supervised test-stack lifetime for ONE bounded job (owner rule 6, 2026-09-30).
# The production-build test stack runs as a CHILD of this script, inside a single tool-supervised command, and is
# always stopped at the end (trap), so no unmanaged server is left behind. Not a way around tool time limits: keep
# each job well under 30 minutes; longer work is split into several invocations.
#
#   bash artifacts/design-v2/closeout/run-with-stack.sh <evidence-dir> <command...>
#
# Records in <evidence-dir>/stack-session.txt: PID and owner, working directory, ports, BUILD_ID, the sanitised log path,
# the readiness result and the exact stop command.
set -uo pipefail
cd "$(dirname "$0")/../../.."          # FL-wt-design root
OUT="$1"; shift
mkdir -p "$OUT"
LOG="$OUT/stack.log"
SESSION="$OUT/stack-session.txt"
STOP_CMD="pnpm stop:test   # (node scripts/stop-test-stack.mjs; kills the :3100 test stack tree)"

stop_stack() {
  pnpm stop:test >>"$LOG" 2>&1 || true
  sleep 2
  if netstat -ano | grep -qE ":(3100|4010|4011) .*LISTENING"; then echo "stopped: WARNING ports still bound" >>"$SESSION"; else echo "stopped: ports 3100/4010/4011 free at $(date +%H:%M:%S)" >>"$SESSION"; fi
}
trap stop_stack EXIT

if netstat -ano | grep -qE ":(3100|4010|4011) .*LISTENING"; then echo "REFUSING: a test port is already bound" | tee -a "$SESSION"; trap - EXIT; exit 3; fi

FLOWLINE_TEST_NEXT=start pnpm dev:test >"$LOG" 2>&1 &
PID=$!
{
  echo "started: $(date -Iseconds)"
  echo "pid: $PID (child of this supervised command; owner: $(whoami))"
  echo "cwd: $(pwd -W 2>/dev/null || pwd)"
  echo "ports: 3100 (next start), 4010 (SaaS/OAuth fakes), 4011 (AI fake) on localhost"
  echo "log: $LOG (stack stdout/stderr; no secrets are printed by the stack)"
  echo "stop: $STOP_CMD"
} >"$SESSION"

READY=""
for i in $(seq 1 60); do
  if curl -s -m 5 "http://localhost:3100/api/health?require=worker" | grep -q '"worker":"ok"'; then READY="yes"; break; fi
  if ! kill -0 "$PID" 2>/dev/null; then break; fi
  sleep 5
done
echo "build_id: $(cat .next-test/BUILD_ID 2>/dev/null || echo MISSING)" >>"$SESSION"
if [ -z "$READY" ]; then echo "readiness: FAILED" >>"$SESSION"; tail -20 "$LOG"; exit 4; fi
echo "readiness: ok ($(curl -s -m 5 'http://localhost:3100/api/health?require=worker'))" >>"$SESSION"

"$@"
RC=$?
echo "job exit: $RC at $(date +%H:%M:%S)" >>"$SESSION"
exit $RC
