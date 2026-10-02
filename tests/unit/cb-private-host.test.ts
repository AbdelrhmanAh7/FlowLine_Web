import { describe, expect, it } from "vitest";
import { isPrivateIpv4 } from "../../scripts/company-builder/private-host.mjs";

describe("company builder start-private: --private-host check", () => {
  it("accepts canonical RFC 1918 addresses", () => {
    for (const v of ["10.0.0.1", "10.255.255.254", "172.16.0.1", "172.31.255.1", "192.168.1.10"]) expect(isPrivateIpv4(v)).toBe(true);
  });

  it("rejects zero-padded octets even when their decimal value would be private", () => {
    // A resolver may read "016" as octal (172.14.0.1), outside the range this check approved.
    for (const v of ["172.016.0.1", "010.0.0.1", "192.168.001.10", "172.16.0.01"]) expect(isPrivateIpv4(v)).toBe(false);
  });

  it("rejects public, loopback, malformed and non-IPv4 values", () => {
    for (const v of ["8.8.8.8", "172.14.0.1", "172.32.0.1", "192.169.0.1", "127.0.0.1", "0.0.0.0", "10.0.0.256", "10.0.0", "10.0.0.1.1", "::1", "fd00::1", " 10.0.0.1", "10.0.0.1 ", "", "localhost"]) {
      expect(isPrivateIpv4(v)).toBe(false);
    }
    expect(isPrivateIpv4(undefined as unknown as string)).toBe(false);
  });
});
