import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
  );
}

describe("api() error parsing", () => {
  it("reads our own nested { error: { code, message } } shape", async () => {
    respond(409, { error: { code: "REVISION_CONFLICT", message: "Someone else changed it" } });
    await expect(api("/x", { method: "POST" })).rejects.toMatchObject({
      status: 409,
      code: "REVISION_CONFLICT",
      message: "Someone else changed it",
    });
  });

  it("reads better-auth's top-level { code, message } shape", async () => {
    respond(400, { message: "Invalid password", code: "INVALID_PASSWORD" });
    const err = await api("/x", { method: "POST" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("INVALID_PASSWORD");
    expect((err as ApiError).message).toBe("Invalid password");
  });

  it("falls back to HTTP_<status> when the body carries no error", async () => {
    respond(500, null);
    await expect(api("/x")).rejects.toMatchObject({ status: 500, code: "HTTP_500" });
  });
});
