import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { handleWriteError } from "@/app/admin/copy/copy-errors";

afterEach(() => vi.unstubAllGlobals());

describe("api() response-body failures", () => {
  it.each([200, 409])("reports a body cut off mid-read (HTTP %i) as a network ApiError, so the copy editor shows the network message and reloads", async (status) => {
    // Headers arrived but the body never did: the write may or may not have committed (and a 409 is not a trustworthy conflict).
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: status < 300, status, text: async () => { throw new TypeError("terminated"); } })));
    const err = await api("/api/platform/copy", { method: "PATCH", json: {} }).catch((e: unknown) => e) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.isNetwork).toBe(true);
    const fx = { t: (key: string) => key, setError: vi.fn(), setStepUpActive: vi.fn(), refetchMe: vi.fn(async () => ({})), refetchCopy: vi.fn(async () => undefined) };
    await handleWriteError(err, "platformAdmin.copyEditor.saveError", fx);
    expect(fx.setError).toHaveBeenCalledExactlyOnceWith("platformAdmin.copyEditor.networkError");
    expect(fx.refetchCopy).toHaveBeenCalledTimes(1);
  });

  it("still parses a normal response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => '{"a":1}' })));
    await expect(api("/x")).resolves.toEqual({ a: 1 });
  });
});
