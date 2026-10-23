import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const suites = [
  { file: "scripts/release/tests/safe-recovery.test.mjs", expected: 16 },
  { file: "scripts/release/tests/deployment-config.test.mjs", expected: 3 },
  { file: "scripts/release/tests/candidate-crypto-recovery.test.mjs", expected: 6 },
];

function runNodeTest(file: string, expected: number) {
  const result = spawnSync(process.execPath,
    ["--experimental-strip-types", "--test", "--test-concurrency=1", file],
    { cwd: root, encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  const output = result.stdout ?? "";
  const tests = output.match(/(?:^|\n)(?:#|ℹ)\s*tests\s+(\d+)/i)?.[1];
  const failed = output.match(/(?:^|\n)(?:#|ℹ)\s*fail\s+(\d+)/i)?.[1];
  const skipped = output.match(/(?:^|\n)(?:#|ℹ)\s*skipped\s+(\d+)/i)?.[1];
  expect(Number(tests)).toBe(expected);
  expect(Number(failed)).toBe(0);
  expect(Number(skipped)).toBe(0);
}

describe("release recovery Node test suites", () => {
  for (const suite of suites) {
    it(`${suite.file} passes all ${suite.expected} tests`, () => runNodeTest(suite.file, suite.expected));
  }
});
