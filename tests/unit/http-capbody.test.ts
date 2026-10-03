import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BODY_READ_TIMEOUT_MS, capBody, HttpError, parseBody, route } from "@/server/http";

const MB = 1024 * 1024;
const tooLarge = () => new HttpError(413, "SOURCE_TOO_LARGE", "too large");
afterEach(() => vi.useRealTimers());

/** A chunked body (no Content-Length) that counts how much of it was pulled. */
function chunked(totalBytes: number, chunk = 64 * 1024) {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (sent >= totalBytes) return c.close();
      const n = Math.min(chunk, totalBytes - sent);
      sent += n;
      c.enqueue(new Uint8Array(n));
    },
  });
  const req = new Request("http://localhost/upload", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  return { req, pulled: () => sent };
}

// Codex CX3-07: the cap holds for uploads without (or with a false) Content-Length.
describe("capBody", () => {
  it("refuses an over-limit chunked body while streaming, without reading it all", async () => {
    const { req, pulled } = chunked(50 * MB);
    expect(req.headers.get("content-length")).toBeNull();
    await expect(capBody(req, 5 * MB, tooLarge())).rejects.toMatchObject({ status: 413, code: "SOURCE_TOO_LARGE" });
    expect(pulled()).toBeLessThan(6 * MB);
  });

  it("refuses a false (too small) Content-Length", async () => {
    const { req } = chunked(6 * MB);
    const lying = new Request(req, { headers: { "content-length": "10" } });
    await expect(capBody(lying, 5 * MB, tooLarge())).rejects.toMatchObject({ status: 413 });
  });

  it("passes an in-limit multipart body through intact", async () => {
    const form = new FormData();
    form.set("file", new File(["hello knowledge"], "a.txt", { type: "text/plain" }));
    const req = new Request("http://localhost/upload", { method: "POST", body: form });
    const out = await capBody(req, 5 * MB, tooLarge());
    const file = (await out.formData()).get("file") as File;
    expect(file.name).toBe("a.txt");
    expect(await file.text()).toBe("hello knowledge");
  });

  it("rejects declared oversize without opening a body reader", async () => {
    const req = new Request("http://localhost/upload", { method: "POST", body: "small", headers: { "content-length": "100" } });
    const read = vi.spyOn(req.body!, "getReader");
    await expect(capBody(req, 10, tooLarge())).rejects.toMatchObject({ status: 413 });
    expect(read).not.toHaveBeenCalled();
  });

  it("returns 408 for a stalled stream even when cancellation never settles", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ cancel });
    const req = new Request("http://localhost/upload", { method: "POST", body, duplex: "half" } as RequestInit);
    const response = route(async (request: Request) => {
      await parseBody(request, z.object({}));
      return new Response("unexpected success");
    })(req, undefined);
    await vi.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS);
    const result = await response;
    expect(result.status).toBe(408);
    expect(await result.json()).toMatchObject({ error: { code: "BODY_READ_TIMEOUT" } });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not reset the total deadline when bytes keep arriving", async () => {
    vi.useFakeTimers();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel });
    const req = new Request("http://localhost/upload", { method: "POST", body, duplex: "half" } as RequestInit);
    const result = capBody(req, 1024, tooLarge());
    const assertion = expect(result).rejects.toMatchObject({ status: 408, code: "BODY_READ_TIMEOUT" });
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS / 4);
      controller.enqueue(new Uint8Array([32]));
    }
    await vi.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS / 4);
    await assertion;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not await stalled cancellation on byte overflow", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(11)); }, cancel });
    const req = new Request("http://localhost/upload", { method: "POST", body, duplex: "half" } as RequestInit);
    await expect(capBody(req, 10, tooLarge())).rejects.toMatchObject({ status: 413, code: "SOURCE_TOO_LARGE" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });

  it("preserves exact-limit bytes and clears the deadline on success", async () => {
    vi.useFakeTimers();
    const req = new Request("http://localhost/upload", { method: "POST", body: "hello" });
    const out = await capBody(req, 5, tooLarge());
    expect(await out.text()).toBe("hello");
    expect(req.body!.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates stream errors and releases the reader and timer", async () => {
    vi.useFakeTimers();
    const failure = new Error("broken stream");
    const body = new ReadableStream<Uint8Array>({ pull(c) { c.error(failure); } });
    const req = new Request("http://localhost/upload", { method: "POST", body, duplex: "half" } as RequestInit);
    await expect(capBody(req, 10, tooLarge())).rejects.toBe(failure);
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
