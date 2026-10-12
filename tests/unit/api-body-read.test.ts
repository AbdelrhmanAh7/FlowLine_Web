import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { shouldRefetchAfterWriteError } from "@/app/admin/copy/copy-errors";

afterEach(() => vi.unstubAllGlobals());

describe("api() response-body failures", () => {
  it("reports a body read that rejects as a network ApiError so writes get reconciled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => { throw new TypeError("terminated"); } })));
    const err = await api("/api/platform/copy", { method: "PATCH", json: {} }).catch((e: unknown) => e) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.isNetwork).toBe(true);
    expect(shouldRefetchAfterWriteError(err)).toBe(true);
  });

  it("still parses a normal response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => '{"a":1}' })));
    await expect(api("/x")).resolves.toEqual({ a: 1 });
  });
});
