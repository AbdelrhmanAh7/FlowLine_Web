import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeFetch } from "@/server/egress";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("undici", () => ({
  fetch: fetchMock,
  Agent: class { close() { return Promise.resolve(); } },
}));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubEnv("FLOWLINE_EGRESS_ALLOWLIST", "");
});
afterEach(() => vi.unstubAllEnvs());

function redirect(status: number, location = "https://target.example/result") {
  fetchMock.mockResolvedValueOnce(new Response(null, { status, headers: { location } }));
  fetchMock.mockResolvedValueOnce(new Response("ok"));
}

describe("redirect confidentiality without network requests", () => {
  it.each([["PUT", 301], ["PUT", 302], ["PATCH", 301], ["PATCH", 302], ["POST", 307], ["POST", 308]])(
    "refuses a cross-origin %s/%s retaining a body before making the target request", async (method, status) => {
      redirect(Number(status));
      await expect(safeFetch("https://source.example/start", { method: String(method), body: "synthetic-body-credential" }))
        .rejects.toMatchObject({ code: "EGRESS_REDIRECT_REFUSED" });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each([["GET", 302], ["POST", 302], ["PUT", 303]])("drops ALL supplied headers on a permitted cross-origin %s/%s", async (method, status) => {
    redirect(Number(status));
    const headers = { authorization: "Bearer synthetic", cookie: "session=synthetic", "x-goog-api-key": "synthetic", "x-custom-vendor-credential": "synthetic", "content-type": "text/plain" };
    await safeFetch("https://source.example/start", { method: String(method), headers, ...(method === "GET" ? {} : { body: "synthetic-body-credential" }) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, opts] = fetchMock.mock.calls[1];
    expect(String(url)).toBe("https://target.example/result");
    expect(opts.method).toBe("GET");
    expect(opts.body).toBeNull();
    expect(Object.keys(opts.headers ?? {})).toEqual([]);
    expect(headers["x-goog-api-key"]).toBe("synthetic"); // caller's options stay intact
  });

  it("preserves same-origin PUT bodies and credentials", async () => {
    redirect(302, "/result");
    await safeFetch("https://source.example/start", { method: "PUT", body: "synthetic", headers: { "x-goog-api-key": "synthetic" } });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PUT", body: "synthetic", headers: { "x-goog-api-key": "synthetic" } });
  });

  it("still blocks redirect targets on private addresses before the target request", async () => {
    redirect(302, "https://169.254.169.254/latest/meta-data/");
    await expect(safeFetch("https://source.example/start")).rejects.toMatchObject({ code: "EGRESS_BLOCKED" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
