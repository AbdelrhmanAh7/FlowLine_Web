import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { BODY_READ_TIMEOUT_MS, JSON_BODY_MAX_BYTES, UPLOAD_BODY_READ_TIMEOUT_MS } from "@/server/http";
import { AUTH_BODY_MAX_BYTES, PUBLIC_JSON_MAX_BYTES } from "@/server/public-body";

vi.mock("@/server/rate-limit", () => ({ checkRate: vi.fn() }));

// Config contract tests, not Caddy runtime acceptance. Exercise the actual configured regexes
// (the shared RE2/JS subset here) and byte values, so route exceptions cannot silently broaden.
const caddy = readFileSync("deploy/beta/Caddyfile", "utf8").replace(/^\s*#.*$/gm, "");
const matchers = new Map([...caddy.matchAll(/^\s*@(\w+) (not )?path_regexp (\S+)\s*$/gm)]
  .map(([, name, negate, pattern]) => [name, { negate: !!negate, regex: new RegExp(pattern) }]));
// Every request_body block starts with max_size; read_timeout (whole seconds) is optional and only the upload block sets it.
const limits = [...caddy.matchAll(/request_body @(\w+)\s*\{\s*max_size (\d+)(KiB|MiB)?(?:\s*read_timeout (\d+)s)?\s*\}/g)]
  .map(([, name, value, unit, readTimeout]) => ({
    name,
    bytes: Number(value) * (unit === "MiB" ? 1024 ** 2 : unit === "KiB" ? 1024 : 1),
    readTimeoutMs: readTimeout === undefined ? undefined : Number(readTimeout) * 1000,
  }));
const UPLOAD_BYTES = 5 * 1024 * 1024 + 64 * 1024;
// The stated minimum upload throughput the 5 MiB routes must tolerate: 512 kbit/s.
const MIN_UPLOAD_BYTES_PER_SECOND = 64_000;

function applicable(path: string) {
  return limits.filter(({ name }) => {
    const matcher = matchers.get(name)!;
    return matcher.regex.test(path) !== matcher.negate;
  });
}

function budget(path: string) {
  return Math.min(...applicable(path).map(({ bytes }) => bytes));
}

/** Caddy sets read_timeout as a last-writer-wins absolute deadline; without one the global read_body applies. */
function readDeadlineMs(path: string) {
  const timed = applicable(path).filter(({ readTimeoutMs }) => readTimeoutMs !== undefined);
  return timed.length ? timed[timed.length - 1].readTimeoutMs! : BODY_READ_TIMEOUT_MS;
}

describe("beta ingress request-body policy", () => {
  it("installs every configured cap before forwarding, with bounded socket reads", () => {
    expect(limits).toHaveLength(7);
    expect(matchers.size).toBe(7);
    for (const { name } of limits) {
      expect(matchers.has(name)).toBe(true);
      expect(caddy.indexOf(`request_body @${name}`)).toBeLessThan(caddy.indexOf("reverse_proxy web:3000"));
    }
    expect(caddy).toMatch(/^\s*\{\s*servers\s*\{\s*protocols h1 h2\s*timeouts\s*\{\s*read_header 5s\s*read_body 10s\s*\}/);
    expect(Number(caddy.match(/read_body (\d+)s/)![1]) * 1000).toBe(BODY_READ_TIMEOUT_MS);
    // No blanket response timeout: run-event streams can legitimately outlive an upload.
    expect(caddy).not.toMatch(/\b(write|response_header_timeout)\s+\d/);
  });

  it.each([
    ["/api/email", PUBLIC_JSON_MAX_BYTES],
    ["/api/email/", PUBLIC_JSON_MAX_BYTES],
    ["/api/beta/check", PUBLIC_JSON_MAX_BYTES],
    ["/api/beta/check/", PUBLIC_JSON_MAX_BYTES],
    ["/api/auth/sign-up/email", AUTH_BODY_MAX_BYTES],
    ["/api/auth/callback/zitadel", AUTH_BODY_MAX_BYTES],
    ["/api/auth/two-factor/verify-totp", AUTH_BODY_MAX_BYTES],
    ["/api/auth", AUTH_BODY_MAX_BYTES],
    ["/api/hooks/synthetic-token", 256 * 1024],
    ["/api/billing/webhook/", 256 * 1024],
    ["/api/platform/secrets", 16 * 1024],
    ["/api/platform/setup/email", 8 * 1024],
    ["/api/workspaces/id/oauth-apps/google/", 8 * 1024],
    ["/api/workspaces/id/knowledge", 5 * 1024 * 1024 + 64 * 1024],
    ["/api/workspaces/id/files/", 5 * 1024 * 1024 + 64 * 1024],
  ])("applies the existing route budget to %s", (path, bytes) => {
    expect(budget(path)).toBe(bytes);
  });

  it.each([
    "/api/flows/id/runs", "/api/workspaces/id/agents", "/api/v1/flows/id/runs", "/",
    "/api/email-extra", "/api/authentication", "/api/platform/setup-other",
    "/api/workspaces/id/knowledge/source", "/api/workspaces/id/files/file",
    "/api/workspaces/id/knowledge-extra", "/api/workspaces/id/extra/files",
  ])("does not grant an upload-sized body to %s", (path) => {
    expect(budget(path)).toBeLessThanOrEqual(JSON_BODY_MAX_BYTES);
  });

  it("lets only the exact upload routes read a body past the default deadline", () => {
    expect(limits.filter(({ readTimeoutMs }) => readTimeoutMs !== undefined).map(({ name }) => name)).toEqual(["upload_body"]);
    for (const path of ["/api/workspaces/id/files", "/api/workspaces/id/files/", "/api/workspaces/id/knowledge", "/api/workspaces/id/knowledge/"]) {
      // Exactly one block applies, so the deadline cannot depend on directive order.
      expect(applicable(path).map(({ name }) => name)).toEqual(["upload_body"]);
      expect(readDeadlineMs(path)).toBe(UPLOAD_BODY_READ_TIMEOUT_MS);
    }
    for (const path of [
      "/api/email", "/api/beta/check", "/api/auth/sign-up/email", "/api/hooks/synthetic-token", "/api/billing/webhook",
      "/api/platform/secrets", "/api/platform/setup/email", "/api/workspaces/id/oauth-apps/google", "/api/flows/id/runs",
      "/api/workspaces/id/agents", "/api/workspaces/id/knowledge/source", "/api/workspaces/id/files/file",
      "/api/workspaces/id/knowledge-extra", "/api/workspaces/id/extra/files", "/unknown", "/",
    ])
      expect(readDeadlineMs(path)).toBe(BODY_READ_TIMEOUT_MS);
  });

  it("derives the upload deadline from its byte cap and a stated 512 kbit/s floor, and keeps it bounded", () => {
    expect(budget("/api/workspaces/id/files")).toBe(UPLOAD_BYTES);
    expect(budget("/api/workspaces/id/knowledge")).toBe(UPLOAD_BYTES);
    // At the floor rate the whole cap arrives inside the deadline ...
    expect(UPLOAD_BYTES / MIN_UPLOAD_BYTES_PER_SECOND).toBeLessThanOrEqual(UPLOAD_BODY_READ_TIMEOUT_MS / 1000);
    // ... the deadline strictly extends the default, and stays bounded (no open-ended slowloris window).
    expect(UPLOAD_BODY_READ_TIMEOUT_MS).toBeGreaterThan(BODY_READ_TIMEOUT_MS);
    expect(UPLOAD_BODY_READ_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
    // Every other route keeps the original 10 s.
    expect(BODY_READ_TIMEOUT_MS).toBe(10_000);
  });

  it("uses the general JSON budget for custom JSON readers and unknown routes", () => {
    for (const path of ["/api/workspaces/id/agents", "/api/flows/id/runs", "/unknown"])
      expect(budget(path)).toBe(JSON_BODY_MAX_BYTES);
  });
});
