#!/usr/bin/env bash
# Runs the WebKit project (@critical journeys) in the official Linux Playwright image, against the test stack
# already running on the host (pnpm dev:test → :3100, fakes :4010/:4011). WebKit's Windows build doesn't start
# on this host, so this is how WebKit is exercised; the browser is Playwright's WebKit for Linux.
#   bash e2e/tools/webkit-docker.sh [extra playwright args]
set -euo pipefail
cd "$(dirname "$0")/../.."
exec docker run --rm --ipc=host --add-host host.docker.internal:host-gateway \
  -v "$(pwd -W 2>/dev/null || pwd):/work" -w /work \
  -e CI=1 -e PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/webkit-results.json \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c 'node e2e/tools/tcp-forward.mjs 3100 4010 4011 & sleep 1; npx playwright test --project=webkit --reporter=line,json "$@"' -- "$@"
