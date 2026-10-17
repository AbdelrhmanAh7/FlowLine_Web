import { describe, expect, it } from "vitest";
import { sanitizePacketFileName } from "../helpers/file-path-sanitizer";

describe("file-path-sanitizer", () => {
  it("rejects absolute paths", () => {
    expect(() => sanitizePacketFileName("/etc/passwd")).toThrow(/absolute paths are not allowed/);
    expect(() => sanitizePacketFileName("/absolute/path/to/file")).toThrow(/absolute paths are not allowed/);
  });

  it("rejects relative paths with parent directory references", () => {
    expect(() => sanitizePacketFileName("../packet.json")).toThrow(/parent directory references are not allowed/);
    expect(() => sanitizePacketFileName("../../packet.json")).toThrow(/parent directory references are not allowed/);
    expect(() => sanitizePacketFileName("./packet.json")).toThrow(/directory separators are not allowed/);
  });

  it("rejects paths with directory separators", () => {
    expect(() => sanitizePacketFileName("packet/subdir/file.json")).toThrow(/directory separators are not allowed/);
    expect(() => sanitizePacketFileName("packet\\subdir\\file.json")).toThrow(/directory separators are not allowed/);
  });

  it("rejects paths with null byte", () => {
    expect(() => sanitizePacketFileName("packet\x00.json")).toThrow(/control characters are not allowed/);
  });

  it("rejects paths with special characters that could be used for injection", () => {
    expect(() => sanitizePacketFileName("packet;rm -rf /;json")).toThrow(/shell metacharacters are not allowed/);
    expect(() => sanitizePacketFileName("packet|cat /etc/passwd|json")).toThrow(/shell metacharacters are not allowed/);
    expect(() => sanitizePacketFileName("packet&echo hacked&json")).toThrow(/shell metacharacters are not allowed/);
  });

  it("rejects paths with control characters", () => {
    expect(() => sanitizePacketFileName("packet\n.json")).toThrow(/control characters are not allowed/);
    expect(() => sanitizePacketFileName("packet\r.json")).toThrow(/control characters are not allowed/);
  });

  it("allows valid filenames without path separators", () => {
    expect(sanitizePacketFileName("packet.json")).toBe("packet.json");
    expect(sanitizePacketFileName("packet.v2.json")).toBe("packet.v2.json");
    expect(sanitizePacketFileName("packet123.json")).toBe("packet123.json");
    expect(sanitizePacketFileName("my-packet.json")).toBe("my-packet.json");
    expect(sanitizePacketFileName("p")).toBe("p");
  });

  it("rejects empty string", () => {
    expect(() => sanitizePacketFileName("")).toThrow(/non-empty string/);
  });

  it("rejects whitespace-only string", () => {
    expect(() => sanitizePacketFileName("   ")).toThrow(/non-empty string/);
  });

  it("rejects strings that start or end with a dot, hyphen or underscore", () => {
    expect(() => sanitizePacketFileName(".packet.json")).toThrow(/cannot start or end with punctuation/);
    expect(() => sanitizePacketFileName("packet.json.")).toThrow(/cannot start or end with punctuation/);
    expect(() => sanitizePacketFileName("custom.json.")).toThrow(/cannot start or end with punctuation/);
    expect(() => sanitizePacketFileName("custom.json-")).toThrow(/cannot start or end with punctuation/);
    expect(() => sanitizePacketFileName("custom.json_")).toThrow(/cannot start or end with punctuation/);
  });

  it("rejects strings with multiple consecutive dots", () => {
    expect(() => sanitizePacketFileName("packet..json")).toThrow(/parent directory references are not allowed/);
  });
});
