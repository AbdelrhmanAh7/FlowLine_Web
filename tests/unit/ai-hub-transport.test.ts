import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProviderDef } from "@/ai/hub/registry";
import {
  assertAllowedUrl,
  providerHeaders,
  hubFetch,
  resolveBaseUrl,
  resolveOrigin,
} from "@/ai/hub/transport";

const openai = getProviderDef("openai")!;
const anthropic = getProviderDef("anthropic")!;
const dashscope = getProviderDef("dashscope")!;

const mocks = vi.hoisted(() => {
  class EgressError extends Error {
    constructor(
      public code: "EGRESS_BLOCKED" | "EGRESS_INVALID_URL" | "EGRESS_TOO_LARGE" | "EGRESS_TOO_MANY_REDIRECTS" | "EGRESS_REDIRECT_REFUSED",
      message: string,
    ) {
      super(message);
    }
  }
  const mockSafeFetch = vi.fn();
  return { mockSafeFetch, EgressError };
});

vi.mock("@/server/egress", () => ({
  safeFetch: mocks.mockSafeFetch,
  EgressError: mocks.EgressError,
  parseRetryAfter: vi.fn(),
}));

vi.mock("@/integrations/http", () => ({
  parseRetryAfter: vi.fn(),
}));

describe("transport: assertAllowedUrl (createRequest)", () => {
  it("accepts an allowlisted https host", () => {
    const u = assertAllowedUrl(openai, "https://api.openai.com/v1/chat/completions", {});
    expect(u.href).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("refuses http", () => {
    expect(() => assertAllowedUrl(openai, "http://api.openai.com/v1/chat/completions", {})).toThrowError(
      expect.objectContaining({ code: "AI_EGRESS_BLOCKED" }),
    );
  });

  it("refuses IP address hosts", () => {
    expect(() => assertAllowedUrl(openai, "https://1.2.3.4/v1/chat/completions", {})).toThrowError(
      expect.objectContaining({ code: "AI_EGRESS_BLOCKED" }),
    );
  });

  it("refuses credentials in the URL", () => {
    expect(() => assertAllowedUrl(openai, "https://user:pass@api.openai.com/v1/chat/completions", {})).toThrowError(
      expect.objectContaining({ code: "AI_EGRESS_BLOCKED" }),
    );
  });

  it("refuses unknown hosts", () => {
    expect(() => assertAllowedUrl(openai, "https://evil.com/v1/chat/completions", {})).toThrowError(
      expect.objectContaining({ code: "AI_EGRESS_BLOCKED" }),
    );
  });

  it("works with dashscope placeholder hosts when settings are provided", () => {
    const settings = { region: "ap-southeast-1", workspaceId: "ws-1" };
    const u = assertAllowedUrl(dashscope, "https://ws-1.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions", settings);
    expect(u.href).toBe("https://ws-1.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions");
  });
});

describe("transport: providerHeaders", () => {
  it("keeps the provider's fixed static headers", () => {
    const h = providerHeaders(anthropic, {});
    expect(h["anthropic-version"]).toBe("2023-06-01");
  });

  it("adds header-mapped connection fields when provided", () => {
    const h = providerHeaders(openai, { organization: "org-123", project: "proj-456" });
    expect(h["OpenAI-Organization"]).toBe("org-123");
    expect(h["OpenAI-Project"]).toBe("proj-456");
  });

  it("does not add headers for empty or missing fields", () => {
    const h = providerHeaders(openai, { organization: "", project: "   " });
    expect(h["OpenAI-Organization"]).toBeUndefined();
    expect(h["OpenAI-Project"]).toBeUndefined();
  });
});

describe("transport: hubFetch (executeRequest)", () => {
  beforeEach(() => {
    mocks.mockSafeFetch.mockReset();
  });

  it("calls safeFetch with the correct URL, auth header, maxRedirects: 0 and JSON body", async () => {
    mocks.mockSafeFetch.mockResolvedValue({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      url: "https://api.openai.com/v1/chat/completions",
      body: new Uint8Array(),
      text: () => '{"id":"test"}',
      json: () => ({ id: "test" }),
    });

    const req = {
      method: "POST" as const,
      path: "/chat/completions",
      json: { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
    };

    await hubFetch(openai, "sk-test-key", {}, req);

    expect(mocks.mockSafeFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mocks.mockSafeFetch.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(opts.method).toBe("POST");
    expect(opts.maxRedirects).toBe(0);
    expect(opts.headers?.authorization).toBe("Bearer sk-test-key");
    expect(opts.headers?.["content-type"]).toBe("application/json");
    expect(opts.body).toBe(JSON.stringify(req.json));
  });

  it("uses fromOrigin to resolve against the origin instead of base URL", async () => {
    mocks.mockSafeFetch.mockResolvedValue({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      url: "https://api.openai.com/models",
      body: new Uint8Array(),
      text: () => '{"data":[]}',
      json: () => ({ data: [] }),
    });

    await hubFetch(openai, "sk-test-key", {}, { method: "GET", path: "/models", fromOrigin: true });

    const [url] = mocks.mockSafeFetch.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/models");
  });

  it("maps EGRESS_TOO_MANY_REDIRECTS to AI_REDIRECT_REFUSED", async () => {
    mocks.mockSafeFetch.mockRejectedValue(new mocks.EgressError("EGRESS_TOO_MANY_REDIRECTS", "More than 5 redirects"));

    await expect(hubFetch(openai, "sk-test-key", {}, { method: "GET", path: "/test" })).rejects.toMatchObject({
      code: "AI_REDIRECT_REFUSED",
    });
  });

  it("maps TimeoutError to AI_TIMEOUT with retryable true", async () => {
    const timeoutError = new Error("timeout");
    timeoutError.name = "TimeoutError";
    mocks.mockSafeFetch.mockRejectedValue(timeoutError);

    await expect(hubFetch(openai, "sk-test-key", {}, { method: "POST", path: "/test" })).rejects.toMatchObject({
      code: "AI_TIMEOUT",
      retryable: true,
      possibleCharge: true,
    });
  });

  it("maps AbortError to AI_TIMEOUT with retryable true", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    mocks.mockSafeFetch.mockRejectedValue(abortError);

    await expect(hubFetch(openai, "sk-test-key", {}, { method: "POST", path: "/test" })).rejects.toMatchObject({
      code: "AI_TIMEOUT",
      retryable: true,
      possibleCharge: true,
    });
  });

  it("maps other errors to AI_UNAVAILABLE with retryable true", async () => {
    mocks.mockSafeFetch.mockRejectedValue(new Error("network down"));

    await expect(hubFetch(openai, "sk-test-key", {}, { method: "GET", path: "/test" })).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      retryable: true,
    });
  });

  it("maps EGRESS_TOO_LARGE to AI_RESPONSE_TOO_LARGE with possibleCharge", async () => {
    mocks.mockSafeFetch.mockRejectedValue(new mocks.EgressError("EGRESS_TOO_LARGE", "Response too large"));

    await expect(hubFetch(openai, "sk-test-key", {}, { method: "GET", path: "/test" })).rejects.toMatchObject({
      code: "AI_RESPONSE_TOO_LARGE",
      possibleCharge: true,
    });
  });

  it("maps other EgressError codes to AI_EGRESS_BLOCKED", async () => {
    mocks.mockSafeFetch.mockRejectedValue(new mocks.EgressError("EGRESS_BLOCKED", "Private address"));

    await expect(hubFetch(openai, "sk-test-key", {}, { method: "GET", path: "/test" })).rejects.toMatchObject({
      code: "AI_EGRESS_BLOCKED",
    });
  });
});

describe("transport: resolveBaseUrl and resolveOrigin", () => {
  it("returns the documented base URL without trailing slash", () => {
    expect(resolveBaseUrl(openai, {})).toBe("https://api.openai.com/v1");
    expect(resolveOrigin(openai, {})).toBe("https://api.openai.com");
  });

  it("fills dashscope placeholders from settings", () => {
    const settings = { region: "ap-southeast-1", workspaceId: "ws-1" };
    expect(resolveBaseUrl(dashscope, settings)).toBe("https://ws-1.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1");
    expect(resolveOrigin(dashscope, settings)).toBe("https://ws-1.ap-southeast-1.maas.aliyuncs.com");
  });
});