#!/usr/bin/env bash
# Runs a Playwright project with the official Linux image's browsers (same version as the repo) against the test stack
# already running on the host (pnpm dev:test → :3100, fakes :4010/:4011). For Linux hosts whose installed Playwright
# browsers don't match (e.g. the cloud container). The repo is mounted at its own path so its Linux node_modules
# (pnpm) resolve; nothing is downloaded. Output is written inside the container, then copied to test-results/<project>.
#   bash e2e/tools/browser-docker.sh <chromium|firefox|webkit> [extra playwright args]
set -euo pipefail
cd "$(dirname "$0")/../.."
project="${1:?project (chromium|firefox|webkit)}"
shift
repo="$(pwd)"
exec docker run --rm --ipc=host --add-host host.docker.internal:host-gateway -v "$repo:$repo" -w "$repo" \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c 'set -e; project="$1"; shift; (node e2e/tools/tcp-forward.mjs 3100 4010 4011 &) && sleep 1; rc=0; \
    PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/pw-results.json node_modules/.bin/playwright test --project="$project" --workers=1 --reporter=line,json --output=/tmp/pw-out "$@" > /tmp/pw-report.txt 2>&1 || rc=$?; \
    tail -80 /tmp/pw-report.txt; rm -rf "test-results/$project"; mkdir -p test-results; cp -r /tmp/pw-out "test-results/$project" 2>/dev/null || true; \
    cp /tmp/pw-report.txt "test-results/$project-report.txt"; cp /tmp/pw-results.json "test-results/$project-results.json" 2>/dev/null || true; exit $rc' -- "$project" "$@"
