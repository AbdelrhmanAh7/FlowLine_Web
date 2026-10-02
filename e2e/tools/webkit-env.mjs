#!/usr/bin/env node
// Validates .env.test without shell evaluation and emits only safe stack coordinates for webkit-docker.sh.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { testStack } = require("../../scripts/test-stack.cjs");
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const fail = (code) => {
  console.error(`invalid WebKit test environment (${code})`);
  process.exit(2);
};

try {
  const fileEnv = parseEnv(readFileSync(process.argv[2], "utf8"));
  if (fileEnv.FLOWLINE_ENV !== "test") fail("environment");
  const dbUrl = new URL(fileEnv.DATABASE_URL ?? "");
  const dbName = decodeURIComponent(dbUrl.pathname.replace(/^\//, ""));
  if (!/^postgres(?:ql)?:$/.test(dbUrl.protocol) || !LOOPBACK.has(dbUrl.hostname) || !/^flowline_test(?:_[a-z0-9]+)?$/.test(dbName)) {
    fail("database");
  }

  const resolved = { ...fileEnv };
  for (const key of ["FLOWLINE_TEST_PORT", "FLOWLINE_TEST_FAKE_PORT", "FLOWLINE_TEST_AI_PORT", "FLOWLINE_TEST_DB", "FLOWLINE_TEST_SHARD"]) {
    if (process.env[key] !== undefined && process.env[key] !== "") resolved[key] = process.env[key];
  }
  const stack = testStack(resolved);
  const shard = stack.shard;
  if (shard && !/^[A-Za-z0-9_-]+$/.test(shard)) fail("shard");
  for (const key of ["FLOWLINE_PROVIDER_OVERRIDE", "FLOWLINE_AI_TEST_OVERRIDE"]) {
    if (!fileEnv[key]) continue;
    const url = new URL(fileEnv[key]);
    if (!LOOPBACK.has(url.hostname)) fail("fake-host");
  }
  const dbPort = Number(dbUrl.port || 5432);
  const ports = [stack.port, stack.fakePort, stack.aiPort, dbPort];
  if (ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535) || new Set(ports).size !== ports.length) fail("ports");

  // Tab-delimited output contains only validated integers, a restricted test DB name, and a validated shard label.
  process.stdout.write(`${stack.port}\t${stack.fakePort}\t${stack.aiPort}\t${dbPort}\t${stack.db}\t${shard}\n`);
} catch {
  fail("parse");
}
