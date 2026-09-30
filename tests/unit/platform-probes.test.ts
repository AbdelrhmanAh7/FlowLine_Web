import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeFetch } from "@/server/egress";
import { runProbe } from "@/server/platform-probes";
import { purposeDef } from "@/server/platform-purposes";

vi.mock("@/server/egress", () => ({ safeFetch: vi.fn() }));

const sendingOnly = { name: "restricted_api_key", message: "This API key is restricted to only send emails." };
const fixtureKey = "synthetic-sending-key";

function respond(status: number, payload: unknown, malformed = false) {
  vi.mocked(safeFetch).mockResolvedValue({
    status,
    headers: new Headers(),
    url: "https://api.resend.com/domains",
    body: new Uint8Array(),
    text: () => "",
    json: <T>() => {
      if (malformed) throw new SyntaxError("Synthetic malformed response");
      return payload as T;
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("FLOWLINE_ENV", "development");
});
afterEach(() => vi.unstubAllEnvs());

describe("read-only platform credential probes", () => {
  it("keeps a documented Resend sending-only 401 unverified without sending email or widening permissions", async () => {
    respond(401, sendingOnly);
    const result = await runProbe(purposeDef("email.resend")!, "sender@example.test", fixtureKey);
    expect(result).toBe("insufficient_permissions");
    expect(result).not.toBe("accepted");
    expect(safeFetch).toHaveBeenCalledExactlyOnceWith("https://api.resend.com/domains", {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${fixtureKey}` },
      timeoutMs: 15_000,
      maxBytes: 65_536,
      maxRedirects: 0,
    });
  });

  it.each([
    [403, { name: "restricted_api_key", message: "API key is not active" }],
    [403, { name: "suspended_api_key", message: "This API key is suspended" }],
    [403, sendingOnly],
    [401, { name: "restricted_api_key", message: "API key is not active" }],
    [401, { name: "invalid_api_key", message: sendingOnly.message }],
    [401, { name: "restricted_api_key", message: `${sendingOnly.message} Unexpected text` }],
    [401, null],
  ])("still rejects HTTP %s without the exact sending-only error", async (status, payload) => {
    respond(status, payload);
    expect(await runProbe(purposeDef("email.resend")!, "sender@example.test", fixtureKey)).toBe("rejected");
  });

  it("does not treat an unreadable Resend 401 as a permission-only restriction", async () => {
    respond(401, null, true);
    expect(await runProbe(purposeDef("email.resend")!, "sender@example.test", fixtureKey)).toBe("rejected");
  });

  it("does not apply Resend error semantics to another provider", async () => {
    respond(401, sendingOnly);
    expect(await runProbe(purposeDef("email.postmark")!, "sender@example.test", fixtureKey)).toBe("rejected");
  });

  it.each([429, 500])("leaves a quota or server failure HTTP %s unverified", async (status) => {
    respond(status, { name: "unavailable" });
    expect(await runProbe(purposeDef("email.resend")!, "sender@example.test", fixtureKey)).toBe("unreachable");
  });

  it("still accepts a successful authenticated read-only response", async () => {
    respond(200, { data: [] });
    expect(await runProbe(purposeDef("email.resend")!, "sender@example.test", fixtureKey)).toBe("accepted");
  });

  it("keeps transport failure unverified", async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error("Synthetic connection failure"));
    expect(await runProbe(purposeDef("email.resend")!, "sender@example.test", fixtureKey)).toBe("unreachable");
  });
});
