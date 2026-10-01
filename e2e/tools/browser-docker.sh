#!/usr/bin/env bash
# Runs a Playwright project with the official Linux image's browsers (same version as the repo) against the test stack
# already running on the host (pnpm dev:test → :3100, fakes :4010/:4011). For Linux hosts whose installed Playwright
# browsers don't match (e.g. the cloud container). The repo is mounted at its own path so its Linux node_modules
# (pnpm) resolve; nothing is downloaded. Output is written inside the container, then copied to test-results/<project>.
# Host networking: the browsers are LOOPBACK clients of the stack (as on the owner's machine). Through a TCP forwarder
# they appeared as the docker bridge address, so the test stack's loopback-only email rate-limit relief didn't apply
# and sign-ups started failing mid-suite (first cloud Chromium run, kept as evidence) — and specs that shell out to
# scripts need the host's database on 127.0.0.1.
#   bash e2e/tools/browser-docker.sh <chromium|firefox|webkit> [extra playwright args]
# Sharded (one isolated stack per shard, see scripts/test-stack.cjs): the stack's FLOWLINE_TEST_PORT / _FAKE_PORT /
# _AI_PORT / _DB are passed through to the container, and FLOWLINE_TEST_SHARD names this run's outputs
# (test-results/<project>-<shard>, -<shard>-report.txt, -<shard>-results.json) so parallel runs don't clobber each other:
#   FLOWLINE_TEST_SHARD=2 FLOWLINE_TEST_PORT=3200 FLOWLINE_TEST_FAKE_PORT=4110 FLOWLINE_TEST_AI_PORT=4111 \
#     FLOWLINE_TEST_DB=flowline_test_s2 bash e2e/tools/browser-docker.sh chromium --shard=2/4
set -euo pipefail
cd "$(dirname "$0")/../.."
project="${1:?project (chromium|firefox|webkit)}"
shift
shard="${FLOWLINE_TEST_SHARD:-}"
if [[ -n "$shard" && ! "$shard" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "FLOWLINE_TEST_SHARD must be [A-Za-z0-9_-]+ (got: $shard)" >&2
  exit 2
fi
out="$project${shard:+-$shard}"
repo="$(pwd)"
exec docker run --rm --ipc=host --network host -v "$repo:$repo" -w "$repo" \
  -e FLOWLINE_TEST_PORT -e FLOWLINE_TEST_FAKE_PORT -e FLOWLINE_TEST_AI_PORT -e FLOWLINE_TEST_DB -e FLOWLINE_TEST_SHARD \
  -e E2E_SCREENSHOT_DIR \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c 'set -e; project="$1"; out="$2"; shift 2; rc=0; \
    PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/pw-results.json node_modules/.bin/playwright test --project="$project" --workers=1 --reporter=line,json --output=/tmp/pw-out "$@" > /tmp/pw-report.txt 2>&1 || rc=$?; \
    tail -80 /tmp/pw-report.txt; rm -rf "test-results/$out"; mkdir -p test-results; cp -r /tmp/pw-out "test-results/$out" 2>/dev/null || true; \
    cp /tmp/pw-report.txt "test-results/$out-report.txt"; cp /tmp/pw-results.json "test-results/$out-results.json" 2>/dev/null || true; exit $rc' -- "$project" "$out" "$@"
