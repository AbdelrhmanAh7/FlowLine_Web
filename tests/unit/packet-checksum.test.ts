import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPacketChecksum } from "../helpers/packet-checksum";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("verifyPacketChecksum", () => {
  const good = Buffer.from('{"packet":"v2"}');
  const sums = `${sha(Buffer.from("other"))}  packet.json\n${sha(good)}  packet.v2.json\n`;

  it("returns the computed digest when the bytes match the listed checksum", () => {
    expect(verifyPacketChecksum(good, "packet.v2.json", sums)).toBe(sha(good));
  });

  it("throws on a tampered file (bytes differ from the frozen digest)", () => {
    const tampered = Buffer.from('{"packet":"v2","edited":true}');
    expect(() => verifyPacketChecksum(tampered, "packet.v2.json", sums)).toThrow(/SHA256 mismatch/);
  });

  it("throws when the file has no entry in SHA256SUMS", () => {
    expect(() => verifyPacketChecksum(good, "packet.v3.json", sums)).toThrow(/no entry in packet\/SHA256SUMS/);
  });

  it("does not match a different file whose name only ends the same way", () => {
    expect(() => verifyPacketChecksum(good, "v2.json", sums)).toThrow(/no entry/);
  });
});
