import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import { copyErrorKey, shouldRefetchAfterWriteError } from "@/app/admin/copy/copy-errors";

afterEach(() => vi.unstubAllGlobals());

const bodyReadRejects = (status: number) => vi.fn(async () => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => { throw new TypeError("terminated"); },
}));

describe("api() response-body failures", () => {
  it("reports a body read that rejects as a network ApiError so writes get reconciled", async () => {
    vi.stubGlobal("fetch", bodyReadRejects(200));
    const err = await api("/api/platform/copy", { method: "PATCH", json: {} }).catch((e: unknown) => e) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.isNetwork).toBe(true);
    // The full choice the editor's handleWriteError makes for this ambiguous failure:
    expect(copyErrorKey(err, "platformAdmin.copyEditor.saveError")).toBe("platformAdmin.copyEditor.networkError");
    expect(shouldRefetchAfterWriteError(err)).toBe(true);
  });

  it("treats a lost body on a non-2xx response as ambiguous too (reconcile, never a misleading conflict)", async () => {
    // Headers say 409, but the body never arrives — the write may or may not have committed.
    vi.stubGlobal("fetch", bodyReadRejects(409));
    const err = await api("/api/platform/copy", { method: "PATCH", json: {} }).catch((e: unknown) => e) as ApiError;
    expect(err.isNetwork).toBe(true);
    expect(shouldRefetchAfterWriteError(err)).toBe(true);
  });

  it("still parses a normal response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => '{"a":1}' })));
    await expect(api("/x")).resolves.toEqual({ a: 1 });
  });
});
