#!/usr/bin/env bash
set -euo pipefail
node artifacts/design-v2/chrome-qa/final-cp10/explore.mjs "${1:-B-resume}" > "artifacts/design-v2/helper-logs/codex-cp12-session-${1:-B-resume}.log" 2>&1
