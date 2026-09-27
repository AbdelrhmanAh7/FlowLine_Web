import { describe, expect, it } from "vitest";
import { capBody, HttpError } from "@/server/http";

const MB = 1024 * 1024;
const tooLarge = () => new HttpError(413, "SOURCE_TOO_LARGE", "too large");

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
});
