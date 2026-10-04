import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type fixture from "./packet.json";

export type Packet = typeof fixture;
export const PACKET_VERSION = "20261003-v2";
export const PACKET_DIRECTORY = resolve("scripts/field-validation/v2");

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

/** `directory` exists so tests can prove the file-reading path rejects a tampered copy; the harness always uses the committed one. */
export function loadPacket(directory = PACKET_DIRECTORY) {
  return verifyPacket(readFileSync(resolve(directory, "packet.json")), readFileSync(resolve(directory, "SHA256SUMS"), "utf8"));
}
