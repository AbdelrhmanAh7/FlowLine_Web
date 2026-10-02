import { describe, expect, it } from "vitest";

describe("provider fake basic auth and secret-in-body parsing", () => {
  it("splits basic auth credentials on the first colon only", () => {
    const rawId = "flowline@fake-tenant";
    const rawSecret = "fake-secret:with!symbols:extra";
    const authHeader = `Basic ${Buffer.from(`${rawId}:${rawSecret}`).toString("base64")}`;

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    const id = colon === -1 ? decoded : decoded.slice(0, colon);
    const secret = colon === -1 ? "" : decoded.slice(colon + 1);

    expect(id).toBe(rawId);
    expect(secret).toBe(rawSecret);
  });

  it("decodes URL encoded credentials safely without truncation at ampersands", () => {
    const rawSecret = "secret+with%20spaces&symbols=1";
    const decodeParam = (v: string) => {
      try {
        return decodeURIComponent(v.replace(/\+/g, " "));
      } catch {
        return v;
      }
    };
    expect(decodeParam(rawSecret)).toBe("secret with spaces&symbols=1");
  });

  it("detects client_secret in parsed form without substring false positives", () => {
    const parseForm = (raw: string): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
      return out;
    };

    const formWithPrefix = parseForm("x_client_secret=bar&code=123");
    expect("client_secret" in formWithPrefix).toBe(false);

    const formWithSecret = parseForm("client_secret=bar&code=123");
    expect("client_secret" in formWithSecret).toBe(true);
  });
});
