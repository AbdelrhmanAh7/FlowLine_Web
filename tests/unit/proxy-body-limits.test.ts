import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { BODY_READ_TIMEOUT_MS, JSON_BODY_MAX_BYTES } from "@/server/http";
import { AUTH_BODY_MAX_BYTES, PUBLIC_JSON_MAX_BYTES } from "@/server/public-body";

vi.mock("@/server/rate-limit", () => ({ checkRate: vi.fn() }));

// Config contract tests, not Caddy runtime acceptance. Exercise the actual configured regexes
// (the shared RE2/JS subset here) and byte values, so route exceptions cannot silently broaden.
const caddy = readFileSync("deploy/beta/Caddyfile", "utf8").replace(/^\s*#.*$/gm, "");
const matchers = new Map([...caddy.matchAll(/^\s*@(\w+) (not )?path_regexp (\S+)\s*$/gm)]
  .map(([, name, negate, pattern]) => [name, { negate: !!negate, regex: new RegExp(pattern) }]));
const limits = [...caddy.matchAll(/request_body @(\w+)\s*\{\s*max_size (\d+)(KiB|MiB)?\s*\}/g)]
  .map(([, name, value, unit]) => ({ name, bytes: Number(value) * (unit === "MiB" ? 1024 ** 2 : unit === "KiB" ? 1024 : 1) }));

function budget(path: string) {
  return Math.min(...limits.filter(({ name }) => {
    const matcher = matchers.get(name)!;
    return matcher.regex.test(path) !== matcher.negate;
  }).map(({ bytes }) => bytes));
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

  it("uses the general JSON budget for custom JSON readers and unknown routes", () => {
    for (const path of ["/api/workspaces/id/agents", "/api/flows/id/runs", "/unknown"])
      expect(budget(path)).toBe(JSON_BODY_MAX_BYTES);
  });
});
