import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type fixture from "./packet.json";

export type Packet = typeof fixture;
export const PACKET_VERSION = "20261003-v2";
export const PACKET_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));

/** Verify the actual bytes before parsing, running trials, or recording any score. */
export function verifyPacket(bytes: Uint8Array, manifest: string) {
  const match = /^([a-f0-9]{64})  packet\.json\r?\n?$/.exec(manifest);
  if (!match) throw new Error("Invalid field packet digest manifest");
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== match[1]) throw new Error("Field packet digest mismatch");
  const packet = JSON.parse(Buffer.from(bytes).toString("utf8")) as Packet;
  if (packet.version !== PACKET_VERSION) throw new Error("Unsupported field packet version");
  return { packet, sha256: actual };
}

export function loadPacket() {
  return verifyPacket(readFileSync(new URL("./packet.json", import.meta.url)), readFileSync(new URL("./SHA256SUMS", import.meta.url), "utf8"));
}
