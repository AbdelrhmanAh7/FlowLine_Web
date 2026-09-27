import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkUrl, EgressError, isPublicAddress, safeFetch } from "@/server/egress";

describe("isPublicAddress", () => {
  it.each([
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.16.0.9", false],
    ["192.168.1.1", false],
    ["169.254.169.254", false], // cloud metadata
    ["100.100.100.200", false], // CGNAT (Alibaba metadata)
    ["0.0.0.0", false],
    ["::1", false],
    ["fd00:ec2::254", false], // AWS IPv6 metadata
    ["fe80::1", false],
    ["::ffff:127.0.0.1", false], // IPv4-mapped loopback
    ["::ffff:169.254.169.254", false],
    ["224.0.0.1", false],
    ["8.8.8.8", true],
    ["1.1.1.1", true],
    ["2606:4700:4700::1111", true],
    ["not-an-ip", false],
  ])("%s → %s", (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });
});

describe("checkUrl", () => {
  it.each([
    "file:///etc/passwd",
    "gopher://example.com",
    "http://example.com/", // plain http not allowlisted
    "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/",
    "https://127.0.0.1:8443/",
    "https://localhost/",
    "https://db.internal/",
    "https://user:pass@example.com/",
  ])("blocks %s", (u) => {
    expect(() => checkUrl(u)).toThrow(EgressError);
  });
  it("allows public https", () => {
    expect(checkUrl("https://example.com/a?b=1").hostname).toBe("example.com");
  });
});

describe("safeFetch against local servers", () => {
  let target: Server;
  let redirector: Server;
  let tPort = 0;
  let rPort = 0;
  const prev = process.env.FLOWLINE_EGRESS_ALLOWLIST;

  beforeAll(async () => {
    target = createServer((_req, res) => res.end("secret-internal"));
    await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
    tPort = (target.address() as AddressInfo).port;
    redirector = createServer((req, res) => {
      if (req.url === "/big") {
        res.end("x".repeat(2048));
        return;
      }
      res.writeHead(302, { location: `http://127.0.0.1:${tPort}/` });
      res.end();
    });
    await new Promise<void>((r) => redirector.listen(0, "127.0.0.1", r));
    rPort = (redirector.address() as AddressInfo).port;
  });
  afterAll(() => {
    target.close();
    redirector.close();
    process.env.FLOWLINE_EGRESS_ALLOWLIST = prev;
  });

  it("refuses a loopback target that is not allowlisted", async () => {
    process.env.FLOWLINE_EGRESS_ALLOWLIST = "";
    await expect(safeFetch(`http://127.0.0.1:${tPort}/`)).rejects.toBeInstanceOf(EgressError);
  });

  it("an allowlisted host cannot be used to redirect into a non-allowlisted internal one", async () => {
    process.env.FLOWLINE_EGRESS_ALLOWLIST = `127.0.0.1:${rPort}`;
    await expect(safeFetch(`http://127.0.0.1:${rPort}/`)).rejects.toMatchObject({ code: "EGRESS_BLOCKED" });
  });

  it("allowlist is exact host:port — a different port on the same host stays blocked", async () => {
    process.env.FLOWLINE_EGRESS_ALLOWLIST = `127.0.0.1:${rPort}`;
    await expect(safeFetch(`http://127.0.0.1:${tPort}/`)).rejects.toBeInstanceOf(EgressError);
  });

  it("caps response size", async () => {
    process.env.FLOWLINE_EGRESS_ALLOWLIST = `127.0.0.1:${rPort}`;
    await expect(safeFetch(`http://127.0.0.1:${rPort}/big`, { maxBytes: 1024 })).rejects.toMatchObject({ code: "EGRESS_TOO_LARGE" });
    const ok = await safeFetch(`http://127.0.0.1:${rPort}/big`, { maxBytes: 4096 });
    expect(ok.text()).toHaveLength(2048);
  });
});
