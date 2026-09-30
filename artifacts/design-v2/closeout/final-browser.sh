#!/usr/bin/env bash
set -uo pipefail
browser="$1"
out="artifacts/design-v2/gate/final-cp10/final-$browser"
mkdir -p "$out"
export E2E_SCREENSHOT_DIR="$out/screenshots"
case "$browser" in
  chromium) pnpm exec playwright test --project=chromium --workers=1 --trace=off --reporter=list > "$out/results.txt" 2>&1 ;;
  firefox) bash artifacts/design-v2/closeout/firefox-docker.sh --workers=1 --trace=off > "$out/results.txt" 2>&1 ;;
  webkit) bash e2e/tools/webkit-docker.sh --workers=1 --trace=off > "$out/results.txt" 2>&1 ;;
  *) exit 2 ;;
esac
exit $?
