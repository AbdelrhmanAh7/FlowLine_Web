import { describe, expect, it } from "vitest";
import { sanitizePacketFileName } from "./file-path-sanitizer";

describe("file-path-sanitizer", () => {
  it("rejects absolute paths", () => {
    expect(sanitizePacketFileName("/etc/passwd")).toBe("packet.json");
    expect(sanitizePacketFileName("/absolute/path/to/file")).toBe("packet.json");
  });

  it("rejects relative paths with parent directory references", () => {
    expect(sanitizePacketFileName("../packet.json")).toBe("packet.json");
    expect(sanitizePacketFileName("../../packet.json")).toBe("packet.json");
    expect(sanitizePacketFileName("./packet.json")).toBe("packet.json");
  });

  it("rejects paths with directory separators", () => {
    expect(sanitizePacketFileName("packet/subdir/file.json")).toBe("packet.json");
    expect(sanitizePacketFileName("packet\\subdir\\file.json")).toBe("packet.json");
  });

  it("rejects paths with null byte", () => {
    expect(sanitizePacketFileName("packet\x00.json")).toBe("packet.json");
  });

  it("rejects paths with special characters that could be used for injection", () => {
    expect(sanitizePacketFileName("packet;rm -rf /;json")).toBe("packet.json");
    expect(sanitizePacketFileName("packet|cat /etc/passwd|json")).toBe("packet.json");
    expect(sanitizePacketFileName("packet&echo hacked&json")).toBe("packet.json");
  });

  it("rejects paths with control characters", () => {
    expect(sanitizePacketFileName("packet\n.json")).toBe("packet.json");
    expect(sanitizePacketFileName("packet\r.json")).toBe("packet.json");
  });

  it("allows valid filenames without path separators", () => {
    expect(sanitizePacketFileName("packet.json")).toBe("packet.json");
    expect(sanitizePacketFileName("packet.v2.json")).toBe("packet.v2.json");
    expect(sanitizePacketFileName("packet123.json")).toBe("packet123.json");
    expect(sanitizePacketFileName("my-packet.json")).toBe("my-packet.json");
  });

  it("rejects empty string", () => {
    expect(sanitizePacketFileName("")).toBe("packet.json");
  });

  it("rejects whitespace-only string", () => {
    expect(sanitizePacketFileName("   ")).toBe("packet.json");
  });

  it("rejects strings that start or end with a dot", () => {
    expect(sanitizePacketFileName(".packet.json")).toBe("packet.json");
    expect(sanitizePacketFileName("packet.json.")).toBe("packet.json");
  });

  it("rejects strings with multiple consecutive dots", () => {
    expect(sanitizePacketFileName("packet..json")).toBe("packet.json");
  });
});
