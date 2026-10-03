import { afterEach, describe, expect, it, vi } from "vitest";
import { BODY_READ_TIMEOUT_MS, capBody, HttpError, UPLOAD_BODY_READ_TIMEOUT_MS } from "@/server/http";
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

describe("upload body deadline", () => {
  const UPLOAD_BYTES = 5 * 1024 * 1024 + 64 * 1024;
  const FLOOR_BYTES_PER_SECOND = 64_000; // 512 kbit/s

  it("keeps the default 10 s deadline when no override is passed", async () => {
    vi.useFakeTimers();
    const input = request(new ReadableStream({ pull() { return new Promise(() => {}); } }));
    const denied = expect(capBody(input, 100, tooLarge)).rejects.toMatchObject({ status: 408, code: "BODY_READ_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS);
    await denied;
  });

  it("accepts a full-size upload that arrives slowly, at the 512 kbit/s floor", async () => {
    vi.useFakeTimers();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const input = request(new ReadableStream({ start(value) { controller = value; } }));
    const result = capBody(input, UPLOAD_BYTES, tooLarge, UPLOAD_BODY_READ_TIMEOUT_MS);
    let sent = 0;
    let seconds = 0;
    while (sent < UPLOAD_BYTES) {
      const chunk = Math.min(FLOOR_BYTES_PER_SECOND, UPLOAD_BYTES - sent);
      controller.enqueue(new Uint8Array(chunk));
      sent += chunk;
      seconds++;
      await vi.advanceTimersByTimeAsync(1000);
    }
    controller.close();
    // At the floor rate this body takes 83 s: far past the 10 s default, still inside the 90 s upload budget.
    expect(seconds * 1000).toBeGreaterThan(BODY_READ_TIMEOUT_MS);
    expect(seconds * 1000).toBeLessThan(UPLOAD_BODY_READ_TIMEOUT_MS);
    expect((await (await result).arrayBuffer()).byteLength).toBe(UPLOAD_BYTES);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses a stalled upload exactly at the upload deadline, not at 10 s", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const input = request(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel }));
    let outcome: unknown = "pending";
    const result = capBody(input, UPLOAD_BYTES, tooLarge, UPLOAD_BODY_READ_TIMEOUT_MS);
    void result.then(() => { outcome = "resolved"; }, (error) => { outcome = error; });
    await vi.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS + 1);
    expect(outcome).toBe("pending");
    await vi.advanceTimersByTimeAsync(UPLOAD_BODY_READ_TIMEOUT_MS - BODY_READ_TIMEOUT_MS - 2);
    expect(outcome).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).rejects.toMatchObject({ status: 408, code: "BODY_READ_TIMEOUT" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is still one absolute deadline: bytes trickling in cannot extend it", async () => {
    vi.useFakeTimers();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const input = request(new ReadableStream({ start(value) { controller = value; } }));
    const result = capBody(input, UPLOAD_BYTES, tooLarge, UPLOAD_BODY_READ_TIMEOUT_MS);
    const denied = expect(result).rejects.toMatchObject({ status: 408, code: "BODY_READ_TIMEOUT" });
    for (let elapsed = 5000; elapsed < UPLOAD_BODY_READ_TIMEOUT_MS; elapsed += 5000) {
      await vi.advanceTimersByTimeAsync(5000);
      controller.enqueue(new Uint8Array([1]));
    }
    await vi.advanceTimersByTimeAsync(5000);
    await denied;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps enforcing the byte cap under the longer deadline", async () => {
    const input = request(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(101)); } }));
    await expect(capBody(input, 100, tooLarge, UPLOAD_BODY_READ_TIMEOUT_MS)).rejects.toBe(tooLarge);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, UPLOAD_BODY_READ_TIMEOUT_MS + 1])(
    "refuses the unbounded or invalid deadline %s before opening the body",
    async (deadline) => {
      const input = request(new ReadableStream({ pull() { return new Promise(() => {}); } }));
      await expect(capBody(input, 100, tooLarge, deadline)).rejects.toBeInstanceOf(RangeError);
      expect(input.body!.locked).toBe(false);
    },
  );
});
