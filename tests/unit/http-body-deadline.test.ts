import { afterEach, describe, expect, it, vi } from "vitest";
import { BODY_READ_TIMEOUT_MS, capBody, HttpError } from "@/server/http";
import { apiErrorMessage } from "@/i18n/errors";
import { createTranslator } from "@/i18n/translate";
import { ApiError } from "@/lib/api";

const tooLarge = new HttpError(413, "BODY_TOO_LARGE", "too large");
const request = (body: ReadableStream<Uint8Array>) => new Request("http://localhost/upload", { method: "POST", body, duplex: "half" } as RequestInit);
afterEach(() => vi.useRealTimers());

describe("request body deadline", () => {
  it("refuses a stalled stream even when its cancellation hook never completes", async () => {
    vi.useFakeTimers();
    let canceled = 0;
    const input = request(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { canceled++; return new Promise(() => {}); } }));
    const result = capBody(input, 100, tooLarge);
    const denied = expect(result).rejects.toMatchObject({ status: 408, code: "BODY_READ_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS);
    await denied;
    expect(canceled).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("applies one deadline to the whole body, even when bytes keep arriving", async () => {
    vi.useFakeTimers();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const input = request(new ReadableStream({ start(value) { controller = value; } }));
    const result = capBody(input, 100, tooLarge);
    const denied = expect(result).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS - 1000);
    controller.enqueue(new Uint8Array([1]));
    await vi.advanceTimersByTimeAsync(1000);
    await denied;
  });
  it("refuses overflow without waiting for a hostile cancel hook", async () => {
    let canceled = 0;
    const input = request(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(101)); }, cancel() { canceled++; return new Promise(() => {}); } }));
    await expect(capBody(input, 100, tooLarge)).rejects.toBe(tooLarge);
    expect(canceled).toBe(1);
  });
  it("preserves successful input and clears its timer", async () => {
    vi.useFakeTimers();
    const input = new Request("http://localhost/upload", { method: "POST", body: "valid body" });
    expect(await (await capBody(input, 100, tooLarge)).text()).toBe("valid body");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("translates the stable timeout code in both UI languages", () => {
    const error = new ApiError(408, "BODY_READ_TIMEOUT", "synthetic fallback");
    const ar = apiErrorMessage(createTranslator("ar"), error);
    const en = apiErrorMessage(createTranslator("en"), error);
    expect(ar).toMatch(/[\u0600-\u06ff]/);
    expect(en).toContain("upload");
    expect(ar).not.toContain("synthetic fallback");
    expect(en).not.toContain("synthetic fallback");
  });
});