#!/usr/bin/env bash
# Runs the WebKit project in the pinned Linux Playwright image against the host's isolated test stack. The scratch
# project installs the exact locked Linux dependencies; Windows pnpm symlinks and .env are never mounted.
#   bash e2e/tools/webkit-docker.sh [extra Playwright args]
set -euo pipefail
cd "$(dirname "$0")/../.."

repo="$(pwd -W 2>/dev/null || pwd)"
env_file="$repo/.env.test"
if [[ ! -f "$env_file" ]]; then
  echo "WebKit Docker runner requires .env.test (test credentials are never printed)." >&2
  exit 2
fi

# Resolve only validated, non-secret test-stack coordinates. Never source .env.test as shell code.
if ! stack="$(node e2e/tools/webkit-env.mjs "$env_file")"; then
  echo "Refusing WebKit Docker run: .env.test must target a loopback flowline_test database and FLOWLINE_ENV=test." >&2
  exit 2
fi
IFS=$'\t' read -r app_port fake_port ai_port db_port db_name shard <<<"$stack"

mkdir -p test-results
run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
out_dir="test-results/webkit-linux-$run_id"
if [[ -e "$out_dir" ]]; then
  echo "Refusing to overwrite existing WebKit evidence: $out_dir" >&2
  exit 2
fi
mkdir "$out_dir"

inputs=(e2e src scripts tests worker drizzle package.json pnpm-lock.yaml tsconfig.json playwright.config.ts)
for optional in pnpm-workspace.yaml next.config.ts postcss.config.mjs public; do
  if [[ -e "$optional" ]]; then inputs+=("$optional"); fi
done
for path in "${inputs[@]}"; do
  if [[ ! -e "$repo/$path" ]]; then
    echo "WebKit Docker runner input is missing: $path" >&2
    exit 2
  fi
done

docker_mounts=()
for path in "${inputs[@]}"; do docker_mounts+=(-v "$repo/$path:/work/$path:ro"); done

docker_env=(-e "FLOWLINE_TEST_PORT=$app_port" -e "FLOWLINE_TEST_FAKE_PORT=$fake_port" -e "FLOWLINE_TEST_AI_PORT=$ai_port" -e "FLOWLINE_TEST_DB=$db_name")
if [[ -n "$shard" ]]; then docker_env+=(-e "FLOWLINE_TEST_SHARD=$shard"); fi

set +e
MSYS_NO_PATHCONV=1 docker run --rm -i --ipc=host --add-host host.docker.internal:host-gateway \
  --env-file "$env_file" "${docker_env[@]}" \
  "${docker_mounts[@]}" -v "$repo/$out_dir:/evidence" \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -s -- "$app_port" "$fake_port" "$ai_port" "$db_port" "$@" <<'CONTAINER_SCRIPT'
set -euo pipefail
app_port="$1"; fake_port="$2"; ai_port="$3"; db_port="$4"; shift 4
mkdir -p /run/pw
cp -r /work/e2e /work/src /work/scripts /work/tests /work/worker /work/drizzle /run/pw/
cp /work/package.json /work/pnpm-lock.yaml /work/tsconfig.json /work/playwright.config.ts /run/pw/
for config in next.config.ts postcss.config.mjs; do
  if [ -f "/work/$config" ]; then cp "/work/$config" /run/pw/; fi
done
if [ -d /work/public ]; then cp -r /work/public /run/pw/; fi
if [ -f /work/pnpm-workspace.yaml ]; then cp /work/pnpm-workspace.yaml /run/pw/; fi
cd /run/pw

# Keep test-only values out of dependency lifecycle scripts; restore them without shell evaluation for the run.
env -0 > /run/pw/test-env.bin
install_rc=0
env -i PATH="$PATH" HOME="$HOME" npx --yes pnpm@10.32.1 install --frozen-lockfile \
  > /run/pw/install.log 2>&1 || install_rc=$?
while IFS= read -r -d '' entry; do export "$entry"; done < /run/pw/test-env.bin
rm -f /run/pw/test-env.bin
if [ "$install_rc" -ne 0 ]; then
  tail -60 /run/pw/install.log
  cp /run/pw/install.log /evidence/install.log
  exit "$install_rc"
fi

node e2e/tools/tcp-forward.mjs "$app_port" "$fake_port" "$ai_port" "$db_port" \
  > /run/pw/forward.log 2>&1 &
forward_pid=$!
sleep 1
if ! kill -0 "$forward_pid" 2>/dev/null; then
  cat /run/pw/forward.log
  cp /run/pw/install.log /run/pw/forward.log /evidence/
  exit 1
fi
if ! node --input-type=module -e '
  const url = `http://localhost:${process.argv[1]}/api/health?require=worker`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) process.exitCode = 1;
  } catch { process.exitCode = 1; }
' "$app_port"; then
  echo "The forwarded test app and worker are not healthy; start the isolated test stack first." >&2
  cp /run/pw/install.log /run/pw/forward.log /evidence/
  exit 1
fi

test_rc=0
PLAYWRIGHT_JSON_OUTPUT_NAME=/run/pw/results.json \
  ./node_modules/.bin/playwright test --project=webkit --workers=1 --reporter=line,json \
  --output=/run/pw/out "$@" > /run/pw/report.txt 2>&1 || test_rc=$?
tail -100 /run/pw/report.txt

summary_rc=0
if [ ! -s /run/pw/results.json ]; then
  echo "WebKit JSON report missing; refusing to report a pass." >&2
  summary_rc=1
else
  node --input-type=module -e '
    import fs from "node:fs";
    const report = JSON.parse(fs.readFileSync("/run/pw/results.json", "utf8"));
    const stats = report.stats ?? {};
    const passed = Number(stats.expected ?? 0);
    const failed = Number(stats.unexpected ?? 0);
    const skipped = Number(stats.skipped ?? 0);
    const flaky = Number(stats.flaky ?? 0);
    const interrupted = Number(stats.interrupted ?? 0);
    console.log(`WebKit tests: ${passed} passed, ${failed} failed, ${skipped} skipped, ${flaky} flaky, ${interrupted} interrupted`);
    if (!passed || failed || skipped || flaky || interrupted || stats.ok === false) process.exitCode = 1;
  ' || summary_rc=$?
fi

cp /run/pw/report.txt /run/pw/install.log /run/pw/forward.log /evidence/
if [ -f /run/pw/results.json ]; then cp /run/pw/results.json /evidence/; fi
if [ -d /run/pw/out ]; then cp -r /run/pw/out /evidence/playwright-output; fi
if [ "$test_rc" -ne 0 ] || [ "$summary_rc" -ne 0 ]; then exit 1; fi
CONTAINER_SCRIPT
docker_rc=$?
set -e
echo "WebKit Docker evidence: $out_dir"
if [[ ! -s "$out_dir/results.json" ]]; then
  echo "WebKit Docker run produced no JSON results; refusing a pass." >&2
  exit 1
fi
if ! node --input-type=module -e '
  import fs from "node:fs";
  const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const stats = report.stats ?? {};
  const passed = Number(stats.expected ?? 0);
  const failed = Number(stats.unexpected ?? 0);
  const skipped = Number(stats.skipped ?? 0);
  const flaky = Number(stats.flaky ?? 0);
  const interrupted = Number(stats.interrupted ?? 0);
  console.log(`Verified WebKit results: ${passed} passed, ${failed} failed, ${skipped} skipped, ${flaky} flaky, ${interrupted} interrupted`);
  if (!passed || failed || skipped || flaky || interrupted || stats.ok === false) process.exitCode = 1;
' "$out_dir/results.json"; then
  echo "WebKit Docker result validation failed; refusing a pass." >&2
  exit 1
fi
exit "$docker_rc"
