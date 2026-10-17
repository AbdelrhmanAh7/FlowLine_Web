// Separate from the mocked I/O checks. Actual archived candidate crypto, no DB/app certification.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { digest } from "../lib/safe-recovery.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const path = join(repo, "src/server/crypto.ts");
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8", windowsHide: true });
const candidateSha = head.stdout?.trim();
assert.ok(head.status === 0 && /^[a-f0-9]{40}$/.test(candidateSha ?? ""), "current checkout HEAD is required");
const tracked = spawnSync("git", ["show", `${candidateSha}:src/server/crypto.ts`], { cwd: repo, maxBuffer: 1024 * 1024, windowsHide: true });
assert.ok(tracked.status === 0 && digest(tracked.stdout) === digest(readFileSync(path)), "crypto must match current checkout HEAD");
const crypto = await import(pathToFileURL(path).href);
const workspaceKey = randomBytes(32).toString("base64"), platformKey = randomBytes(32).toString("base64");
process.env.FLOWLINE_ENCRYPTION_KEY = workspaceKey;
process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY = platformKey;
delete process.env.FLOWLINE_ENCRYPTION_KEYS_OLD;
delete process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD;
const wsCtx = { table: "recovery_fixture", rowId: "row", workspaceId: "synthetic-workspace", provider: "synthetic", purpose: "credential" };
const platformCtx = { ...wsCtx, workspaceId: "platform", scope: "platform", revision: 1 };
const value = { token: randomBytes(24).toString("base64") };
const ws = crypto.encryptSecretV2(value, wsCtx), platform = crypto.encryptSecretV2(value, platformCtx);
const refuses = (f) => { let failed = false; try { f(); } catch { failed = true; } assert.ok(failed, "mismatch must be refused"); };
after(() => {
  delete process.env.FLOWLINE_ENCRYPTION_KEY;
  delete process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY;
  delete process.env.FLOWLINE_ENCRYPTION_KEYS_OLD;
  delete process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD;
});

test("candidate workspace encrypted envelope survives serialization with exact recovered key", () => {
  const row = JSON.parse(JSON.stringify(ws));
  assert.ok(crypto.decryptSecretV2(row.ciphertext, row.keyId, wsCtx).token === value.token);
});
test("candidate platform envelope survives serialization with distinct recovered key", () => {
  const row = JSON.parse(JSON.stringify(platform));
  assert.ok(crypto.decryptSecretV2(row.ciphertext, row.keyId, platformCtx).token === value.token);
});
test("candidate refuses AAD row/workspace/revision swaps and ring swap", () => {
  refuses(() => crypto.decryptSecretV2(ws.ciphertext, ws.keyId, { ...wsCtx, rowId: "other-row" }));
  refuses(() => crypto.decryptSecretV2(ws.ciphertext, ws.keyId, { ...wsCtx, workspaceId: "other-workspace" }));
  refuses(() => crypto.decryptSecretV2(platform.ciphertext, platform.keyId, { ...platformCtx, revision: 2 }));
  refuses(() => crypto.decryptSecretV2(platform.ciphertext, platform.keyId, wsCtx));
});
test("candidate refuses wrong workspace key with no active old-key fallback", () => {
  process.env.FLOWLINE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  refuses(() => crypto.decryptSecretV2(ws.ciphertext, ws.keyId, wsCtx));
  process.env.FLOWLINE_ENCRYPTION_KEY = workspaceKey;
});
test("candidate refuses wrong platform key with no active old-key fallback", () => {
  process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  refuses(() => crypto.decryptSecretV2(platform.ciphertext, platform.keyId, platformCtx));
  process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY = platformKey;
});
test("candidate refuses platform/workspace key reuse", () => {
  process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY = workspaceKey;
  refuses(() => crypto.decryptSecretV2(platform.ciphertext, platform.keyId, platformCtx));
  process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY = platformKey;
});
