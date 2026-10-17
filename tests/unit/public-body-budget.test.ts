import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseBody } from "@/server/http";
import { admitPublicBody, AUTH_BODY_MAX_BYTES, capAuthBody, PUBLIC_JSON_MAX_BYTES } from "@/server/public-body";
import { checkRate } from "@/server/rate-limit";

vi.mock("@/server/rate-limit", () => ({ checkRate: vi.fn(async () => true) }));
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => vi.mocked(checkRate).mockClear());

function oversized(max: number, length?: string) {
  let pulled = 0;
  let canceled = false;
  const chunkSize = 1024;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { pulled += chunkSize; controller.enqueue(new Uint8Array(chunkSize).fill(32)); },
    cancel() { canceled = true; },
  });
  const req = new Request("https://flowline.example/api/email", { method: "POST", body: stream, duplex: "half", headers: length ? { "content-length": length } : {} } as RequestInit);
  return { req, assertBounded() { expect(pulled).toBeLessThanOrEqual(max + 2 * chunkSize); expect(canceled).toBe(true); } };
}

describe("public parsing byte budgets", () => {
  for (const length of [undefined, "1"])
    it(`returns 413 with bounded reads before JSON/schema parsing (Content-Length ${length ?? "absent"})`, async () => {
      const body = oversized(PUBLIC_JSON_MAX_BYTES, length);
      const schema = z.object({ email: z.string() });
      const parse = vi.spyOn(schema, "safeParse");
      await expect(parseBody(body.req, schema, PUBLIC_JSON_MAX_BYTES)).rejects.toMatchObject({ status: 413, code: "BODY_TOO_LARGE" });
      body.assertBounded(); expect(parse).not.toHaveBeenCalled();
    });
  it("retains valid JSON/schema errors and an ordinary Unicode request", async () => {
    const req = (text: string) => new Request("https://flowline.example/api/email", { method: "POST", body: text });
    expect(await parseBody(req('{"name":"مرحبا"}'), z.object({ name: z.string() }), PUBLIC_JSON_MAX_BYTES)).toEqual({ name: "مرحبا" });
    await expect(parseBody(req("{bad"), z.object({ name: z.string() }))).rejects.toMatchObject({ status: 400, code: "BAD_JSON" });
    await expect(parseBody(req("{}"), z.object({ name: z.string() }))).rejects.toMatchObject({ status: 400, code: "VALIDATION" });
  });
  it("caps auth streams before cloning/JSON or form parsing", async () => {
    const body = oversized(AUTH_BODY_MAX_BYTES, "1");
    await expect(capAuthBody(body.req)).rejects.toMatchObject({ status: 413 }); body.assertBounded();
    const request = new Request("https://flowline.example/api/auth/callback/google", { method: "POST", body: "state=small&code=fixture" });
    const capped = await capAuthBody(request);
    expect(await capped.clone().text()).toBe("state=small&code=fixture");
    expect(await capped.text()).toBe("state=small&code=fixture");
  });
  it("refuses declared oversize before trusted-IP DB admission/body reading", async () => {
    const request = new Request("https://flowline.example/api/auth/sign-up/email", { method: "POST", headers: { "content-length": String(AUTH_BODY_MAX_BYTES + 1), "x-real-ip": "192.0.2.1" }, body: "{}" });
    await expect(capAuthBody(request)).rejects.toMatchObject({ status: 413 }); expect(checkRate).not.toHaveBeenCalled();
  });
  it("uses the proxy-overwritten IP before reading the body and refuses exhausted admission", async () => {
    vi.stubEnv("FLOWLINE_ENV", "staging");
    vi.mocked(checkRate).mockResolvedValueOnce(false);
    const request = new Request("https://flowline.example/api/auth/sign-in/email", { method: "POST", headers: { "x-real-ip": "192.0.2.1", "x-forwarded-for": "198.51.100.1" }, body: "{}" });
    await expect(capAuthBody(request)).rejects.toMatchObject({ status: 429 });
    expect(checkRate).toHaveBeenCalledWith("public-body:auth:192.0.2.1", 60, 60); expect(request.bodyUsed).toBe(false);
  });
  it("does not trust a caller's forwarding chain and bounds requests without proxy identity", async () => {
    await admitPublicBody(new Request("https://flowline.example", { headers: { "x-forwarded-for": "198.51.100.1" } }), "email");
    expect(checkRate).not.toHaveBeenCalled();
  });
});
