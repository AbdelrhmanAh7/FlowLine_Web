#!/usr/bin/env bash
# Runs the WebKit project (@critical journeys + @cross-browser monitors) in the official Linux Playwright image,
# against the test stack already running on the host (pnpm dev:test → :3100, fakes :4010/:4011). WebKit's Windows
# build doesn't start on this host, so this is how WebKit is exercised; the browser is Playwright's WebKit for Linux.
# The repo's node_modules (pnpm symlinks on Windows) aren't usable in Linux, so the specs are copied to a scratch dir
# with only @playwright/test (same version) installed; results are written back to test-results/webkit/.
#   bash e2e/tools/webkit-docker.sh [extra playwright args]
set -euo pipefail
cd "$(dirname "$0")/../.."
MSYS_NO_PATHCONV=1 exec docker run --rm --ipc=host --add-host host.docker.internal:host-gateway \
  -v "$(pwd -W 2>/dev/null || pwd):/work" \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c 'set -e; mkdir -p /run/pw && cp -r /work/e2e /work/playwright.config.ts /run/pw/ && cd /run/pw \
    && echo "{\"name\":\"pw\",\"private\":true}" > package.json && npm install --silent --no-audit --no-fund @playwright/test@1.63.0 >/dev/null \
    && (node e2e/tools/tcp-forward.mjs 3100 4010 4011 &) && sleep 1 \
    && npx playwright test --project=webkit --reporter=line --output=/work/test-results/webkit "$@"' -- "$@"
