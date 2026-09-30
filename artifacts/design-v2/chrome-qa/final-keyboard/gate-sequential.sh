#!/usr/bin/env bash
set -euo pipefail
node artifacts/design-v2/chrome-qa/final-keyboard/verify-inputs.mjs 20
export E2E_SCREENSHOT_DIR=artifacts/design-v2/helper-logs/final-cp20-captures
bash artifacts/design-v2/closeout/run-with-stack.sh artifacts/design-v2/gate/final-keyboard/final-chromium pnpm exec playwright test --project=chromium --workers=1 --reporter=line --trace=off > artifacts/design-v2/helper-logs/keyboard-final-chromium.log 2>&1
cp artifacts/design-v2/helper-logs/keyboard-final-chromium.log artifacts/design-v2/gate/final-keyboard/final-chromium/results.txt
bash artifacts/design-v2/closeout/run-with-stack.sh artifacts/design-v2/gate/final-keyboard/final-firefox bash artifacts/design-v2/closeout/firefox-docker.sh --workers=1 --trace=off > artifacts/design-v2/helper-logs/keyboard-final-firefox.log 2>&1
cp artifacts/design-v2/helper-logs/keyboard-final-firefox.log artifacts/design-v2/gate/final-keyboard/final-firefox/results.txt
bash artifacts/design-v2/closeout/run-with-stack.sh artifacts/design-v2/gate/final-keyboard/final-webkit bash e2e/tools/webkit-docker.sh --workers=1 --trace=off > artifacts/design-v2/helper-logs/keyboard-final-webkit.log 2>&1
cp artifacts/design-v2/helper-logs/keyboard-final-webkit.log artifacts/design-v2/gate/final-keyboard/final-webkit/results.txt
