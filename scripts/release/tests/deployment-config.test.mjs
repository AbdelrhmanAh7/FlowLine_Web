import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path) => readFileSync(resolve(repo, path), "utf8");

test("Docker context excludes environment, takeover scratch, and database backup material", () => {
  const ignore = read(".dockerignore");
  for (const rule of [".env", ".env.*", "**/.env", "**/.env.*", ".takeover-beta-*", "**/.takeover-beta-*",
    "*.bundle", "**/*.bundle", "*.dump", "**/*.dump", "*.dump.*", "**/*.dump.*"]) {
    assert.ok(ignore.split(/\r?\n/).includes(rule), `missing Docker ignore rule: ${rule}`);
  }
});

test("Pi template is ARM64, invite-only, sandbox-only, and publishes no host ports", () => {
  const compose = read("deploy/beta/docker-compose.pi.yml");
  assert.match(compose, /platform:\s*linux\/arm64/);
  assert.match(compose, /FLOWLINE_BETA_MODE:\s*invite_only/);
  assert.match(compose, /FLOWLINE_BILLING_PADDLE_ENV:\s*sandbox/);
  assert.match(compose, /FLOWLINE_BILLING_ALLOW_LIVE:\s*"false"/);
  assert.match(compose, /FLOWLINE_WORKER_CONCURRENCY:\s*"1"/);
  assert.doesNotMatch(compose, /^\s*ports\s*:/m);
  assert.doesNotMatch(compose, /^\s*container_name\s*:/m);
  assert.match(compose, /database:\s*\{\s*internal:\s*true\s*\}/);
  assert.match(compose, /origin:\s*\{\s*internal:\s*true\s*\}/);
});

test("named tunnel template has a terminal deny rule and no ephemeral tunnel", () => {
  const tunnel = read("deploy/beta/cloudflared.yml.example");
  assert.match(tunnel, /REPLACE_WITH_APPROVED_NAMED_TUNNEL_UUID/);
  assert.match(tunnel, /service:\s*http:\/\/caddy:8080/);
  assert.match(tunnel, /service:\s*http_status:404/);
  assert.doesNotMatch(tunnel, /trycloudflare\.com|token:\s*[^\s#]/i);
  const compose = read("deploy/beta/docker-compose.pi.yml");
  assert.match(compose, /image:\s*\$\{CLOUDFLARED_IMAGE:\?/);
  assert.match(compose, /source:\s*\$\{BETA_TUNNEL_CREDENTIALS_FILE:\?/);
  assert.match(compose, /read_only:\s*true/);
});
